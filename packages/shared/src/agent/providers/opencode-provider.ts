/**
 * OpenCode SDK Provider Implementation
 * 
 * Implements AgentProvider interface for the OpenCode SDK.
 * Uses session.prompt() + event.subscribe() pattern.
 */

import type { AgentEvent, AgentEventUsage } from '@craft-agent/core/types';
import { debug } from '../../utils/debug.ts';
import type {
  AgentProvider,
  ProviderName,
  ProviderSessionState,
  ProviderTurnRequest,
  ProviderConfig,
  ProviderDependencies,
  ProviderCallbacks,
  ToolPermissionCheck,
  AbortReason,
} from './types.ts';

// OpenCode SDK types - will be fully typed when package is installed
interface OpenCodeClient {
  session: {
    create(opts: { body: { title?: string } }): Promise<{ id: string }>;
    prompt(opts: {
      path: { id: string };
      body: {
        model?: { providerID: string; modelID: string };
        parts: Array<{ type: string; text: string }>;
        noReply?: boolean;
      };
    }): Promise<OpenCodeMessage>;
    abort(opts: { path: { id: string } }): Promise<boolean>;
    delete(opts: { path: { id: string } }): Promise<boolean>;
  };
  event: {
    subscribe(): Promise<{ stream: AsyncIterable<OpenCodeEvent> }>;
  };
  server: {
    url: string;
    close(): void;
  };
}

interface OpenCodeMessage {
  id: string;
  role: 'user' | 'assistant';
  // Additional fields from OpenCode SDK
}

interface OpenCodeEvent {
  type: string;
  properties?: Record<string, unknown>;
}

/**
 * Map OpenCode event to AgentEvent(s)
 */
function mapOpenCodeEvent(event: OpenCodeEvent, turnId?: string): AgentEvent[] {
  const events: AgentEvent[] = [];
  const props = event.properties || {};

  switch (event.type) {
    case 'message.text':
      events.push({
        type: 'text_delta',
        text: String(props.text || ''),
        turnId,
      });
      break;

    case 'message.complete':
      events.push({
        type: 'text_complete',
        text: String(props.text || ''),
        turnId,
      });
      break;

    case 'tool.start':
      events.push({
        type: 'tool_start',
        toolName: String(props.name || 'unknown'),
        toolUseId: String(props.id || `tool-${Date.now()}`),
        input: (props.input as Record<string, unknown>) || {},
        turnId,
      });
      break;

    case 'tool.result':
      events.push({
        type: 'tool_result',
        toolUseId: String(props.id || ''),
        result: String(props.result || ''),
        isError: Boolean(props.isError),
        turnId,
      });
      break;

    case 'error':
      events.push({
        type: 'error',
        message: String(props.message || 'Unknown error'),
      });
      break;

    case 'done':
      // Will be handled by the caller to break the loop
      break;

    default:
      debug(`[OpenCodeProvider] Unhandled event type: ${event.type}`);
  }

  return events;
}

/**
 * OpenCode SDK Provider
 */
export class OpenCodeProvider implements AgentProvider {
  readonly name: ProviderName = 'opencode';

  private config: ProviderConfig;
  private callbacks: ProviderCallbacks;
  private checkToolPermission?: ToolPermissionCheck;
  private sessionId: string | null = null;
  private client: OpenCodeClient | null = null;
  private abortController: AbortController | null = null;
  private isAborted = false;

  constructor(deps: ProviderDependencies) {
    this.config = deps.config;
    this.callbacks = deps.callbacks;
    this.checkToolPermission = deps.checkToolPermission;
    this.sessionId = deps.existingSessionId || null;
  }

  getSessionState(): ProviderSessionState {
    return { sessionId: this.sessionId };
  }

  updateConfig(config: Partial<ProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Initialize the OpenCode client if not already done
   */
  private async ensureClient(): Promise<OpenCodeClient> {
    if (this.client) {
      return this.client;
    }

    try {
      // Dynamic import to avoid build-time dependency issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdk = await import('@opencode-ai/sdk') as any;
      
      // Try to create a full opencode instance (starts server)
      // Fall back to client-only if server isn't needed
      try {
        if (sdk.createOpencode) {
          const opencode = await sdk.createOpencode({
            config: {
              model: this.config.model,
            },
          });
          this.client = opencode as unknown as OpenCodeClient;
        } else {
          throw new Error('createOpencode not available');
        }
      } catch {
        // Fall back to client-only mode (connects to existing server)
        if (sdk.createClient) {
          const client = sdk.createClient({
            baseUrl: this.config.baseUrl || 'http://localhost:4096',
          });
          this.client = client as unknown as OpenCodeClient;
        } else {
          throw new Error('No client creation method available in SDK');
        }
      }

      return this.client;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize OpenCode SDK';
      throw new Error(`OpenCode initialization failed: ${message}`);
    }
  }

  /**
   * Create or get the current session
   */
  private async ensureSession(): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    const client = await this.ensureClient();
    const session = await client.session.create({
      body: { title: 'Craft Agent Session' },
    });

    this.sessionId = session.id;
    this.callbacks.onSessionIdUpdate?.(session.id);

    return session.id;
  }

  async *runTurn(req: ProviderTurnRequest): AsyncGenerator<AgentEvent> {
    this.isAborted = false;
    this.abortController = new AbortController();

    try {
      const client = await this.ensureClient();
      const sessionId = await this.ensureSession();

      // Parse model into provider/model parts
      const [providerID, modelID] = this.parseModel(this.config.model);

      // Inject recovery context if provided
      if (req.recoveryContext && req.recoveryContext.length > 0) {
        for (const msg of req.recoveryContext) {
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              model: { providerID, modelID },
              parts: [{ type: 'text', text: msg.content }],
              noReply: true, // Context injection, no AI response
            },
          });
        }
      }

      // Subscribe to events before sending prompt
      const { stream } = await client.event.subscribe();

      // Send the user message (non-blocking, events come via subscription)
      const promptPromise = client.session.prompt({
        path: { id: sessionId },
        body: {
          model: { providerID, modelID },
          parts: this.buildParts(req),
        },
      });

      // Process events
      const turnId = `turn-${Date.now()}`;
      let usage: AgentEventUsage | undefined;

      for await (const event of stream) {
        if (this.isAborted) {
          break;
        }

        // Map and yield events
        const agentEvents = mapOpenCodeEvent(event, turnId);
        for (const evt of agentEvents) {
          yield evt;
        }

        // Check for completion
        if (event.type === 'done') {
          // Extract usage if available
          if (event.properties?.usage) {
            const u = event.properties.usage as Record<string, number>;
            usage = {
              inputTokens: u.input_tokens || 0,
              outputTokens: u.output_tokens || 0,
            };
          }
          break;
        }

        // Check for errors
        if (event.type === 'error') {
          break;
        }
      }

      // Wait for prompt to complete
      await promptPromise;

      // Yield completion
      yield { type: 'complete', usage };

    } catch (error) {
      if (this.isAborted) {
        // Don't emit error for intentional abort
        yield { type: 'complete' };
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', message: `OpenCode error: ${message}` };
      yield { type: 'complete' };
    }
  }

  abort(reason: AbortReason): void {
    this.isAborted = true;
    this.abortController?.abort();

    // Try to abort the session on the server
    if (this.client && this.sessionId) {
      this.client.session.abort({ path: { id: this.sessionId } }).catch(() => {
        // Ignore abort errors
      });
    }

    this.callbacks.onDebug?.(`OpenCode provider aborted: ${reason}`);
  }

  async dispose(): Promise<void> {
    this.isAborted = true;
    this.abortController?.abort();

    // Close the server if we started one
    if (this.client?.server) {
      this.client.server.close();
    }

    this.client = null;
    this.sessionId = null;
  }

  /**
   * Parse model string into provider/model parts
   * e.g., "anthropic/claude-3-5-sonnet" -> ["anthropic", "claude-3-5-sonnet"]
   */
  private parseModel(model: string): [string, string] {
    const parts = model.split('/');
    if (parts.length >= 2 && parts[0]) {
      return [parts[0], parts.slice(1).join('/')];
    }
    // Default to anthropic if no provider specified
    return ['anthropic', model];
  }

  /**
   * Build message parts from request
   */
  private buildParts(req: ProviderTurnRequest): Array<{ type: string; text: string }> {
    const parts: Array<{ type: string; text: string }> = [];

    // Add user message
    parts.push({ type: 'text', text: req.userMessage });

    // TODO: Handle attachments when OpenCode SDK supports them
    // For now, we could base64 encode images and include in text

    return parts;
  }
}

/**
 * Factory function for creating OpenCode provider
 */
export function createOpenCodeProvider(deps: ProviderDependencies): AgentProvider {
  return new OpenCodeProvider(deps);
}
