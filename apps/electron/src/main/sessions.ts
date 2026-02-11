import { app } from 'electron'
import * as Sentry from '@sentry/electron/main'
import { join } from 'path'
import { existsSync } from 'fs'
import { rm, readFile, mkdir } from 'fs/promises'
import { type PermissionMode, type AuthRequest, type AuthResult, type CredentialAuthRequest } from '@craft-agent/shared/agent'
import { ACPClient, ACPSession, PermissionRequest as ACPPermissionRequest, type SessionUpdate, type ToolCall as ACPToolCall } from '@craft-agent/acp-client'
import { ClientCapabilitiesPresets } from '@craft-agent/acp-client'
import { sessionLog, isDebugMode, getLogFilePath } from './logger'
import type { WindowManager } from './window-manager'
import {
  loadStoredConfig,
  getWorkspaces,
  getWorkspaceByNameOrId,
  loadConfigDefaults,
  type Workspace,
} from '@craft-agent/shared/config'
import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces'
import {
  // Session persistence functions
  listSessions as listStoredSessions,
  loadSession as loadStoredSession,
  saveSession as saveStoredSession,
  createSession as createStoredSession,
  deleteSession as deleteStoredSession,
  updateSessionMetadata,
  setPendingPlanExecution as setStoredPendingPlanExecution,
  markCompactionComplete as markStoredCompactionComplete,
  clearPendingPlanExecution as clearStoredPendingPlanExecution,
  getPendingPlanExecution as getStoredPendingPlanExecution,
  getSessionAttachmentsPath,
  getSessionPath as getSessionStoragePath,
  sessionPersistenceQueue,
  type StoredSession,
  type StoredMessage,
  type SessionMetadata,
  type TodoState,
  type AgentProfile,
  profileToMode,
} from '@craft-agent/shared/sessions'
import { loadWorkspaceSources, loadAllSources, getSourcesBySlugs, type LoadedSource, type McpServerConfig, getSourcesNeedingAuth, getSourceCredentialManager, getSourceServerBuilder, type SourceWithCredential, isApiOAuthProvider, SERVER_BUILD_ERRORS } from '@craft-agent/shared/sources'
import { ConfigWatcher, type ConfigWatcherCallbacks } from '@craft-agent/shared/config'
import { getAuthState } from '@craft-agent/shared/auth'
// ACP replaces the SDK agent - these are no longer needed:
// import { setAnthropicOptionsEnv, setPathToClaudeCodeExecutable, setInterceptorPath, setExecutable } from '@craft-agent/shared/agent'
import { getCredentialManager } from '@craft-agent/shared/credentials'
import { CraftMcpClient } from '@craft-agent/shared/mcp'
import { type Session, type Message, type SessionEvent, type FileAttachment, type StoredAttachment, type SendMessageOptions, IPC_CHANNELS, generateMessageId } from '../shared/types'
import { generateSessionTitle, regenerateSessionTitle, formatPathsToRelative, formatToolInputPaths, perf, encodeIconToDataUrl, getEmojiIcon, resetSummarizationClient, resolveToolIcon } from '@craft-agent/shared/utils'
import { loadWorkspaceSkills, type LoadedSkill } from '@craft-agent/shared/skills'
import type { ToolDisplayMeta } from '@craft-agent/core/types'
import { DEFAULT_MODEL, getToolIconsDir, getMode } from '@craft-agent/shared/config'
import { type ThinkingLevel, DEFAULT_THINKING_LEVEL } from '@craft-agent/shared/agent/thinking-levels'
import { evaluateAutoLabels } from '@craft-agent/shared/labels/auto'
import { listLabels } from '@craft-agent/shared/labels/storage'
import { extractLabelId } from '@craft-agent/shared/labels'

/**
 * Sanitize message content for use as session title.
 * Strips XML blocks (e.g. <edit_request>) and normalizes whitespace.
 */
function sanitizeForTitle(content: string): string {
  return content
    .replace(/<edit_request>[\s\S]*?<\/edit_request>/g, '') // Strip entire edit_request blocks
    .replace(/<[^>]+>/g, '')     // Strip remaining XML/HTML tags
    .replace(/\s+/g, ' ')        // Collapse whitespace
    .trim()
}

/**
 * Feature flags for agent behavior
 */
export const AGENT_FLAGS = {
  /** Default modes enabled for new sessions */
  defaultModesEnabled: true,
} as const

/**
 * Build MCP and API servers from sources using the new unified modules.
 * Handles credential loading and server building in one step.
 * When auth errors occur, updates source configs to reflect actual state.
 *
 * @param sources - Sources to build servers for
 * @param sessionPath - Optional path to session folder for saving large API responses
 */
async function buildServersFromSources(sources: LoadedSource[], sessionPath?: string) {
  const span = perf.span('sources.buildServers', { count: sources.length })
  const credManager = getSourceCredentialManager()
  const serverBuilder = getSourceServerBuilder()

  // Load credentials for all sources
  const sourcesWithCreds: SourceWithCredential[] = await Promise.all(
    sources.map(async (source) => ({
      source,
      token: await credManager.getToken(source),
      credential: await credManager.getApiCredential(source),
    }))
  )
  span.mark('credentials.loaded')

  // Build token getter for OAuth sources (Google, Slack, Microsoft use OAuth)
  // Automatically refreshes expired or expiring tokens before API calls
  const getTokenForSource = (source: LoadedSource) => {
    const provider = source.config.provider
    if (isApiOAuthProvider(provider)) {
      return async () => {
        // Load credential with expiry info
        const cred = await credManager.load(source)

        // Refresh if expired or expiring soon (within 5 min)
        if (!cred || credManager.isExpired(cred) || credManager.needsRefresh(cred)) {
          sessionLog.debug(`[OAuth] Refreshing token for ${source.config.slug}`)
          try {
            const token = await credManager.refresh(source)
            if (token) return token
          } catch (err) {
            sessionLog.warn(`[OAuth] Refresh failed for ${source.config.slug}: ${err}`)
          }
        }

        // Use cached token if still valid
        if (cred?.value) return cred.value

        // No valid token after refresh attempt
        throw new Error(`No token for ${source.config.slug}`)
      }
    }
    return undefined
  }

  // Pass sessionPath to enable saving large API responses to session folder
  const result = await serverBuilder.buildAll(sourcesWithCreds, getTokenForSource, sessionPath)
  span.mark('servers.built')
  span.setMetadata('mcpCount', Object.keys(result.mcpServers).length)
  span.setMetadata('apiCount', Object.keys(result.apiServers).length)

  // Update source configs for auth errors so UI reflects actual state
  for (const error of result.errors) {
    if (error.error === SERVER_BUILD_ERRORS.AUTH_REQUIRED) {
      const source = sources.find(s => s.config.slug === error.sourceSlug)
      if (source) {
        credManager.markSourceNeedsReauth(source, 'Token missing or expired')
        sessionLog.info(`Marked source ${error.sourceSlug} as needing re-auth`)
      }
    }
  }

  span.end()
  return result
}

/**
 * Resolve tool display metadata for a tool call.
 * Returns metadata with base64-encoded icon for viewer compatibility.
 *
 * @param toolName - Tool name from the event (e.g., "Skill", "mcp__linear__list_issues")
 * @param toolInput - Tool input (used for Skill tool to get skill identifier)
 * @param workspaceRootPath - Path to workspace for loading skills/sources
 * @param sources - Loaded sources for the workspace
 */
function resolveToolDisplayMeta(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
  workspaceRootPath: string,
  sources: LoadedSource[]
): ToolDisplayMeta | undefined {
  // Check if it's an MCP source tool (format: mcp__<sourceSlug>__<toolName>)
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__')
    if (parts.length >= 2) {
      const sourceSlug = parts[1]
      const source = sources.find(s => s.config.slug === sourceSlug)
      if (source) {
        // Try file-based icon first, fall back to emoji icon from config
        const iconDataUrl = source.iconPath
          ? encodeIconToDataUrl(source.iconPath)
          : getEmojiIcon(source.config.icon)
        return {
          displayName: source.config.name,
          iconDataUrl,
          description: source.config.tagline,
          category: 'source' as const,
        }
      }
    }
    return undefined
  }

  // Check if it's the Skill tool
  if (toolName === 'Skill' && toolInput) {
    // Skill input has 'skill' param with format: "skillSlug" or "workspaceId:skillSlug"
    const skillParam = toolInput.skill as string | undefined
    if (skillParam) {
      // Extract skill slug (remove workspace prefix if present)
      const skillSlug = skillParam.includes(':') ? skillParam.split(':').pop() : skillParam
      if (skillSlug) {
        // Load skills and find the one being invoked
        try {
          const skills = loadWorkspaceSkills(workspaceRootPath)
          const skill = skills.find(s => s.slug === skillSlug)
          if (skill) {
            // Try file-based icon first, fall back to emoji icon from metadata
            const iconDataUrl = skill.iconPath
              ? encodeIconToDataUrl(skill.iconPath)
              : getEmojiIcon(skill.metadata.icon)
            return {
              displayName: skill.metadata.name,
              iconDataUrl,
              description: skill.metadata.description,
              category: 'skill' as const,
            }
          }
        } catch {
          // Skills loading failed, skip
        }
      }
    }
    return undefined
  }

  // CLI tool icon resolution for Bash commands
  // Parses the command string to detect known tools (git, npm, docker, etc.)
  // and resolves their brand icon from ~/.craft-agent/tool-icons/
  if (toolName === 'Bash' && toolInput?.command) {
    const toolIconsDir = getToolIconsDir()
    const match = resolveToolIcon(String(toolInput.command), toolIconsDir)
    if (match) {
      return {
        displayName: match.displayName,
        iconDataUrl: match.iconDataUrl,
        category: 'native' as const,
      }
    }
  }

  // Native tool display names (no icons - UI handles these with built-in icons)
  // This ensures toolDisplayMeta is always populated for consistent display
  const nativeToolNames: Record<string, string> = {
    'Read': 'Read',
    'Write': 'Write',
    'Edit': 'Edit',
    'Bash': 'Terminal',
    'Grep': 'Search',
    'Glob': 'Find Files',
    'Task': 'Agent',
    'WebFetch': 'Fetch URL',
    'WebSearch': 'Web Search',
    'TodoWrite': 'Update Todos',
    'NotebookEdit': 'Edit Notebook',
    'KillShell': 'Kill Shell',
    'TaskOutput': 'Task Output',
  }

  const nativeDisplayName = nativeToolNames[toolName]
  if (nativeDisplayName) {
    return {
      displayName: nativeDisplayName,
      category: 'native' as const,
    }
  }

  // Unknown tool - no display metadata (will fall back to tool name in UI)
  return undefined
}

interface ManagedSession {
  id: string
  workspace: Workspace
  acpSession: ACPSession | null  // Lazy-loaded - null until first message
  messages: Message[]
  isProcessing: boolean
  lastMessageAt: number
  streamingText: string
  // Incremented each time a new message starts processing.
  // Used to detect if a follow-up message has superseded the current one (stale-request guard).
  processingGeneration: number
  // NOTE: Parent-child tracking state (pendingTools, parentToolStack, toolToParentMap,
  // pendingTextParent) has been removed. CraftAgent now provides parentToolUseId
  // directly on all events using the SDK's authoritative parent_tool_use_id field.
  // See: packages/shared/src/agent/tool-matching.ts
  // Session name (user-defined or AI-generated)
  name?: string
  isFlagged: boolean
  /** Permission mode for this session ('safe', 'ask', 'allow-all') */
  permissionMode?: PermissionMode
  // SDK session ID for conversation continuity
  sdkSessionId?: string
  // Token usage for display
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    contextTokens: number
    costUsd: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
    /** Model's context window size in tokens (from SDK modelUsage) */
    contextWindow?: number
  }
  // Todo state (user-controlled) - determines open vs closed
  // Dynamic status ID referencing workspace status config
  todoState?: string
  // Read/unread tracking - ID of last message user has read
  lastReadMessageId?: string
  /**
   * Explicit unread flag - single source of truth for NEW badge.
   * Set to true when assistant message completes while user is NOT viewing.
   * Set to false when user views the session (and not processing).
   */
  hasUnread?: boolean
  // Per-session source selection (slugs of enabled sources)
  enabledSourceSlugs?: string[]
  // Labels applied to this session (additive tags, many-per-session)
  labels?: string[]
  // Working directory for this session (used by agent for bash commands)
  workingDirectory?: string
  // SDK cwd for session storage - set once at creation, never changes.
  // Ensures SDK can find session transcripts regardless of workingDirectory changes.
  sdkCwd?: string
  // Shared viewer URL (if shared via viewer)
  sharedUrl?: string
  // Shared session ID in viewer (for revoke)
  sharedId?: string
  // Model to use for this session (overrides global config if set)
  model?: string
  // Thinking level for this session ('off', 'think', 'max')
  thinkingLevel?: ThinkingLevel
  // System prompt preset for mini agents ('default' | 'mini')
  systemPromptPreset?: 'default' | 'mini' | string
  // Role/type of the last message (for badge display without loading messages)
  lastMessageRole?: 'user' | 'assistant' | 'plan' | 'tool' | 'error'
  // ID of the last final (non-intermediate) assistant message - pre-computed for unread detection
  lastFinalMessageId?: string
  // Whether an async operation is ongoing (sharing, updating share, revoking, title regeneration)
  // Used for shimmer effect on session title
  isAsyncOperationOngoing?: boolean
  // Preview of first user message (for sidebar display fallback)
  preview?: string
  // When the session was first created (ms timestamp from JSONL header)
  createdAt?: number
  // Total message count (pre-computed in JSONL header for fast list loading)
  messageCount?: number
  // Message queue for handling new messages while processing
  // When a message arrives during processing, we interrupt and queue
  messageQueue: Array<{
    message: string
    attachments?: FileAttachment[]
    storedAttachments?: StoredAttachment[]
    options?: SendMessageOptions
    messageId?: string  // Pre-generated ID for matching with UI
  }>
  // Map of shellId -> command for killing background shells
  backgroundShellCommands: Map<string, string>
  // Whether messages have been loaded from disk (for lazy loading)
  messagesLoaded: boolean
  // Pending auth request tracking (for unified auth flow)
  pendingAuthRequestId?: string
  pendingAuthRequest?: AuthRequest
  // Auth retry tracking (for mid-session token expiry)
  // Store last sent message/attachments to enable retry after token refresh
  lastSentMessage?: string
  lastSentAttachments?: FileAttachment[]
  lastSentStoredAttachments?: StoredAttachment[]
  lastSentOptions?: SendMessageOptions
  // Flag to prevent infinite retry loops (reset at start of each sendMessage)
  authRetryAttempted?: boolean
  // Flag indicating auth retry is in progress (to prevent complete handler from interfering)
  authRetryInProgress?: boolean
  // Whether this session is hidden from session list (e.g., mini edit sessions)
  hidden?: boolean
  // Agent profile for this session (chat, agent, testcase) - defaults to 'testcase'
  profile?: AgentProfile
  // Pending ACP permission request (for responding to permission prompts)
  pendingACPPermissionRequest?: ACPPermissionRequest
}

// Convert runtime Message to StoredMessage for persistence
// Only excludes transient field: isStreaming
function messageToStored(msg: Message): StoredMessage {
  return {
    id: msg.id,
    type: msg.role,  // Message uses 'role', StoredMessage uses 'type'
    content: msg.content,
    timestamp: msg.timestamp,
    // Tool fields
    toolName: msg.toolName,
    toolUseId: msg.toolUseId,
    toolInput: msg.toolInput,
    toolResult: msg.toolResult,
    toolStatus: msg.toolStatus,
    toolDuration: msg.toolDuration,
    toolIntent: msg.toolIntent,
    toolDisplayName: msg.toolDisplayName,
    toolDisplayMeta: msg.toolDisplayMeta,  // Includes base64 icon for viewer
    parentToolUseId: msg.parentToolUseId,
    isError: msg.isError,
    attachments: msg.attachments,
    badges: msg.badges,  // Content badges for inline display (sources, skills, context)
    // Turn grouping
    isIntermediate: msg.isIntermediate,
    turnId: msg.turnId,
    // Error display
    errorCode: msg.errorCode,
    errorTitle: msg.errorTitle,
    errorDetails: msg.errorDetails,
    errorOriginal: msg.errorOriginal,
    errorCanRetry: msg.errorCanRetry,
    // Ultrathink
    ultrathink: msg.ultrathink,
    // Auth request fields
    authRequestId: msg.authRequestId,
    authRequestType: msg.authRequestType,
    authSourceSlug: msg.authSourceSlug,
    authSourceName: msg.authSourceName,
    authStatus: msg.authStatus,
    authCredentialMode: msg.authCredentialMode,
    authHeaderName: msg.authHeaderName,
    authLabels: msg.authLabels,
    authDescription: msg.authDescription,
    authHint: msg.authHint,
    authSourceUrl: msg.authSourceUrl,
    authError: msg.authError,
    authEmail: msg.authEmail,
    authWorkspace: msg.authWorkspace,
  }
}

// Convert StoredMessage to runtime Message
function storedToMessage(stored: StoredMessage): Message {
  return {
    id: stored.id,
    role: stored.type,  // StoredMessage uses 'type', Message uses 'role'
    content: stored.content,
    timestamp: stored.timestamp ?? Date.now(),
    // Tool fields
    toolName: stored.toolName,
    toolUseId: stored.toolUseId,
    toolInput: stored.toolInput,
    toolResult: stored.toolResult,
    toolStatus: stored.toolStatus,
    toolDuration: stored.toolDuration,
    toolIntent: stored.toolIntent,
    toolDisplayName: stored.toolDisplayName,
    toolDisplayMeta: stored.toolDisplayMeta,  // Includes base64 icon for viewer
    parentToolUseId: stored.parentToolUseId,
    isError: stored.isError,
    attachments: stored.attachments,
    badges: stored.badges,  // Content badges for inline display (sources, skills, context)
    // Turn grouping
    isIntermediate: stored.isIntermediate,
    turnId: stored.turnId,
    // Error display
    errorCode: stored.errorCode,
    errorTitle: stored.errorTitle,
    errorDetails: stored.errorDetails,
    errorOriginal: stored.errorOriginal,
    errorCanRetry: stored.errorCanRetry,
    // Ultrathink
    ultrathink: stored.ultrathink,
    // Auth request fields
    authRequestId: stored.authRequestId,
    authRequestType: stored.authRequestType,
    authSourceSlug: stored.authSourceSlug,
    authSourceName: stored.authSourceName,
    authStatus: stored.authStatus,
    authCredentialMode: stored.authCredentialMode,
    authHeaderName: stored.authHeaderName,
    authLabels: stored.authLabels,
    authDescription: stored.authDescription,
    authHint: stored.authHint,
    authSourceUrl: stored.authSourceUrl,
    authError: stored.authError,
    authEmail: stored.authEmail,
    authWorkspace: stored.authWorkspace,
  }
}

// Performance: Batch IPC delta events to reduce renderer load
const DELTA_BATCH_INTERVAL_MS = 50  // Flush batched deltas every 50ms

interface PendingDelta {
  delta: string
  turnId?: string
}

export class SessionManager {
  private sessions: Map<string, ManagedSession> = new Map()
  private windowManager: WindowManager | null = null
  /** ACP client for communicating with the OpenCode subprocess */
  private acpClient: ACPClient | null = null
  // Delta batching for performance - reduces IPC events from 50+/sec to ~20/sec
  private pendingDeltas: Map<string, PendingDelta> = new Map()
  private deltaFlushTimers: Map<string, NodeJS.Timeout> = new Map()
  // Config watchers for live updates (sources, etc.) - one per workspace
  private configWatchers: Map<string, ConfigWatcher> = new Map()
  // Pending credential request resolvers (keyed by requestId)
  private pendingCredentialResolvers: Map<string, (response: import('../shared/types').CredentialResponse) => void> = new Map()
  // Promise deduplication for lazy-loading messages (prevents race conditions)
  private messageLoadingPromises: Map<string, Promise<void>> = new Map()
  /**
   * Track which session the user is actively viewing (per workspace).
   * Map of workspaceId -> sessionId. Used to determine if a session should be
   * marked as unread when assistant completes - if user is viewing it, don't mark unread.
   */
  private activeViewingSession: Map<string, string> = new Map()
  setWindowManager(wm: WindowManager): void {
    this.windowManager = wm
  }

  /**
   * Set up ConfigWatcher for a workspace to broadcast live updates
   * (sources added/removed, guide.md changes, etc.)
   * Called during window init (GET_WINDOW_WORKSPACE) and workspace switch.
   * workspaceId must be the global config ID (what the renderer knows).
   */
  setupConfigWatcher(workspaceRootPath: string, workspaceId: string): void {
    // Check if already watching this workspace
    if (this.configWatchers.has(workspaceRootPath)) {
      return // Already watching this workspace
    }

    sessionLog.info(`Setting up ConfigWatcher for workspace: ${workspaceId} (${workspaceRootPath})`)

    const callbacks: ConfigWatcherCallbacks = {
      onSourcesListChange: async (sources: LoadedSource[]) => {
        sessionLog.info(`Sources list changed in ${workspaceRootPath} (${sources.length} sources)`)
        // Broadcast to UI
        this.broadcastSourcesChanged(sources)
        // Reload sources for all sessions in this workspace
        for (const [_, managed] of this.sessions) {
          if (managed.workspace.rootPath === workspaceRootPath) {
            await this.reloadSessionSources(managed)
          }
        }
      },
      onSourceChange: async (slug: string, source: LoadedSource | null) => {
        sessionLog.info(`Source '${slug}' changed:`, source ? 'updated' : 'deleted')
        // Broadcast updated list to UI
        const sources = loadWorkspaceSources(workspaceRootPath)
        this.broadcastSourcesChanged(sources)
        // Reload sources for all sessions in this workspace
        for (const [_, managed] of this.sessions) {
          if (managed.workspace.rootPath === workspaceRootPath) {
            await this.reloadSessionSources(managed)
          }
        }
      },
      onSourceGuideChange: (sourceSlug: string) => {
        sessionLog.info(`Source guide changed: ${sourceSlug}`)
        // Broadcast the updated sources list so sidebar picks up guide changes
        // Note: Guide changes don't require session source reload (no server changes)
        const sources = loadWorkspaceSources(workspaceRootPath)
        this.broadcastSourcesChanged(sources)
      },
      onStatusConfigChange: () => {
        sessionLog.info(`Status config changed in ${workspaceId}`)
        this.broadcastStatusesChanged(workspaceId)
      },
      onStatusIconChange: (_workspaceId: string, iconFilename: string) => {
        sessionLog.info(`Status icon changed: ${iconFilename} in ${workspaceId}`)
        this.broadcastStatusesChanged(workspaceId)
      },
      onLabelConfigChange: () => {
        sessionLog.info(`Label config changed in ${workspaceId}`)
        this.broadcastLabelsChanged(workspaceId)
      },
      onAppThemeChange: (theme) => {
        sessionLog.info(`App theme changed`)
        this.broadcastAppThemeChanged(theme)
      },
      onDefaultPermissionsChange: () => {
        sessionLog.info('Default permissions changed')
        this.broadcastDefaultPermissionsChanged()
      },
      onSkillsListChange: async (skills) => {
        sessionLog.info(`Skills list changed in ${workspaceRootPath} (${skills.length} skills)`)
        this.broadcastSkillsChanged(skills)
      },
      onSkillChange: async (slug, skill) => {
        sessionLog.info(`Skill '${slug}' changed:`, skill ? 'updated' : 'deleted')
        // Broadcast updated list to UI
        const { loadWorkspaceSkills } = await import('@craft-agent/shared/skills')
        const skills = loadWorkspaceSkills(workspaceRootPath)
        this.broadcastSkillsChanged(skills)
      },

      // Session metadata changes (external edits to session.jsonl headers).
      // Detects label/flag/name/todoState changes made by other instances or scripts.
      // Compares with in-memory state and only emits events for actual differences.
      onSessionMetadataChange: (sessionId, header) => {
        const managed = this.sessions.get(sessionId)
        if (!managed) return

        // Skip if session is currently processing — in-memory state is authoritative during streaming
        if (managed.isProcessing) return

        let changed = false

        // Labels
        const oldLabels = JSON.stringify(managed.labels ?? [])
        const newLabels = JSON.stringify(header.labels ?? [])
        if (oldLabels !== newLabels) {
          managed.labels = header.labels
          this.sendEvent({ type: 'labels_changed', sessionId, labels: header.labels ?? [] }, managed.workspace.id)
          changed = true
        }

        // Flagged
        if ((managed.isFlagged ?? false) !== (header.isFlagged ?? false)) {
          managed.isFlagged = header.isFlagged ?? false
          this.sendEvent(
            { type: header.isFlagged ? 'session_flagged' : 'session_unflagged', sessionId },
            managed.workspace.id
          )
          changed = true
        }

        // Todo state
        if (managed.todoState !== header.todoState) {
          managed.todoState = header.todoState
          this.sendEvent({ type: 'todo_state_changed', sessionId, todoState: header.todoState ?? '' }, managed.workspace.id)
          changed = true
        }

        // Name
        if (managed.name !== header.name) {
          managed.name = header.name
          this.sendEvent({ type: 'name_changed', sessionId, name: header.name }, managed.workspace.id)
          changed = true
        }

        if (changed) {
          sessionLog.info(`External metadata change detected for session ${sessionId}`)
        }
      },
    }

    const watcher = new ConfigWatcher(workspaceRootPath, callbacks)
    watcher.start()
    this.configWatchers.set(workspaceRootPath, watcher)
  }

  /**
   * Broadcast sources changed event to all windows
   */
  private broadcastSourcesChanged(sources: LoadedSource[]): void {
    if (!this.windowManager) return

    this.windowManager.broadcastToAll(IPC_CHANNELS.SOURCES_CHANGED, sources)
  }

  /**
   * Broadcast statuses changed event to all windows
   */
  private broadcastStatusesChanged(workspaceId: string): void {
    if (!this.windowManager) return
    sessionLog.info(`Broadcasting statuses changed for ${workspaceId}`)
    this.windowManager.broadcastToAll(IPC_CHANNELS.STATUSES_CHANGED, workspaceId)
  }

  /**
   * Broadcast labels changed event to all windows
   */
  private broadcastLabelsChanged(workspaceId: string): void {
    if (!this.windowManager) return
    sessionLog.info(`Broadcasting labels changed for ${workspaceId}`)
    this.windowManager.broadcastToAll(IPC_CHANNELS.LABELS_CHANGED, workspaceId)
  }

  /**
   * Broadcast app theme changed event to all windows
   */
  private broadcastAppThemeChanged(theme: import('@craft-agent/shared/config').ThemeOverrides | null): void {
    if (!this.windowManager) return
    sessionLog.info(`Broadcasting app theme changed`)
    this.windowManager.broadcastToAll(IPC_CHANNELS.THEME_APP_CHANGED, theme)
  }

  /**
   * Broadcast skills changed event to all windows
   */
  private broadcastSkillsChanged(skills: import('@craft-agent/shared/skills').LoadedSkill[]): void {
    if (!this.windowManager) return
    sessionLog.info(`Broadcasting skills changed (${skills.length} skills)`)
    this.windowManager.broadcastToAll(IPC_CHANNELS.SKILLS_CHANGED, skills)
  }

  /**
   * Broadcast default permissions changed event to all windows
   * Triggered when ~/.craft-agent/permissions/default.json changes
   */
  private broadcastDefaultPermissionsChanged(): void {
    if (!this.windowManager) return
    sessionLog.info('Broadcasting default permissions changed')
    this.windowManager.broadcastToAll(IPC_CHANNELS.DEFAULT_PERMISSIONS_CHANGED, null)
  }

  /**
   * Reload sources for a session with an active agent.
   * Called by ConfigWatcher when source files change on disk.
   * If agent is null (session hasn't sent any messages), skip - fresh build happens on next message.
   */
  private async reloadSessionSources(managed: ManagedSession): Promise<void> {
    // ACP: Sources are managed by the server, no client-side reload needed
    sessionLog.info(`Source reload requested for session ${managed.id} (no-op with ACP)`)
  }

  /**
   * Reinitialize authentication environment variables.
   * Call this after onboarding or settings changes to pick up new credentials.
   *
   * SECURITY NOTE: These env vars are propagated to the SDK subprocess via options.ts.
   * Bun's automatic .env loading is disabled in the subprocess (--env-file=/dev/null)
   * to prevent a user's project .env from injecting ANTHROPIC_API_KEY and overriding
   * OAuth auth — Claude Code prioritizes API key over OAuth token when both are set.
   * See: https://github.com/lukilabs/craft-agents-oss/issues/39
   */
  async reinitializeAuth(): Promise<void> {
    try {
      const authState = await getAuthState()
      const { billing } = authState
      const customBaseUrl = null

      sessionLog.info('Reinitializing auth with billing type:', billing.type, customBaseUrl ? `(custom base URL: ${customBaseUrl})` : '')

      // Priority 1: Custom base URL (Ollama, OpenRouter, etc.)
      // Third-party endpoints require API key auth — OAuth tokens won't work
      if (customBaseUrl) {
        process.env.ANTHROPIC_BASE_URL = customBaseUrl
        delete process.env.CLAUDE_CODE_OAUTH_TOKEN

        if (billing.apiKey) {
          process.env.ANTHROPIC_API_KEY = billing.apiKey
          sessionLog.info(`Using custom provider at ${customBaseUrl}`)
        } else {
          // Set a placeholder key for providers like Ollama that don't validate keys
          process.env.ANTHROPIC_API_KEY = 'not-needed'
          sessionLog.warn('Custom base URL configured but no API key set. Using placeholder key (works for Ollama, will fail for OpenRouter).')
        }
      } else if (billing.type === 'oauth_token' && billing.claudeOAuthToken) {
        // Priority 2: Claude Max subscription via OAuth token (direct Anthropic only)
        process.env.CLAUDE_CODE_OAUTH_TOKEN = billing.claudeOAuthToken
        delete process.env.ANTHROPIC_API_KEY
        delete process.env.ANTHROPIC_BASE_URL
        sessionLog.info('Set Claude Max OAuth Token')
      } else if (billing.apiKey) {
        // Priority 3: API key with default Anthropic endpoint
        process.env.ANTHROPIC_API_KEY = billing.apiKey
        delete process.env.CLAUDE_CODE_OAUTH_TOKEN
        delete process.env.ANTHROPIC_BASE_URL
        sessionLog.info('Set Anthropic API Key')
      } else {
        sessionLog.error('No authentication configured!')
      }

      // Reset cached summarization client so it picks up new credentials/base URL
      resetSummarizationClient()
    } catch (error) {
      sessionLog.error('Failed to reinitialize auth:', error)
      throw error
    }
  }

  async initialize(): Promise<void> {
    sessionLog.info('[STARTUP-DEBUG] SessionManager.initialize() started')
    const basePath = app.isPackaged ? app.getAppPath() : process.cwd()

    // Resolve the OpenCode executable for the ACP subprocess
    // In development: use the opencode binary from node_modules or PATH
    const opencodeBin = process.platform === 'win32' ? 'opencode.exe' : 'opencode'
    let opencodeExecutable = opencodeBin  // Fallback to PATH

    if (app.isPackaged) {
      const bunBinary = process.platform === 'win32' ? 'bun.exe' : 'bun'
      const bunBasePath = process.platform === 'win32' ? process.resourcesPath : basePath
      const bunPath = join(bunBasePath, 'vendor', 'bun', bunBinary)
      if (existsSync(bunPath)) {
        opencodeExecutable = bunPath
      }
    }

    sessionLog.info(`[STARTUP-DEBUG] OpenCode executable resolved to: ${opencodeExecutable}`)

    // Create and start the ACP client
    // Default working directory to a temp directory in project root
    const defaultCwd = join(__dirname, '..', '..', 'temp-workspace')
    
    // Create the temp workspace directory if it doesn't exist
    if (!existsSync(defaultCwd)) {
      await mkdir(defaultCwd, { recursive: true })
      sessionLog.info(`Created temp workspace directory: ${defaultCwd}`)
    }
    
    sessionLog.info(`[STARTUP-DEBUG] Creating ACPClient with cwd: ${defaultCwd}`)
    this.acpClient = new ACPClient({
      executable: opencodeExecutable,
      arguments: ['acp'],
      workingDirectory: defaultCwd,
      clientInfo: {
        name: 'craft-agent',
        title: 'Craft Agents',
        version: app.getVersion(),
      },
      capabilities: ClientCapabilitiesPresets.full,
    })

    try {
      sessionLog.info('[STARTUP-DEBUG] Calling acpClient.start()...')
      const acpStartTime = Date.now()
      await this.acpClient.start()
      sessionLog.info(`[STARTUP-DEBUG] acpClient.start() completed in ${Date.now() - acpStartTime}ms`)
      sessionLog.info('ACP client started successfully')
      sessionLog.info('Agent info:', JSON.stringify(this.acpClient.agentInfo))
    } catch (error) {
      sessionLog.error('[STARTUP-DEBUG] acpClient.start() FAILED:', error)
      sessionLog.error('Failed to start ACP client:', error)
      // Don't throw - allow app to start even if ACP subprocess fails
      // Users will see errors when they try to send messages
    }

    // Load existing sessions from disk
    sessionLog.info('[STARTUP-DEBUG] Loading sessions from disk...')
    const loadStart = Date.now()
    this.loadSessionsFromDisk()
    sessionLog.info(`[STARTUP-DEBUG] loadSessionsFromDisk() completed in ${Date.now() - loadStart}ms, sessions count: ${this.sessions.size}`)
  }

  // Load all existing sessions from disk into memory (metadata only - messages are lazy-loaded)
  private loadSessionsFromDisk(): void {
    try {
      const workspaces = getWorkspaces()
      let totalSessions = 0

      // Iterate over each workspace and load its sessions
      for (const workspace of workspaces) {
        const workspaceRootPath = workspace.rootPath
        const sessionMetadata = listStoredSessions(workspaceRootPath)
        // Load workspace config once per workspace for default working directory
        const wsConfig = loadWorkspaceConfig(workspaceRootPath)
        const wsDefaultWorkingDir = wsConfig?.defaults?.workingDirectory

        for (const meta of sessionMetadata) {
          // Create managed session from metadata only (messages lazy-loaded on demand)
          // This dramatically reduces memory usage at startup - messages are loaded
          // when getSession() is called for a specific session
          const managed: ManagedSession = {
            id: meta.id,
            workspace,
            acpSession: null,  // Lazy-load ACP session when needed
            messages: [],  // Lazy-load messages when needed
            isProcessing: false,
            lastMessageAt: meta.lastMessageAt ?? meta.lastUsedAt,  // Fallback for sessions saved before lastMessageAt was persisted
            streamingText: '',
            processingGeneration: 0,
            name: meta.name,
            preview: meta.preview,
            createdAt: meta.createdAt,
            messageCount: meta.messageCount,
            isFlagged: meta.isFlagged ?? false,
            permissionMode: meta.permissionMode,
            sdkSessionId: meta.sdkSessionId,
            tokenUsage: meta.tokenUsage,  // From JSONL header (updated on save)
            todoState: meta.todoState,
            lastReadMessageId: meta.lastReadMessageId,  // Pre-computed for unread detection
            lastFinalMessageId: meta.lastFinalMessageId,  // Pre-computed for unread detection
            hasUnread: meta.hasUnread,  // Explicit unread flag for NEW badge state machine
            enabledSourceSlugs: undefined,  // Loaded with messages
            labels: meta.labels,
            workingDirectory: meta.workingDirectory ?? wsDefaultWorkingDir,
            sdkCwd: meta.sdkCwd,
            model: meta.model,
            thinkingLevel: meta.thinkingLevel,
            lastMessageRole: meta.lastMessageRole,
            messageQueue: [],
            backgroundShellCommands: new Map(),
            messagesLoaded: false,  // Mark as not loaded
            // Shared viewer state - loaded from metadata for persistence across restarts
            sharedUrl: meta.sharedUrl,
            sharedId: meta.sharedId,
            hidden: meta.hidden,
            profile: meta.profile,
          }

          this.sessions.set(meta.id, managed)
          totalSessions++
        }
      }

      sessionLog.info(`Loaded ${totalSessions} sessions from disk (metadata only)`)
    } catch (error) {
      sessionLog.error('Failed to load sessions from disk:', error)
    }
  }

  // Persist a session to disk (async with debouncing)
  private persistSession(managed: ManagedSession): void {
    try {
      // Filter out transient status messages (progress indicators like "Compacting...")
      // Error messages are now persisted with rich fields for diagnostics
      const persistableMessages = managed.messages.filter(m =>
        m.role !== 'status'
      )

      const workspaceRootPath = managed.workspace.rootPath
      const storedSession: StoredSession = {
        id: managed.id,
        workspaceRootPath,
        name: managed.name,
        createdAt: managed.lastMessageAt,  // Approximate, will be overwritten if already exists
        lastUsedAt: Date.now(),
        lastMessageAt: managed.lastMessageAt,  // Preserve actual message time (not persist time)
        sdkSessionId: managed.sdkSessionId,
        isFlagged: managed.isFlagged,
        permissionMode: managed.permissionMode,
        todoState: managed.todoState,
        lastReadMessageId: managed.lastReadMessageId,  // For unread detection
        hasUnread: managed.hasUnread,  // Explicit unread flag for NEW badge state machine
        enabledSourceSlugs: managed.enabledSourceSlugs,
        labels: managed.labels,
        workingDirectory: managed.workingDirectory,
        sdkCwd: managed.sdkCwd,
        thinkingLevel: managed.thinkingLevel,
        messages: persistableMessages.map(messageToStored),
        tokenUsage: managed.tokenUsage ?? {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          contextTokens: 0,
          costUsd: 0,
        },
        hidden: managed.hidden,
        profile: managed.profile,
      }

      // Queue for async persistence with debouncing
      sessionPersistenceQueue.enqueue(storedSession)
    } catch (error) {
      sessionLog.error(`Failed to queue session ${managed.id} for persistence:`, error)
    }
  }

  // Flush a specific session immediately (call on session close/switch)
  async flushSession(sessionId: string): Promise<void> {
    await sessionPersistenceQueue.flush(sessionId)
  }

  // Flush all pending sessions (call on app quit)
  async flushAllSessions(): Promise<void> {
    await sessionPersistenceQueue.flushAll()
  }

  // ============================================
  // Unified Auth Request Helpers
  // ============================================

  /**
   * Get human-readable description for auth request
   */
  private getAuthRequestDescription(request: AuthRequest): string {
    switch (request.type) {
      case 'credential':
        return `Authentication required for ${request.sourceName}`
      case 'oauth':
        return `OAuth authentication for ${request.sourceName}`
      case 'oauth-google':
        return `Sign in with Google for ${request.sourceName}`
      case 'oauth-slack':
        return `Sign in with Slack for ${request.sourceName}`
      case 'oauth-microsoft':
        return `Sign in with Microsoft for ${request.sourceName}`
    }
  }

  /**
   * Format auth result message to send back to agent
   */
  private formatAuthResultMessage(result: AuthResult): string {
    if (result.success) {
      let msg = `Authentication completed for ${result.sourceSlug}.`
      if (result.email) msg += ` Signed in as ${result.email}.`
      if (result.workspace) msg += ` Connected to workspace: ${result.workspace}.`
      msg += ' Credentials have been saved.'
      return msg
    }
    if (result.cancelled) {
      return `Authentication cancelled for ${result.sourceSlug}.`
    }
    return `Authentication failed for ${result.sourceSlug}: ${result.error || 'Unknown error'}`
  }

  /**
   * Run OAuth flow for a given auth request (non-credential types)
   * Called after forceAbort to execute the OAuth flow asynchronously
   */
  private async runOAuthFlow(managed: ManagedSession, request: AuthRequest): Promise<void> {
    if (request.type === 'credential') return // Credentials handled by UI

    sessionLog.info(`Running OAuth flow for ${request.sourceSlug} (type: ${request.type})`)

    // Find the source in workspace sources
    const sources = loadWorkspaceSources(managed.workspace.rootPath)
    const source = sources.find(s => s.config.slug === request.sourceSlug)

    if (!source) {
      sessionLog.error(`Source ${request.sourceSlug} not found for OAuth`)
      await this.completeAuthRequest(managed.id, {
        requestId: request.requestId,
        sourceSlug: request.sourceSlug,
        success: false,
        error: `Source ${request.sourceSlug} not found`,
      })
      return
    }

    // Get credential manager and run OAuth
    const credManager = getSourceCredentialManager()

    try {
      const result = await credManager.authenticate(source, {
        onStatus: (msg) => sessionLog.info(`[OAuth ${request.sourceSlug}] ${msg}`),
        onError: (err) => sessionLog.error(`[OAuth ${request.sourceSlug}] ${err}`),
      })

      if (result.success) {
        await this.completeAuthRequest(managed.id, {
          requestId: request.requestId,
          sourceSlug: request.sourceSlug,
          success: true,
          email: result.email,
        })
      } else {
        await this.completeAuthRequest(managed.id, {
          requestId: request.requestId,
          sourceSlug: request.sourceSlug,
          success: false,
          error: result.error,
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      sessionLog.error(`OAuth flow failed for ${request.sourceSlug}:`, errorMessage)
      await this.completeAuthRequest(managed.id, {
        requestId: request.requestId,
        sourceSlug: request.sourceSlug,
        success: false,
        error: errorMessage,
      })
    }
  }

  /**
   * Start OAuth flow for a pending auth request (called when user clicks "Sign in")
   * This is the user-initiated trigger - OAuth no longer starts automatically
   */
  async startSessionOAuth(sessionId: string, requestId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      sessionLog.warn(`Cannot start OAuth - session ${sessionId} not found`)
      return
    }

    // Find the pending auth request
    if (managed.pendingAuthRequestId !== requestId || !managed.pendingAuthRequest) {
      sessionLog.warn(`Cannot start OAuth - no pending request with id ${requestId}`)
      return
    }

    const request = managed.pendingAuthRequest
    if (request.type === 'credential') {
      sessionLog.warn(`Cannot start OAuth for credential request`)
      return
    }

    // Run the OAuth flow
    await this.runOAuthFlow(managed, request)
  }

  /**
   * Complete an auth request and send result back to agent
   * This updates the auth message status and sends a faked user message
   */
  async completeAuthRequest(sessionId: string, result: AuthResult): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      sessionLog.warn(`Cannot complete auth request - session ${sessionId} not found`)
      return
    }

    // Find and update the pending auth-request message
    const authMessage = managed.messages.find(m =>
      m.role === 'auth-request' &&
      m.authRequestId === result.requestId &&
      m.authStatus === 'pending'
    )

    if (authMessage) {
      authMessage.authStatus = result.success ? 'completed' :
                               result.cancelled ? 'cancelled' : 'failed'
      authMessage.authError = result.error
      authMessage.authEmail = result.email
      authMessage.authWorkspace = result.workspace
    }

    // Emit auth_completed event to update UI
    this.sendEvent({
      type: 'auth_completed',
      sessionId,
      requestId: result.requestId,
      success: result.success,
      cancelled: result.cancelled,
      error: result.error,
    }, managed.workspace.id)

    // Create faked user message with result
    const resultContent = this.formatAuthResultMessage(result)

    // Clear pending auth state
    managed.pendingAuthRequestId = undefined
    managed.pendingAuthRequest = undefined

    // Persist session with updated auth message
    this.persistSession(managed)

    // Send the result as a new message to resume conversation
    // Use empty arrays for attachments since this is a system-generated message
    await this.sendMessage(sessionId, resultContent, [], [], {})

    sessionLog.info(`Auth request completed for ${result.sourceSlug}: ${result.success ? 'success' : 'failed'}`)
  }

  /**
   * Handle credential input from the UI (for non-OAuth auth)
   * Called when user submits credentials via the inline form
   */
  async handleCredentialInput(
    sessionId: string,
    requestId: string,
    response: import('../shared/types').CredentialResponse
  ): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed?.pendingAuthRequest) {
      sessionLog.warn(`Cannot handle credential input - no pending auth request for session ${sessionId}`)
      return
    }

    const request = managed.pendingAuthRequest as CredentialAuthRequest
    if (request.requestId !== requestId) {
      sessionLog.warn(`Credential request ID mismatch: expected ${request.requestId}, got ${requestId}`)
      return
    }

    if (response.cancelled) {
      await this.completeAuthRequest(sessionId, {
        requestId,
        sourceSlug: request.sourceSlug,
        success: false,
        cancelled: true,
      })
      return
    }

    try {
      // Store credentials using existing workspace ID extraction pattern
      const credManager = getCredentialManager()
      // Extract workspace ID from root path (last segment of path)
      const wsId = managed.workspace.rootPath.split('/').pop() || managed.workspace.id

      if (request.mode === 'basic') {
        // Store value as JSON string {username, password} - credential-manager.ts parses it for basic auth
        await credManager.set(
          { type: 'source_basic', workspaceId: wsId, sourceId: request.sourceSlug },
          { value: JSON.stringify({ username: response.username, password: response.password }) }
        )
      } else if (request.mode === 'bearer') {
        await credManager.set(
          { type: 'source_bearer', workspaceId: wsId, sourceId: request.sourceSlug },
          { value: response.value! }
        )
      } else {
        // header or query - both use API key storage
        await credManager.set(
          { type: 'source_apikey', workspaceId: wsId, sourceId: request.sourceSlug },
          { value: response.value! }
        )
      }

      // Update source config to mark as authenticated
      const { markSourceAuthenticated } = await import('@craft-agent/shared/sources')
      markSourceAuthenticated(managed.workspace.rootPath, request.sourceSlug)

      // ACP: Source guide management handled by server

      await this.completeAuthRequest(sessionId, {
        requestId,
        sourceSlug: request.sourceSlug,
        success: true,
      })
    } catch (error) {
      sessionLog.error(`Failed to save credentials for ${request.sourceSlug}:`, error)
      await this.completeAuthRequest(sessionId, {
        requestId,
        sourceSlug: request.sourceSlug,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save credentials',
      })
    }
  }

  getWorkspaces(): Workspace[] {
    return getWorkspaces()
  }

  /**
   * Reload all sessions from disk.
   * Used after importing sessions to refresh the in-memory session list.
   */
  reloadSessions(): void {
    this.loadSessionsFromDisk()
  }

  getSessions(): Session[] {
    // Returns session metadata only - messages are NOT included to save memory
    // Use getSession(id) to load messages for a specific session
    return Array.from(this.sessions.values())
      .map(m => ({
        id: m.id,
        workspaceId: m.workspace.id,
        workspaceName: m.workspace.name,
        name: m.name,
        preview: m.preview,
        lastMessageAt: m.lastMessageAt,
        messages: [],  // Never send all messages - use getSession(id) for specific session
        isProcessing: m.isProcessing,
        isFlagged: m.isFlagged,
        permissionMode: m.permissionMode,
        thinkingLevel: m.thinkingLevel,
        todoState: m.todoState,
        lastReadMessageId: m.lastReadMessageId,
        lastFinalMessageId: m.lastFinalMessageId,
        hasUnread: m.hasUnread,  // Explicit unread flag for NEW badge state machine
        workingDirectory: m.workingDirectory,
        model: m.model,
        enabledSourceSlugs: m.enabledSourceSlugs,
        labels: m.labels,
        sharedUrl: m.sharedUrl,
        sharedId: m.sharedId,
        lastMessageRole: m.lastMessageRole,
        tokenUsage: m.tokenUsage,
        createdAt: m.createdAt,
        messageCount: m.messageCount,
        hidden: m.hidden,
      }))
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
  }

  /**
   * Get a single session by ID with all messages loaded.
   * Used for lazy loading session messages when session is selected.
   * Messages are loaded from disk on first access to reduce memory usage.
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const m = this.sessions.get(sessionId)
    if (!m) return null

    // Lazy-load messages from disk if not yet loaded
    await this.ensureMessagesLoaded(m)

    return {
      id: m.id,
      workspaceId: m.workspace.id,
      workspaceName: m.workspace.name,
      name: m.name,
      preview: m.preview,  // Include preview for title fallback consistency with getSessions()
      lastMessageAt: m.lastMessageAt,
      messages: m.messages,
      isProcessing: m.isProcessing,
      isFlagged: m.isFlagged,
      permissionMode: m.permissionMode,
      thinkingLevel: m.thinkingLevel,
      todoState: m.todoState,
      lastReadMessageId: m.lastReadMessageId,
      lastFinalMessageId: m.lastFinalMessageId,
      hasUnread: m.hasUnread,  // Explicit unread flag for NEW badge state machine
      workingDirectory: m.workingDirectory,
      model: m.model,
      sessionFolderPath: getSessionStoragePath(m.workspace.rootPath, m.id),
      enabledSourceSlugs: m.enabledSourceSlugs,
      labels: m.labels,
      sharedUrl: m.sharedUrl,
      sharedId: m.sharedId,
      lastMessageRole: m.lastMessageRole,
      tokenUsage: m.tokenUsage,
      hidden: m.hidden,
    }
  }

  /**
   * Ensure messages are loaded for a managed session.
   * Uses promise deduplication to prevent race conditions when multiple
   * concurrent calls (e.g., rapid session switches + message send) try
   * to load messages simultaneously.
   */
  private async ensureMessagesLoaded(managed: ManagedSession): Promise<void> {
    if (managed.messagesLoaded) return

    // Deduplicate concurrent loads - return existing promise if already loading
    const existingPromise = this.messageLoadingPromises.get(managed.id)
    if (existingPromise) {
      return existingPromise
    }

    const loadPromise = this.loadMessagesFromDisk(managed)
    this.messageLoadingPromises.set(managed.id, loadPromise)

    try {
      await loadPromise
    } finally {
      this.messageLoadingPromises.delete(managed.id)
    }
  }

  /**
   * Internal: Load messages from disk storage into the managed session.
   */
  private async loadMessagesFromDisk(managed: ManagedSession): Promise<void> {
    const storedSession = loadStoredSession(managed.workspace.rootPath, managed.id)
    if (storedSession) {
      managed.messages = (storedSession.messages || []).map(storedToMessage)
      managed.tokenUsage = storedSession.tokenUsage
      managed.lastReadMessageId = storedSession.lastReadMessageId
      managed.hasUnread = storedSession.hasUnread  // Explicit unread flag for NEW badge state machine
      managed.enabledSourceSlugs = storedSession.enabledSourceSlugs
      managed.sharedUrl = storedSession.sharedUrl
      managed.sharedId = storedSession.sharedId
      // Sync name from disk - ensures title persistence across lazy loading
      managed.name = storedSession.name
      sessionLog.debug(`Lazy-loaded ${managed.messages.length} messages for session ${managed.id}`)
    }
    managed.messagesLoaded = true
  }

  /**
   * Get the filesystem path to a session's folder
   */
  getSessionPath(sessionId: string): string | null {
    const managed = this.sessions.get(sessionId)
    if (!managed) return null
    return getSessionStoragePath(managed.workspace.rootPath, sessionId)
  }

  async createSession(workspaceId: string, options?: import('../shared/types').CreateSessionOptions): Promise<Session> {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`)
    }

    // Get new session defaults from workspace config (with global fallback)
    // Options.permissionMode overrides the workspace default (used by EditPopover for auto-execute)
    const workspaceRootPath = workspace.rootPath
    const wsConfig = loadWorkspaceConfig(workspaceRootPath)
    const globalDefaults = loadConfigDefaults()

    // Read permission mode from workspace config, fallback to global defaults
    const defaultPermissionMode = options?.permissionMode
      ?? wsConfig?.defaults?.permissionMode
      ?? globalDefaults.workspaceDefaults.permissionMode

    const userDefaultWorkingDir = wsConfig?.defaults?.workingDirectory || undefined
    // Get default thinking level from workspace config, fallback to global defaults
    const defaultThinkingLevel = wsConfig?.defaults?.thinkingLevel ?? globalDefaults.workspaceDefaults.thinkingLevel
    // Get default model from workspace config (used when no session-specific model is set)
    const defaultModel = wsConfig?.defaults?.model

    // Resolve working directory from options:
    // - 'user_default' or undefined: Use workspace's configured default
    // - 'none': No working directory (empty string means session folder only)
    // - Absolute path: Use as-is
    let resolvedWorkingDir: string | undefined
    if (options?.workingDirectory === 'none') {
      resolvedWorkingDir = undefined  // No working directory
    } else if (options?.workingDirectory === 'user_default' || options?.workingDirectory === undefined) {
      resolvedWorkingDir = userDefaultWorkingDir
    } else {
      resolvedWorkingDir = options.workingDirectory
    }

    // Use storage layer to create and persist the session
    const storedSession = await createStoredSession(workspaceRootPath, {
      permissionMode: defaultPermissionMode,
      workingDirectory: resolvedWorkingDir,
      hidden: options?.hidden,
      todoState: options?.todoState,
      labels: options?.labels,
      isFlagged: options?.isFlagged,
    })

    // Model priority: options.model > storedSession.model > workspace default
    const resolvedModel = options?.model || storedSession.model || defaultModel

    // Log mini agent session creation
    if (options?.systemPromptPreset === 'mini' || options?.model) {
      sessionLog.info(`🤖 Creating mini agent session: model=${resolvedModel}, systemPromptPreset=${options?.systemPromptPreset}`)
    }

    const managed: ManagedSession = {
      id: storedSession.id,
      workspace,
      acpSession: null,  // Lazy-load ACP session on first message
      messages: [],
      isProcessing: false,
      lastMessageAt: storedSession.lastMessageAt ?? storedSession.lastUsedAt,  // Fallback for sessions saved before lastMessageAt was persisted
      streamingText: '',
      processingGeneration: 0,
      isFlagged: options?.isFlagged ?? false,
      todoState: options?.todoState,
      labels: options?.labels,
      permissionMode: defaultPermissionMode,
      workingDirectory: resolvedWorkingDir,
      sdkCwd: storedSession.sdkCwd,
      // Session-specific model takes priority, then workspace default
      model: resolvedModel,
      thinkingLevel: defaultThinkingLevel,
      // System prompt preset for mini agents
      systemPromptPreset: options?.systemPromptPreset,
      messageQueue: [],
      backgroundShellCommands: new Map(),
      messagesLoaded: true,  // New sessions don't need to load messages from disk
      hidden: options?.hidden,
    }

    this.sessions.set(storedSession.id, managed)

    return {
      id: storedSession.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      lastMessageAt: managed.lastMessageAt,
      messages: [],
      isProcessing: false,
      isFlagged: options?.isFlagged ?? false,
      permissionMode: defaultPermissionMode,
      todoState: options?.todoState,
      labels: options?.labels,
      workingDirectory: resolvedWorkingDir,
      model: managed.model,
      thinkingLevel: defaultThinkingLevel,
      sessionFolderPath: getSessionStoragePath(workspaceRootPath, storedSession.id),
      hidden: options?.hidden,
    }
  }

  /**
   * Get or create agent for a session (lazy loading)
   */
  private async getOrCreateACPSession(managed: ManagedSession): Promise<ACPSession> {
    if (!managed.acpSession) {
      if (!this.acpClient) {
        throw new Error('ACP client not initialized. Call initialize() first.')
      }
      const end = perf.start('acpSession.create', { sessionId: managed.id })
      const config = loadStoredConfig()
      // Create a new ACP session (the server owns tools/prompts/behavior)
      sessionLog.info(`[ACP-DIAG] Creating new ACP session for ${managed.id}...`)
      managed.acpSession = await this.acpClient.newSession()
      sessionLog.info(`[ACP-DIAG] Created ACP session for ${managed.id}: acpSessionId=${managed.acpSession.id}`)

      // Set model if session has a specific model override
      const resolvedModel = managed.model || config?.model || DEFAULT_MODEL
      sessionLog.info(`[ACP-DIAG] Setting model to: ${resolvedModel}`)
      try {
        await managed.acpSession.setModel(resolvedModel)
        sessionLog.info(`[ACP-DIAG] Model set successfully: ${resolvedModel}`)
      } catch (e) {
        sessionLog.warn(`[ACP-DIAG] Failed to set model ${resolvedModel}:`, e)
      }

      // Set mode from session profile (falls back to stored config, then 'testcase-generator')
      const resolvedMode = (managed.profile ? profileToMode(managed.profile) : null) || getMode() || 'testcase-generator'
      sessionLog.info(`[ACP-DIAG] Setting mode to: ${resolvedMode}`)
      try {
        await managed.acpSession.setMode(resolvedMode)
        sessionLog.info(`[ACP-DIAG] Mode set successfully: ${resolvedMode}`)
      } catch (e) {
        sessionLog.warn(`[ACP-DIAG] Failed to set mode ${resolvedMode}:`, e)
      }

      end()
    }
    return managed.acpSession
  }

  async flagSession(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      managed.isFlagged = true
      // Persist in-memory state directly to avoid race with pending queue writes
      this.persistSession(managed)
      await this.flushSession(managed.id)
      // Notify all windows for this workspace
      this.sendEvent({ type: 'session_flagged', sessionId }, managed.workspace.id)
    }
  }

  async unflagSession(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      managed.isFlagged = false
      // Persist in-memory state directly to avoid race with pending queue writes
      this.persistSession(managed)
      await this.flushSession(managed.id)
      // Notify all windows for this workspace
      this.sendEvent({ type: 'session_unflagged', sessionId }, managed.workspace.id)
    }
  }

  async setTodoState(sessionId: string, todoState: TodoState): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      managed.todoState = todoState
      // Persist in-memory state directly to avoid race with pending queue writes
      this.persistSession(managed)
      await this.flushSession(managed.id)
      // Notify all windows for this workspace
      this.sendEvent({ type: 'todo_state_changed', sessionId, todoState }, managed.workspace.id)
    }
  }

  // ============================================
  // Pending Plan Execution (Accept & Compact)
  // ============================================

  /**
   * Set pending plan execution state.
   * Called when user clicks "Accept & Compact" to persist the plan path
   * so execution can resume after compaction (even if page reloads).
   */
  async setPendingPlanExecution(sessionId: string, planPath: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      await setStoredPendingPlanExecution(managed.workspace.rootPath, sessionId, planPath)
      sessionLog.info(`Session ${sessionId}: set pending plan execution for ${planPath}`)
    }
  }

  /**
   * Mark compaction as complete for pending plan execution.
   * Called when compaction_complete event fires - allows reload recovery
   * to know that compaction finished and plan can be executed.
   */
  async markCompactionComplete(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      await markStoredCompactionComplete(managed.workspace.rootPath, sessionId)
      sessionLog.info(`Session ${sessionId}: compaction marked complete for pending plan`)
    }
  }

  /**
   * Clear pending plan execution state.
   * Called after plan execution is triggered, on new user message,
   * or when the pending execution is no longer relevant.
   */
  async clearPendingPlanExecution(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      await clearStoredPendingPlanExecution(managed.workspace.rootPath, sessionId)
      sessionLog.info(`Session ${sessionId}: cleared pending plan execution`)
    }
  }

  /**
   * Get pending plan execution state for a session.
   * Used on reload/init to check if we need to resume plan execution.
   */
  getPendingPlanExecution(sessionId: string): { planPath: string; awaitingCompaction: boolean } | null {
    const managed = this.sessions.get(sessionId)
    if (!managed) return null
    return getStoredPendingPlanExecution(managed.workspace.rootPath, sessionId)
  }

  // ============================================
  // Session Sharing
  // ============================================

  /**
   * Share session to the web viewer
   * Uploads session data and returns shareable URL
   */
  async shareToViewer(sessionId: string): Promise<import('../shared/types').ShareResult> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      return { success: false, error: 'Session not found' }
    }

    // Signal async operation start for shimmer effect
    managed.isAsyncOperationOngoing = true
    this.sendEvent({ type: 'async_operation', sessionId, isOngoing: true }, managed.workspace.id)

    try {
      // Load session directly from disk (already in correct format)
      const storedSession = loadStoredSession(managed.workspace.rootPath, sessionId)
      if (!storedSession) {
        return { success: false, error: 'Session file not found' }
      }

      const { VIEWER_URL } = await import('@craft-agent/shared/branding')
      const response = await fetch(`${VIEWER_URL}/s/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storedSession)
      })

      if (!response.ok) {
        sessionLog.error(`Share failed with status ${response.status}`)
        if (response.status === 413) {
          return { success: false, error: 'Session file is too large to share' }
        }
        return { success: false, error: 'Failed to upload session' }
      }

      const data = await response.json() as { id: string; url: string }

      // Store shared info in session
      managed.sharedUrl = data.url
      managed.sharedId = data.id
      const workspaceRootPath = managed.workspace.rootPath
      await updateSessionMetadata(workspaceRootPath, sessionId, {
        sharedUrl: data.url,
        sharedId: data.id,
      })

      sessionLog.info(`Session ${sessionId} shared at ${data.url}`)
      // Notify all windows for this workspace
      this.sendEvent({ type: 'session_shared', sessionId, sharedUrl: data.url }, managed.workspace.id)
      return { success: true, url: data.url }
    } catch (error) {
      sessionLog.error('Share error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    } finally {
      // Signal async operation end
      managed.isAsyncOperationOngoing = false
      this.sendEvent({ type: 'async_operation', sessionId, isOngoing: false }, managed.workspace.id)
    }
  }

  /**
   * Update an existing shared session
   * Re-uploads session data to the same URL
   */
  async updateShare(sessionId: string): Promise<import('../shared/types').ShareResult> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      return { success: false, error: 'Session not found' }
    }
    if (!managed.sharedId) {
      return { success: false, error: 'Session not shared' }
    }

    // Signal async operation start for shimmer effect
    managed.isAsyncOperationOngoing = true
    this.sendEvent({ type: 'async_operation', sessionId, isOngoing: true }, managed.workspace.id)

    try {
      // Load session directly from disk (already in correct format)
      const storedSession = loadStoredSession(managed.workspace.rootPath, sessionId)
      if (!storedSession) {
        return { success: false, error: 'Session file not found' }
      }

      const { VIEWER_URL } = await import('@craft-agent/shared/branding')
      const response = await fetch(`${VIEWER_URL}/s/api/${managed.sharedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storedSession)
      })

      if (!response.ok) {
        sessionLog.error(`Update share failed with status ${response.status}`)
        if (response.status === 413) {
          return { success: false, error: 'Session file is too large to share' }
        }
        return { success: false, error: 'Failed to update shared session' }
      }

      sessionLog.info(`Session ${sessionId} share updated at ${managed.sharedUrl}`)
      return { success: true, url: managed.sharedUrl }
    } catch (error) {
      sessionLog.error('Update share error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    } finally {
      // Signal async operation end
      managed.isAsyncOperationOngoing = false
      this.sendEvent({ type: 'async_operation', sessionId, isOngoing: false }, managed.workspace.id)
    }
  }

  /**
   * Revoke a shared session
   * Deletes from viewer and clears local shared state
   */
  async revokeShare(sessionId: string): Promise<import('../shared/types').ShareResult> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      return { success: false, error: 'Session not found' }
    }
    if (!managed.sharedId) {
      return { success: false, error: 'Session not shared' }
    }

    // Signal async operation start for shimmer effect
    managed.isAsyncOperationOngoing = true
    this.sendEvent({ type: 'async_operation', sessionId, isOngoing: true }, managed.workspace.id)

    try {
      const { VIEWER_URL } = await import('@craft-agent/shared/branding')
      const response = await fetch(
        `${VIEWER_URL}/s/api/${managed.sharedId}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        sessionLog.error(`Revoke failed with status ${response.status}`)
        return { success: false, error: 'Failed to revoke share' }
      }

      // Clear shared info
      delete managed.sharedUrl
      delete managed.sharedId
      const workspaceRootPath = managed.workspace.rootPath
      await updateSessionMetadata(workspaceRootPath, sessionId, {
        sharedUrl: undefined,
        sharedId: undefined,
      })

      sessionLog.info(`Session ${sessionId} share revoked`)
      // Notify all windows for this workspace
      this.sendEvent({ type: 'session_unshared', sessionId }, managed.workspace.id)
      return { success: true }
    } catch (error) {
      sessionLog.error('Revoke error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    } finally {
      // Signal async operation end
      managed.isAsyncOperationOngoing = false
      this.sendEvent({ type: 'async_operation', sessionId, isOngoing: false }, managed.workspace.id)
    }
  }

  // ============================================
  // Session Sources
  // ============================================

  /**
   * Update session's enabled sources
   * If agent exists, builds and applies servers immediately.
   * Otherwise, servers will be built fresh on next message.
   */
  async setSessionSources(sessionId: string, sourceSlugs: string[]): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const workspaceRootPath = managed.workspace.rootPath
    sessionLog.info(`Setting sources for session ${sessionId}:`, sourceSlugs)

    // Store the selection
    managed.enabledSourceSlugs = sourceSlugs

    // ACP: Sources are managed by the server, no client-side server building needed

    // Persist the session with updated sources
    this.persistSession(managed)

    // Notify renderer of the source change
    this.sendEvent({
      type: 'sources_changed',
      sessionId,
      enabledSourceSlugs: sourceSlugs,
    }, managed.workspace.id)

    sessionLog.info(`Session ${sessionId} sources updated: ${sourceSlugs.length} sources`)
  }

  /**
   * Get the enabled source slugs for a session
   */
  getSessionSources(sessionId: string): string[] {
    const managed = this.sessions.get(sessionId)
    return managed?.enabledSourceSlugs ?? []
  }

  /**
   * Get the last final assistant message ID from a list of messages
   * A "final" message is one where:
   * - role === 'assistant' AND
   * - isIntermediate !== true (not commentary between tool calls)
   * Returns undefined if no final assistant message exists
   */
  private getLastFinalAssistantMessageId(messages: Message[]): string | undefined {
    // Iterate backwards to find the most recent final assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant' && !msg.isIntermediate) {
        return msg.id
      }
    }
    return undefined
  }

  /**
   * Set which session the user is actively viewing.
   * Called when user navigates to a session. Used to determine whether to mark
   * new messages as unread - if user is viewing, don't mark unread.
   */
  setActiveViewingSession(sessionId: string | null, workspaceId: string): void {
    if (sessionId) {
      this.activeViewingSession.set(workspaceId, sessionId)
      // When user starts viewing a session that's not processing, clear unread
      const managed = this.sessions.get(sessionId)
      if (managed && !managed.isProcessing && managed.hasUnread) {
        this.markSessionRead(sessionId)
      }
    } else {
      this.activeViewingSession.delete(workspaceId)
    }
  }

  /**
   * Clear active viewing session for a workspace.
   * Called when all windows leave a workspace to ensure read/unread state is correct.
   */
  clearActiveViewingSession(workspaceId: string): void {
    this.activeViewingSession.delete(workspaceId)
  }

  /**
   * Check if a session is currently being viewed by the user
   */
  private isSessionBeingViewed(sessionId: string, workspaceId: string): boolean {
    return this.activeViewingSession.get(workspaceId) === sessionId
  }

  /**
   * Mark a session as read by setting lastReadMessageId and clearing hasUnread.
   * Called when user navigates to a session (and it's not processing).
   */
  async markSessionRead(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed) return

    // Only mark as read if not currently processing
    // (user is viewing but we want to wait for processing to complete)
    if (managed.isProcessing) return

    let needsPersist = false
    const updates: { lastReadMessageId?: string; hasUnread?: boolean } = {}

    // Update lastReadMessageId for legacy/manual unread functionality
    if (managed.messages.length > 0) {
      const lastFinalId = this.getLastFinalAssistantMessageId(managed.messages)
      if (lastFinalId && managed.lastReadMessageId !== lastFinalId) {
        managed.lastReadMessageId = lastFinalId
        updates.lastReadMessageId = lastFinalId
        needsPersist = true
      }
    }

    // Clear hasUnread flag (primary source of truth for NEW badge)
    if (managed.hasUnread) {
      managed.hasUnread = false
      updates.hasUnread = false
      needsPersist = true
    }

    // Persist changes
    if (needsPersist) {
      const workspaceRootPath = managed.workspace.rootPath
      await updateSessionMetadata(workspaceRootPath, sessionId, updates)
    }
  }

  /**
   * Mark a session as unread by setting hasUnread flag.
   * Called when user manually marks a session as unread via context menu.
   */
  async markSessionUnread(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      managed.hasUnread = true
      managed.lastReadMessageId = undefined
      // Persist to disk
      const workspaceRootPath = managed.workspace.rootPath
      await updateSessionMetadata(workspaceRootPath, sessionId, { hasUnread: true, lastReadMessageId: undefined })
    }
  }

  async renameSession(sessionId: string, name: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      managed.name = name
      this.persistSession(managed)
      // Notify renderer of the name change
      this.sendEvent({ type: 'title_generated', sessionId, title: name }, managed.workspace.id)
    }
  }

  /**
   * Regenerate the session title based on recent messages.
   * Uses the last few user messages to capture what the session has evolved into.
   */
  async refreshTitle(sessionId: string): Promise<{ success: boolean; title?: string; error?: string }> {
    sessionLog.info(`refreshTitle called for session ${sessionId}`)
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      sessionLog.warn(`refreshTitle: Session ${sessionId} not found`)
      return { success: false, error: 'Session not found' }
    }

    // Get recent user messages (last 3) for context
    const userMessages = managed.messages
      .filter((m) => m.role === 'user')
      .slice(-3)
      .map((m) => m.content)

    sessionLog.info(`refreshTitle: Found ${userMessages.length} user messages`)

    if (userMessages.length === 0) {
      sessionLog.warn(`refreshTitle: No user messages found`)
      return { success: false, error: 'No user messages to generate title from' }
    }

    // Get the most recent assistant response
    const lastAssistantMsg = managed.messages
      .filter((m) => m.role === 'assistant' && !m.isIntermediate)
      .slice(-1)[0]

    const assistantResponse = lastAssistantMsg?.content ?? ''
    sessionLog.info(`refreshTitle: Calling regenerateSessionTitle...`)

    // Notify renderer that title regeneration has started (for shimmer effect)
    managed.isAsyncOperationOngoing = true
    this.sendEvent({ type: 'async_operation', sessionId, isOngoing: true }, managed.workspace.id)
    // Keep legacy event for backward compatibility
    this.sendEvent({ type: 'title_regenerating', sessionId, isRegenerating: true }, managed.workspace.id)

    try {
      const title = await regenerateSessionTitle(userMessages, assistantResponse)
      sessionLog.info(`refreshTitle: regenerateSessionTitle returned: ${title ? `"${title}"` : 'null'}`)
      if (title) {
        managed.name = title
        this.persistSession(managed)
        // title_generated will also clear isRegeneratingTitle via the event handler
        this.sendEvent({ type: 'title_generated', sessionId, title }, managed.workspace.id)
        sessionLog.info(`Refreshed title for session ${sessionId}: "${title}"`)
        return { success: true, title }
      }
      // Failed to generate - clear regenerating state
      this.sendEvent({ type: 'title_regenerating', sessionId, isRegenerating: false }, managed.workspace.id)
      return { success: false, error: 'Failed to generate title' }
    } catch (error) {
      // Error occurred - clear regenerating state
      this.sendEvent({ type: 'title_regenerating', sessionId, isRegenerating: false }, managed.workspace.id)
      const message = error instanceof Error ? error.message : 'Unknown error'
      sessionLog.error(`Failed to refresh title for session ${sessionId}:`, error)
      return { success: false, error: message }
    } finally {
      // Signal async operation end
      managed.isAsyncOperationOngoing = false
      this.sendEvent({ type: 'async_operation', sessionId, isOngoing: false }, managed.workspace.id)
    }
  }

  /**
   * Update the working directory for a session
   */
  updateWorkingDirectory(sessionId: string, path: string): void {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      managed.workingDirectory = path
      // ACP: Working directory is set at session creation, not updated mid-session
      this.persistSession(managed)
      // Notify renderer of the working directory change
      this.sendEvent({ type: 'working_directory_changed', sessionId, workingDirectory: path }, managed.workspace.id)
    }
  }

  /**
   * Update the model for a session
   * Pass null to clear the session-specific model (will use global config)
   */
  async updateSessionModel(sessionId: string, workspaceId: string, model: string | null): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      managed.model = model ?? undefined
      // Persist to disk
      await updateSessionMetadata(managed.workspace.rootPath, sessionId, { model: model ?? undefined })
      // Update ACP session model if it already exists
      if (managed.acpSession) {
        const wsConfig = loadWorkspaceConfig(managed.workspace.rootPath)
        const effectiveModel = model ?? wsConfig?.defaults?.model ?? loadStoredConfig()?.model ?? DEFAULT_MODEL
        const resolvedModel = effectiveModel
        managed.acpSession.setModel(resolvedModel).catch(e => {
          sessionLog.warn(`Failed to set model ${resolvedModel}:`, e)
        })
      }
      // Notify renderer of the model change
      this.sendEvent({ type: 'session_model_changed', sessionId, model }, managed.workspace.id)
      sessionLog.info(`Session ${sessionId} model updated to: ${model ?? '(global config)'}`)
    }
  }

  /**
   * Update the content of a specific message in a session
   * Used by preview window to save edited content back to the original message
   */
  updateMessageContent(sessionId: string, messageId: string, content: string): void {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      sessionLog.warn(`Cannot update message: session ${sessionId} not found`)
      return
    }

    const message = managed.messages.find(m => m.id === messageId)
    if (!message) {
      sessionLog.warn(`Cannot update message: message ${messageId} not found in session ${sessionId}`)
      return
    }

    // Update the message content
    message.content = content
    // Persist the updated session
    this.persistSession(managed)
    sessionLog.info(`Updated message ${messageId} content in session ${sessionId}`)
  }

  async deleteSession(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      sessionLog.warn(`Cannot delete session: ${sessionId} not found`)
      return
    }

    // Get workspace slug before deleting
    const workspaceRootPath = managed.workspace.rootPath

    // If processing is in progress, force-abort via Query.close() and wait for cleanup
    if (managed.isProcessing && managed.acpSession) {
      managed.acpSession.cancel()
      // Brief wait for the query to finish tearing down before we delete session files.
      // Prevents file corruption from overlapping writes during rapid delete operations.
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Clean up delta flush timers to prevent orphaned timers
    const timer = this.deltaFlushTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.deltaFlushTimers.delete(sessionId)
    }
    this.pendingDeltas.delete(sessionId)

    // Cancel any pending persistence write (session is being deleted, no need to save)
    sessionPersistenceQueue.cancel(sessionId)

    // Clean up ACP session reference (server manages its own cleanup)
    managed.acpSession = null

    this.sessions.delete(sessionId)

    // Delete from disk too
    deleteStoredSession(workspaceRootPath, sessionId)

    // Notify all windows for this workspace that the session was deleted
    this.sendEvent({ type: 'session_deleted', sessionId }, managed.workspace.id)

    // Clean up attachments directory (handled by deleteStoredSession for workspace-scoped storage)
    sessionLog.info(`Deleted session ${sessionId}`)
  }

  async sendMessage(sessionId: string, message: string, attachments?: FileAttachment[], storedAttachments?: StoredAttachment[], options?: SendMessageOptions, existingMessageId?: string, _isAuthRetry?: boolean): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Clear any pending plan execution state when a new user message is sent.
    // This acts as a safety valve - if the user moves on, we don't want to
    // auto-execute an old plan later.
    await clearStoredPendingPlanExecution(managed.workspace.rootPath, sessionId)

    // Ensure messages are loaded before we try to add new ones
    await this.ensureMessagesLoaded(managed)

    // If currently processing, queue the message and interrupt via forceAbort.
    // The abort throws an AbortError (caught in the catch block) which calls
    // onProcessingStopped → processNextQueuedMessage to drain the queue.
    if (managed.isProcessing) {
      sessionLog.info(`Session ${sessionId} is processing, queueing message and interrupting`)

      // Create user message for queued state (so UI can show it)
      const queuedMessage: Message = {
        id: generateMessageId(),
        role: 'user',
        content: message,
        timestamp: Date.now(),
        attachments: storedAttachments,
        badges: options?.badges,
      }

      // Add to messages immediately so it's persisted
      managed.messages.push(queuedMessage)

      // Queue the message info (with the generated ID for later matching)
      managed.messageQueue.push({ message, attachments, storedAttachments, options, messageId: queuedMessage.id })

      // Emit user_message event so UI can show queued state
      this.sendEvent({
        type: 'user_message',
        sessionId,
        message: queuedMessage,
        status: 'queued'
      }, managed.workspace.id)

      // Force-abort via Query.close() - immediately stops processing.
      // The for-await loop will complete, triggering onProcessingStopped → queue drain.
      managed.acpSession?.cancel()

      return
    }

    // Add user message with stored attachments for persistence
    // Skip if existingMessageId is provided (message was already created when queued)
    let userMessage: Message
    if (existingMessageId) {
      // Find existing message (already added when queued)
      userMessage = managed.messages.find(m => m.id === existingMessageId)!
      if (!userMessage) {
        throw new Error(`Existing message ${existingMessageId} not found`)
      }
    } else {
      // Create new message
      userMessage = {
        id: generateMessageId(),
        role: 'user',
        content: message,
        timestamp: Date.now(),
        attachments: storedAttachments, // Include for persistence (has thumbnailBase64)
        badges: options?.badges,  // Include content badges (sources, skills with embedded icons)
      }
      managed.messages.push(userMessage)

      // Update lastMessageRole for badge display
      managed.lastMessageRole = 'user'

      // Emit user_message event so UI can confirm the optimistic message
      this.sendEvent({
        type: 'user_message',
        sessionId,
        message: userMessage,
        status: 'accepted'
      }, managed.workspace.id)

      // If this is the first user message and no title exists, set one immediately
      // AI generation will enhance it later, but we always have a title from the start
      const isFirstUserMessage = managed.messages.filter(m => m.role === 'user').length === 1
      if (isFirstUserMessage && !managed.name) {
        // Sanitize message to remove XML blocks (e.g. <edit_request>) before using as title
        const sanitized = sanitizeForTitle(message)
        const initialTitle = sanitized.slice(0, 50) + (sanitized.length > 50 ? '…' : '')
        managed.name = initialTitle
        this.persistSession(managed)
        // Flush immediately so disk is authoritative before notifying renderer
        await this.flushSession(managed.id)
        this.sendEvent({
          type: 'title_generated',
          sessionId,
          title: initialTitle,
        }, managed.workspace.id)

        // Generate AI title asynchronously (will update the initial title)
        this.generateTitle(managed, message)
      }
    }

    // Evaluate auto-label rules against the user message (common path for both
    // fresh and queued messages). Scans regex patterns configured on labels,
    // then merges any new matches into the session's label array.
    try {
      const labelTree = listLabels(managed.workspace.rootPath)
      const autoMatches = evaluateAutoLabels(message, labelTree)

      if (autoMatches.length > 0) {
        const existingLabels = managed.labels ?? []
        const newEntries = autoMatches
          .map(m => `${m.labelId}::${m.value}`)
          .filter(entry => !existingLabels.includes(entry))

        if (newEntries.length > 0) {
          managed.labels = [...existingLabels, ...newEntries]
          this.persistSession(managed)
          this.sendEvent({
            type: 'labels_changed',
            sessionId,
            labels: managed.labels,
          }, managed.workspace.id)
        }
      }
    } catch (e) {
      sessionLog.warn(`Auto-label evaluation failed for session ${sessionId}:`, e)
    }

    managed.lastMessageAt = Date.now()
    managed.isProcessing = true
    managed.streamingText = ''
    managed.processingGeneration++

    // Reset auth retry flag for this new message (allows one retry per message)
    // IMPORTANT: Skip reset if this is an auth retry call - the flag is already true
    // and resetting it would allow infinite retry loops
    // Note: authRetryInProgress is NOT reset here - it's managed by the retry logic
    if (!_isAuthRetry) {
      managed.authRetryAttempted = false
    }

    // Store message/attachments for potential retry after auth refresh
    // (SDK subprocess caches token at startup, so if it expires mid-session,
    // we need to recreate the agent and retry the message)
    managed.lastSentMessage = message
    managed.lastSentAttachments = attachments
    managed.lastSentStoredAttachments = storedAttachments
    managed.lastSentOptions = options

    // Capture the generation to detect if a new request supersedes this one.
    // This prevents the finally block from clobbering state when a follow-up message arrives.
    const myGeneration = managed.processingGeneration

    // Start perf span for entire sendMessage flow
    const sendSpan = perf.span('session.sendMessage', { sessionId })

    // Get or create the ACP session (lazy loading)
    const acpSession = await this.getOrCreateACPSession(managed)
    sendSpan.mark('acpSession.ready')

    try {
      sessionLog.info(`[ACP-DIAG] Starting chat for session: ${sessionId}`)
      sessionLog.info(`[ACP-DIAG] Message: "${message.substring(0, 100)}"`)
      sessionLog.info(`[ACP-DIAG] ACP session ID: ${acpSession.id}`)

      sendSpan.mark('chat.starting')
      sessionLog.info('[ACP-DIAG] Calling acpSession.prompt()...')
      const updateStream = acpSession.prompt(message)
      sessionLog.info('[ACP-DIAG] prompt() returned, entering for-await loop...')

      let updateCount = 0
      for await (const update of updateStream) {
        updateCount++
        // Log ALL updates for debugging
        sessionLog.info(`[ACP-DIAG] Update #${updateCount}: type=${update.type}${update.type === 'text' ? `, text="${(update as any).text?.substring(0, 50)}"` : ''}`)

        // Process the ACP update
        this.processACPUpdate(managed, update)

        // Check if cancelled via cancelProcessing (Stop button)
        if (!managed.isProcessing) {
          sessionLog.info('Processing flag cleared, breaking out of update loop')
          break
        }
      }

      // Finalize any streaming text into a complete message
      this.finalizeStreamingText(managed)

      // Stream completed - handle completion
      sessionLog.info(`[ACP-DIAG] ACP prompt stream completed. Total updates received: ${updateCount}`)
      sendSpan.mark('chat.complete')
      sendSpan.end()
      this.onProcessingStopped(sessionId, 'complete')
      return  // Exit function, skip finally block

    } catch (error) {
      sessionLog.error('Error in ACP chat:', error)
      sessionLog.error('Error message:', error instanceof Error ? error.message : String(error))

      Sentry.captureException(error, {
        tags: { errorSource: 'acp-chat', sessionId },
      })

      sendSpan.mark('chat.error')
      sendSpan.setMetadata('error', error instanceof Error ? error.message : String(error))
      sendSpan.end()
      this.sendEvent({
        type: 'error',
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, managed.workspace.id)
      this.onProcessingStopped(sessionId, 'error')
    } finally {
      // Only handle cleanup for unexpected exits (loop break without complete event)
      // Normal completion returns early after calling onProcessingStopped
      // Errors are handled in catch block
      if (managed.isProcessing && managed.processingGeneration === myGeneration) {
        sessionLog.info('Finally block cleanup - unexpected exit')
        sendSpan.mark('chat.unexpected_exit')
        sendSpan.end()
        this.onProcessingStopped(sessionId, 'interrupted')
      }
    }
  }

  async cancelProcessing(sessionId: string, silent = false): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed?.isProcessing) {
      return // Not processing, nothing to cancel
    }

    sessionLog.info('Cancelling processing for session:', sessionId, silent ? '(silent)' : '')

    // Clear queue - user explicitly stopped, don't process queued messages
    managed.messageQueue = []

    // Cancel via ACP session
    if (managed.acpSession) {
      managed.acpSession.cancel()
    }

    // Set state immediately - the SDK will send a complete event
    // but since we cleared isProcessing, onProcessingStopped won't be called again
    managed.isProcessing = false

    // Only show "Response interrupted" message when user explicitly clicked Stop
    // Silent mode is used when redirecting (sending new message while processing)
    if (!silent) {
      const interruptedMessage: Message = {
        id: generateMessageId(),
        role: 'info',
        content: 'Response interrupted',
        timestamp: Date.now(),
      }
      managed.messages.push(interruptedMessage)
      this.sendEvent({ type: 'interrupted', sessionId, message: interruptedMessage }, managed.workspace.id)
    } else {
      // Still send interrupted event but without the message (for UI state update)
      this.sendEvent({ type: 'interrupted', sessionId }, managed.workspace.id)
    }

    // Emit complete since we're stopping and queue is cleared (include tokenUsage for real-time updates)
    this.sendEvent({ type: 'complete', sessionId, tokenUsage: managed.tokenUsage }, managed.workspace.id)

    // Persist session
    this.persistSession(managed)
  }

  /**
   * Central handler for when processing stops (any reason).
   * Single source of truth for cleanup and queue processing.
   *
   * @param sessionId - The session that stopped processing
   * @param reason - Why processing stopped ('complete' | 'interrupted' | 'error')
   */
  private async onProcessingStopped(
    sessionId: string,
    reason: 'complete' | 'interrupted' | 'error'
  ): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed) return

    sessionLog.info(`Processing stopped for session ${sessionId}: ${reason}`)

    // 1. Cleanup state
    managed.isProcessing = false

    // 2. Handle unread state based on whether user is viewing this session
    //    This is the explicit state machine for NEW badge:
    //    - If user is viewing: mark as read (they saw it complete)
    //    - If user is NOT viewing: mark as unread (they have new content)
    const isViewing = this.isSessionBeingViewed(sessionId, managed.workspace.id)
    const hasFinalMessage = this.getLastFinalAssistantMessageId(managed.messages) !== undefined

    if (reason === 'complete' && hasFinalMessage) {
      if (isViewing) {
        // User is watching - mark as read immediately
        await this.markSessionRead(sessionId)
      } else {
        // User is not watching - mark as unread for NEW badge
        if (!managed.hasUnread) {
          managed.hasUnread = true
          await updateSessionMetadata(managed.workspace.rootPath, sessionId, { hasUnread: true })
        }
      }
    }

    // 3. Auto-complete mini agent sessions to avoid session list clutter
    //    Mini agents are spawned from EditPopovers for quick config edits
    //    and should automatically move to 'done' when finished
    if (reason === 'complete' && managed.systemPromptPreset === 'mini' && managed.todoState !== 'done') {
      sessionLog.info(`Auto-completing mini agent session ${sessionId}`)
      await this.setTodoState(sessionId, 'done')
    }

    // 4. Check queue and process or complete
    if (managed.messageQueue.length > 0) {
      // Has queued messages - process next
      this.processNextQueuedMessage(sessionId)
    } else {
      // No queue - emit complete to UI (include tokenUsage and hasUnread for state updates)
      this.sendEvent({
        type: 'complete',
        sessionId,
        tokenUsage: managed.tokenUsage,
        hasUnread: managed.hasUnread,  // Propagate unread state to renderer
      }, managed.workspace.id)
    }

    // 5. Always persist
    this.persistSession(managed)
  }

  /**
   * Process the next message in the queue.
   * Called by onProcessingStopped when queue has messages.
   */
  private processNextQueuedMessage(sessionId: string): void {
    const managed = this.sessions.get(sessionId)
    if (!managed || managed.messageQueue.length === 0) return

    const next = managed.messageQueue.shift()!
    sessionLog.info(`Processing queued message for session ${sessionId}`)

    // Update UI: queued → processing
    if (next.messageId) {
      const existingMessage = managed.messages.find(m => m.id === next.messageId)
      if (existingMessage) {
        this.sendEvent({
          type: 'user_message',
          sessionId,
          message: existingMessage,
          status: 'processing'
        }, managed.workspace.id)
      }
    }

    // Process message (use setImmediate to allow current stack to clear)
    setImmediate(() => {
      this.sendMessage(
        sessionId,
        next.message,
        next.attachments,
        next.storedAttachments,
        next.options,
        next.messageId
      ).catch(err => {
        sessionLog.error('Error processing queued message:', err)
        // Report queued message failures to Sentry — these indicate SDK/chat pipeline errors
        Sentry.captureException(err, {
          tags: { errorSource: 'chat-queue', sessionId },
        })
        this.sendEvent({
          type: 'error',
          sessionId,
          error: err instanceof Error ? err.message : 'Unknown error'
        }, managed.workspace.id)
        // Call onProcessingStopped to handle cleanup and check for more queued messages
        this.onProcessingStopped(sessionId, 'error')
      })
    })
  }

  async killShell(sessionId: string, shellId: string): Promise<{ success: boolean; error?: string }> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      return { success: false, error: 'Session not found' }
    }

    sessionLog.info(`Killing shell ${shellId} for session: ${sessionId}`)

    // Try to kill the actual process using the stored command
    const command = managed.backgroundShellCommands.get(shellId)
    if (command) {
      try {
        // Use pkill to find and kill processes matching the command
        // The -f flag matches against the full command line
        const { exec } = await import('child_process')
        const { promisify } = await import('util')
        const execAsync = promisify(exec)

        // Escape the command for use in pkill pattern
        // We search for the unique command string in process args
        const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        sessionLog.info(`Attempting to kill process with command: ${command.slice(0, 100)}...`)

        // Use pgrep first to find the PID, then kill it
        // This is safer than pkill -f which can match too broadly
        try {
          const { stdout } = await execAsync(`pgrep -f "${escapedCommand}"`)
          const pids = stdout.trim().split('\n').filter(Boolean)

          if (pids.length > 0) {
            sessionLog.info(`Found ${pids.length} process(es) to kill: ${pids.join(', ')}`)
            // Kill each process
            for (const pid of pids) {
              try {
                await execAsync(`kill -TERM ${pid}`)
                sessionLog.info(`Sent SIGTERM to process ${pid}`)
              } catch (killErr) {
                // Process may have already exited
                sessionLog.warn(`Failed to kill process ${pid}: ${killErr}`)
              }
            }
          } else {
            sessionLog.info(`No processes found matching command`)
          }
        } catch (pgrepErr) {
          // pgrep returns exit code 1 when no processes found, which is fine
          sessionLog.info(`No matching processes found (pgrep returned no results)`)
        }

        // Clean up the stored command
        managed.backgroundShellCommands.delete(shellId)
      } catch (err) {
        sessionLog.error(`Error killing shell process: ${err}`)
      }
    } else {
      sessionLog.warn(`No command stored for shell ${shellId}, cannot kill process`)
    }

    // Always emit shell_killed to remove from UI regardless of process kill success
    this.sendEvent({
      type: 'shell_killed',
      sessionId,
      shellId,
    }, managed.workspace.id)

    return { success: true }
  }

  /**
   * Get output from a background task or shell
   *
   * NOT YET IMPLEMENTED - This is a placeholder.
   *
   * Background task output retrieval requires infrastructure that doesn't exist yet:
   * 1. Storing shell output streams as they come in (tool_result events only have final output)
   * 2. Associating outputs with task/shell IDs in a queryable store
   * 3. Handling the BashOutput tool results for ongoing shells
   *
   * Current workaround: Users can view task output in the main chat panel where
   * tool results are displayed inline with the conversation.
   *
   * @param taskId - The task or shell ID
   * @returns Placeholder message explaining the limitation
   */
  async getTaskOutput(taskId: string): Promise<string | null> {
    sessionLog.info(`Getting output for task: ${taskId} (not implemented)`)

    // This functionality requires a dedicated output tracking system.
    // The SDK manages shells internally but doesn't expose an API for querying
    // their output history outside of tool_result events.
    return `Background task output retrieval is not yet implemented.

Task ID: ${taskId}

To view this task's output:
• Check the main chat panel where tool results are displayed
• Look for the tool_result message associated with this task
• For ongoing shells, the agent can use BashOutput to check status`
  }

  /**
   * Respond to a pending permission request
   * Returns true if the response was delivered, false if agent/session is gone
   */
  respondToPermission(sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean): boolean {
    const managed = this.sessions.get(sessionId)
    if (managed?.pendingACPPermissionRequest) {
      sessionLog.info(`Permission response for ${requestId}: allowed=${allowed}, alwaysAllow=${alwaysAllow}`)
      const permRequest = managed.pendingACPPermissionRequest
      // Find the right option to respond with
      const options = permRequest.options
      let optionId: string | undefined
      if (allowed) {
        // Prefer always_allow if alwaysAllow is true, otherwise allow_once
        const targetKind = alwaysAllow ? 'allow_always' : 'allow_once'
        optionId = options.find(o => o.kind === targetKind)?.optionId
          ?? options.find(o => o.kind === 'allow_once')?.optionId
      } else {
        optionId = options.find(o => o.kind === 'reject_once')?.optionId
          ?? options.find(o => o.kind === 'reject_always')?.optionId
      }
      if (optionId) {
        permRequest.respond(optionId).catch(e => {
          sessionLog.warn('Failed to respond to ACP permission:', e)
        })
      } else {
        permRequest.cancel().catch(e => {
          sessionLog.warn('Failed to cancel ACP permission:', e)
        })
      }
      managed.pendingACPPermissionRequest = undefined
      return true
    } else {
      sessionLog.warn(`Cannot respond to permission - no pending ACP permission for session ${sessionId}`)
      return false
    }
  }

  /**
   * Respond to a pending credential request
   * Returns true if the response was delivered, false if no pending request found
   *
   * Supports both:
   * - New unified auth flow (via handleCredentialInput)
   * - Legacy callback flow (via pendingCredentialResolvers)
   */
  async respondToCredential(sessionId: string, requestId: string, response: import('../shared/types').CredentialResponse): Promise<boolean> {
    // First, check if this is a new unified auth flow request
    const managed = this.sessions.get(sessionId)
    if (managed?.pendingAuthRequest && managed.pendingAuthRequest.requestId === requestId) {
      sessionLog.info(`Credential response (unified flow) for ${requestId}: cancelled=${response.cancelled}`)
      await this.handleCredentialInput(sessionId, requestId, response)
      return true
    }

    // Fall back to legacy callback flow
    const resolver = this.pendingCredentialResolvers.get(requestId)
    if (resolver) {
      sessionLog.info(`Credential response (legacy flow) for ${requestId}: cancelled=${response.cancelled}`)
      resolver(response)
      this.pendingCredentialResolvers.delete(requestId)
      return true
    } else {
      sessionLog.warn(`Cannot respond to credential - no pending request for ${requestId}`)
      return false
    }
  }

  /**
   * Set the permission mode for a session ('safe', 'ask', 'allow-all')
   */
  setSessionPermissionMode(sessionId: string, mode: PermissionMode): void {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      // Update permission mode
      managed.permissionMode = mode

      // ACP: Permission mode is managed by the server

      this.sendEvent({
        type: 'permission_mode_changed',
        sessionId: managed.id,
        permissionMode: mode,
      }, managed.workspace.id)
      // Persist to disk
      this.persistSession(managed)
    }
  }

  /**
   * Set the agent profile for a session ('chat', 'agent', 'testcase')
   */
  async setSessionProfile(sessionId: string, profile: AgentProfile): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      managed.profile = profile

      if (managed.acpSession) {
        const mode = profileToMode(profile)
        await managed.acpSession.setMode(mode)
        sessionLog.info(`[ACP-DIAG] Profile changed to '${profile}', mode set to '${mode}'`)
      }

      this.sendEvent({
        type: 'session_profile_changed',
        sessionId: managed.id,
        profile,
      }, managed.workspace.id)
      // Persist to disk
      this.persistSession(managed)
    }
  }

  /**
   * Set labels for a session (additive tags, many-per-session).
   * Labels are IDs referencing workspace labels/config.json.
   */
  setSessionLabels(sessionId: string, labels: string[]): void {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      managed.labels = labels

      this.sendEvent({
        type: 'labels_changed',
        sessionId: managed.id,
        labels: managed.labels,
      }, managed.workspace.id)
      // Persist to disk
      this.persistSession(managed)
    }
  }

  /**
   * Set the thinking level for a session ('off', 'think', 'max')
   * This is sticky and persisted across messages.
   */
  setSessionThinkingLevel(sessionId: string, level: ThinkingLevel): void {
    const managed = this.sessions.get(sessionId)
    if (managed) {
      // Update thinking level in managed session
      managed.thinkingLevel = level

      // ACP: Thinking level is managed by the server via config options

      sessionLog.info(`Session ${sessionId}: thinking level set to ${level}`)
      // Persist to disk
      this.persistSession(managed)
    }
  }

  /**
   * Generate an AI title for a session from the user's first message.
   * Called asynchronously when the first user message is received.
   */
  private async generateTitle(managed: ManagedSession, userMessage: string): Promise<void> {
    sessionLog.info(`Starting title generation for session ${managed.id}`)
    try {
      const title = await generateSessionTitle(userMessage)
      if (title) {
        managed.name = title
        this.persistSession(managed)
        // Flush immediately to ensure disk is up-to-date before notifying renderer.
        // This prevents race condition where lazy loading reads stale disk data
        // (the persistence queue has a 500ms debounce).
        await this.flushSession(managed.id)
        // Now safe to notify renderer - disk is authoritative
        this.sendEvent({ type: 'title_generated', sessionId: managed.id, title }, managed.workspace.id)
        sessionLog.info(`Generated title for session ${managed.id}: "${title}"`)
      } else {
        sessionLog.warn(`Title generation returned null for session ${managed.id}`)
      }
    } catch (error) {
      sessionLog.error(`Failed to generate title for session ${managed.id}:`, error)
    }
  }

  /**
   * Process an ACP SessionUpdate event and map it to IPC events for the renderer.
   * This replaces the old processEvent() which handled CraftAgent AgentEvent types.
   *
   * ACP SessionUpdate types → IPC SessionEvent mapping:
   * - text → text_delta (streaming) + text_complete (on next update or stream end)
   * - thinking → text_delta (prefixed, optional)
   * - toolCall → tool_start / tool_result (based on toolCall.status)
   * - plan → (rendered inline as text)
   * - permissionRequest → permission_request
   * - configUpdate → (update local state)
   */
  private processACPUpdate(managed: ManagedSession, update: SessionUpdate): void {
    const sessionId = managed.id
    const workspaceId = managed.workspace.id

    switch (update.type) {
      case 'text': {
        // Stream text delta to renderer
        managed.streamingText += update.text
        this.queueDelta(sessionId, workspaceId, update.text)
        break
      }

      case 'thinking': {
        // Render thinking as text delta (optional - can be distinguished in UI later)
        this.queueDelta(sessionId, workspaceId, update.text)
        break
      }

      case 'toolCall': {
        const tc = update.toolCall
        const isComplete = tc.status === 'completed' || tc.status === 'failed' || tc.status === 'cancelled'

        if (isComplete) {
          // Tool completed - emit tool_result
          const existingToolMsg = managed.messages.find(m => m.toolUseId === tc.id)
          if (existingToolMsg) {
            existingToolMsg.content = tc.textContent || ''
            existingToolMsg.toolResult = tc.textContent || ''
            existingToolMsg.toolStatus = 'completed'
            existingToolMsg.isError = tc.status === 'failed'
          } else {
            // No prior tool_start - create tool message from result
            const toolMessage: Message = {
              id: generateMessageId(),
              role: 'tool',
              content: tc.textContent || '',
              timestamp: Date.now(),
              toolName: tc.title,
              toolUseId: tc.id,
              toolResult: tc.textContent || '',
              toolStatus: 'completed',
              isError: tc.status === 'failed',
            }
            managed.messages.push(toolMessage)
          }

          this.sendEvent({
            type: 'tool_result',
            sessionId,
            toolUseId: tc.id,
            toolName: tc.title,
            result: tc.textContent || '',
            isError: tc.status === 'failed',
          }, workspaceId)

          this.persistSession(managed)
        } else {
          // Tool starting or in progress - emit tool_start
          const existingMsg = managed.messages.find(m => m.toolUseId === tc.id)
          if (!existingMsg) {
            const toolStartMessage: Message = {
              id: generateMessageId(),
              role: 'tool',
              content: `Running ${tc.title}...`,
              timestamp: Date.now(),
              toolName: tc.title,
              toolUseId: tc.id,
              toolInput: tc.rawInput as Record<string, unknown> | undefined,
              toolStatus: 'executing',
            }
            managed.messages.push(toolStartMessage)

            this.sendEvent({
              type: 'tool_start',
              sessionId,
              toolName: tc.title,
              toolUseId: tc.id,
              toolInput: (tc.rawInput as Record<string, unknown>) ?? {},
            }, workspaceId)
          }
        }
        break
      }

      case 'plan': {
        // Render plan entries as a text message
        const planText = update.entries.map(e => `- [${e.status}] ${e.content}`).join('\n')

        // Flush any pending text first
        this.flushDelta(sessionId, workspaceId)

        const planMessage: Message = {
          id: generateMessageId(),
          role: 'assistant',
          content: planText,
          timestamp: Date.now(),
        }
        managed.messages.push(planMessage)
        managed.streamingText = ''

        this.sendEvent({
          type: 'text_complete',
          sessionId,
          text: planText,
        }, workspaceId)
        break
      }

      case 'permissionRequest': {
        // Store the permission request for responding later
        managed.pendingACPPermissionRequest = update.request

        // Map to existing permission_request IPC event
        const toolCallId = update.request.toolCallId
        const optionNames = update.request.options.map(o => o.name).join(', ')
        this.sendEvent({
          type: 'permission_request',
          sessionId,
          request: {
            sessionId,
            requestId: toolCallId ?? 'acp-perm',
            toolName: toolCallId ?? 'unknown',
            command: toolCallId ? `Tool: ${toolCallId}` : 'Permission required',
            description: `Options: ${optionNames}`,
          }
        }, workspaceId)
        break
      }

      case 'configUpdate': {
        // Update local config state from server
        if (managed.acpSession) {
          managed.acpSession.configOptions = update.configOptions
        }
        sessionLog.info(`Config update for session ${sessionId}: ${update.configOptions.length} options`)
        break
      }
    }
  }

  /**
   * Finalize streaming text into a complete assistant message.
   * Called when the ACP prompt stream ends.
   */
  private finalizeStreamingText(managed: ManagedSession): void {
    if (managed.streamingText.length > 0) {
      const sessionId = managed.id
      const workspaceId = managed.workspace.id

      // Flush any pending deltas
      this.flushDelta(sessionId, workspaceId)

      const assistantMessage: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content: managed.streamingText,
        timestamp: Date.now(),
      }
      managed.messages.push(assistantMessage)
      managed.lastMessageRole = 'assistant'
      managed.lastFinalMessageId = assistantMessage.id
      managed.streamingText = ''

      this.sendEvent({
        type: 'text_complete',
        sessionId,
        text: assistantMessage.content,
      }, workspaceId)

      this.persistSession(managed)
    }
  }

  private sendEvent(event: SessionEvent, workspaceId?: string): void {
    if (!this.windowManager) {
      sessionLog.warn('Cannot send event - no window manager')
      return
    }

    // Broadcast to ALL windows for this workspace (main + tab content windows)
    const windows = workspaceId
      ? this.windowManager.getAllWindowsForWorkspace(workspaceId)
      : []

    if (windows.length === 0) {
      sessionLog.warn(`Cannot send ${event.type} event - no windows for workspace ${workspaceId}`)
      return
    }

    // Send event to all windows for this workspace
    for (const window of windows) {
      // Check mainFrame - it becomes null when render frame is disposed
      // This prevents Electron's internal error logging before our try-catch
      if (!window.isDestroyed() &&
          !window.webContents.isDestroyed() &&
          window.webContents.mainFrame) {
        try {
          window.webContents.send(IPC_CHANNELS.SESSION_EVENT, event)
        } catch {
          // Silently ignore - expected during window closure race conditions
        }
      }
    }
  }

  /**
   * Queue a text delta for batched sending (performance optimization)
   * Instead of sending 50+ IPC events per second, batches deltas and flushes every 50ms
   */
  private queueDelta(sessionId: string, workspaceId: string, delta: string, turnId?: string): void {
    const existing = this.pendingDeltas.get(sessionId)
    if (existing) {
      // Append to existing batch
      existing.delta += delta
      // Keep the latest turnId (should be the same, but just in case)
      if (turnId) existing.turnId = turnId
    } else {
      // Start new batch
      this.pendingDeltas.set(sessionId, { delta, turnId })
    }

    // Schedule flush if not already scheduled
    if (!this.deltaFlushTimers.has(sessionId)) {
      const timer = setTimeout(() => {
        this.flushDelta(sessionId, workspaceId)
      }, DELTA_BATCH_INTERVAL_MS)
      this.deltaFlushTimers.set(sessionId, timer)
    }
  }

  /**
   * Flush any pending deltas for a session (sends batched IPC event)
   * Called on timer or when streaming ends (text_complete)
   */
  private flushDelta(sessionId: string, workspaceId: string): void {
    // Clear the timer
    const timer = this.deltaFlushTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.deltaFlushTimers.delete(sessionId)
    }

    // Send batched delta if any
    const pending = this.pendingDeltas.get(sessionId)
    if (pending && pending.delta) {
      this.sendEvent({
        type: 'text_delta',
        sessionId,
        delta: pending.delta,
        turnId: pending.turnId
      }, workspaceId)
      this.pendingDeltas.delete(sessionId)
    }
  }

  /**
   * Clean up all resources held by the SessionManager.
   * Should be called on app shutdown to prevent resource leaks.
   */
  cleanup(): void {
    sessionLog.info('Cleaning up resources...')

    // Stop all ConfigWatchers (file system watchers)
    for (const [path, watcher] of this.configWatchers) {
      watcher.stop()
      sessionLog.info(`Stopped config watcher for ${path}`)
    }
    this.configWatchers.clear()

    // Clear all pending delta flush timers
    for (const [sessionId, timer] of this.deltaFlushTimers) {
      clearTimeout(timer)
    }
    this.deltaFlushTimers.clear()
    this.pendingDeltas.clear()

    // Clear pending credential resolvers (they won't be resolved, but prevents memory leak)
    this.pendingCredentialResolvers.clear()

    // Stop the ACP client subprocess
    if (this.acpClient) {
      this.acpClient.stop()
      this.acpClient = null
      sessionLog.info('Stopped ACP client')
    }

    sessionLog.info('Cleanup complete')
  }
}
