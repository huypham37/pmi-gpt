/**
 * Provider abstraction types for agent implementations
 *
 * This module defines the interface for agent providers.
 * Internal use only - OpenCode provider.
 */

import type { AgentEvent } from '@craft-agent/core/types';
import type { FileAttachment } from '../../utils/files.ts';
import type { ThinkingLevel } from '../thinking-levels.ts';

/**
 * Supported provider names
 */
export type ProviderName = 'opencode';

/**
 * Provider-specific session state
 */
export interface ProviderSessionState {
  /** Provider-specific session identifier */
  sessionId: string | null;
}

/**
 * Configuration for initializing a provider
 */
export interface ProviderConfig {
  /** Model identifier (e.g., 'claude-sonnet-4-20250514') */
  model: string;
  /** API key for authentication */
  apiKey: string;
  /** Base URL for API (optional, for custom endpoints) */
  baseUrl?: string;
  /** Working directory for file operations */
  workingDirectory: string;
  /** System prompt to use */
  systemPrompt: string;
  /** Thinking level for extended reasoning */
  thinkingLevel?: ThinkingLevel;
  /** Whether running in headless mode (no interactive tools) */
  isHeadless?: boolean;
}

/**
 * Request payload for a provider turn
 */
export interface ProviderTurnRequest {
  /** The user's message content */
  userMessage: string;
  /** Optional file attachments */
  attachments?: FileAttachment[];
  /** Whether this is a retry of a previous turn */
  isRetry?: boolean;
  /** Recovery context messages for retry after session failure */
  recoveryContext?: Array<{ type: 'user' | 'assistant'; content: string }>;
}

/**
 * Callbacks for provider events
 */
export interface ProviderCallbacks {
  /** Called when the provider session ID is updated */
  onSessionIdUpdate?: (id: string) => void;
  /** Called when the provider session ID is cleared */
  onSessionIdCleared?: () => void;
  /** Called for debug logging */
  onDebug?: (msg: string) => void;
}

/**
 * Reasons for aborting an agent turn
 */
export enum AbortReason {
  /** User manually stopped the agent */
  UserStop = 'user_stop',
  /** A plan was submitted */
  PlanSubmitted = 'plan_submitted',
  /** Authentication is required */
  AuthRequest = 'auth_request',
  /** Redirect to another flow */
  Redirect = 'redirect',
  /** Source was activated */
  SourceActivated = 'source_activated',
}

/**
 * Tool permission check callback
 * Returns true if tool should be allowed, false to block
 */
export type ToolPermissionCheck = (
  toolName: string,
  input: Record<string, unknown>
) => Promise<{ allowed: boolean; reason?: string }>;

/**
 * Dependencies injected into provider at creation
 */
export interface ProviderDependencies {
  /** Provider configuration */
  config: ProviderConfig;
  /** Callbacks for provider events */
  callbacks: ProviderCallbacks;
  /** Tool permission check (for Safe Mode, etc.) */
  checkToolPermission?: ToolPermissionCheck;
  /** Existing session ID to resume */
  existingSessionId?: string | null;
}

/**
 * Interface for agent provider implementations
 */
export interface AgentProvider {
  /** Provider identifier */
  readonly name: ProviderName;

  /**
   * Get the current session state
   * @returns The provider's session state
   */
  getSessionState(): ProviderSessionState;

  /**
   * Update the provider configuration (e.g., model change, thinking level)
   */
  updateConfig(config: Partial<ProviderConfig>): void;

  /**
   * Run a single turn of the agent conversation
   * @param req - The turn request containing user message and options
   * @yields AgentEvent objects representing the turn's progress
   */
  runTurn(req: ProviderTurnRequest): AsyncGenerator<AgentEvent>;

  /**
   * Abort the current turn
   * @param reason - The reason for aborting
   */
  abort(reason: AbortReason): void;

  /**
   * Clean up provider resources
   */
  dispose(): Promise<void> | void;
}

/**
 * Factory function type for creating providers
 */
export type ProviderFactory = (deps: ProviderDependencies) => AgentProvider;
