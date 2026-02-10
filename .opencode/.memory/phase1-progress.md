# Phase 1: ACP Client Integration - COMPLETED

## Status: DONE
Branch: `feature/mvp-stripping`

## What Was Done

### 1. packages/acp-client/package.json
- Renamed from `acp-client-ts` to `@craft-agent/acp-client`
- Built TypeScript → `dist/` generated

### 2. apps/electron/src/main/sessions.ts (Major Refactor)

#### Imports Changed
- Removed: `CraftAgent`, `AgentEvent`, `AbortReason`, `unregisterSessionScopedToolCallbacks`, `createSdkMcpServer`
- Added: `ACPClient`, `ACPSession`, `PermissionRequest as ACPPermissionRequest`, `SessionUpdate`, `ClientCapabilitiesPresets`
- Kept: `AuthRequest`, `AuthResult`, `CredentialAuthRequest`, `PermissionMode` from `@craft-agent/shared/agent`
- Commented out: `setAnthropicOptionsEnv`, `setPathToClaudeCodeExecutable`, `setInterceptorPath`, `setExecutable`

#### ManagedSession Interface
- `agent: CraftAgent | null` → `acpSession: ACPSession | null`
- Added: `pendingACPPermissionRequest?: ACPPermissionRequest`

#### SessionManager Class
- Added: `private acpClient: ACPClient | null = null`

#### Methods Changed
| Old | New | Notes |
|-----|-----|-------|
| `initialize()` | Replaced | Was: SDK path setup + auth. Now: `ACPClient.start()` |
| `cleanup()` | Updated | Added `acpClient.stop()` |
| `getOrCreateAgent()` | `getOrCreateACPSession()` | Creates `ACPSession` via `acpClient.newSession()` |
| `sendMessage()` | Updated | `agent.chat()` → `acpSession.prompt()` streaming loop |
| `processEvent()` | `processACPUpdate()` | New method mapping `SessionUpdate` → IPC `SessionEvent` |
| `cancelProcessing()` | Updated | `agent.forceAbort()` → `acpSession.cancel()` |
| `respondToPermission()` | Updated | Maps allow/deny to ACP `PermissionOption` kinds |
| `reloadSessionSources()` | Stubbed | No-op (ACP server manages sources) |
| `setSessionSources()` | Simplified | Removed agent server building |
| `updateWorkingDirectory()` | Simplified | Removed agent call |
| `updateSessionModel()` | Updated | Uses `acpSession.setModel()` |
| `deleteSession()` | Updated | `forceAbort()` → `cancel()`, `dispose()` → `acpSession = null` |
| `setSessionThinkingLevel()` | Simplified | Removed agent call (server manages) |

#### New Method: `finalizeStreamingText()`
- Called when ACP prompt stream ends
- Flushes pending deltas, creates assistant message, sends `text_complete`

#### Event Mapping (processACPUpdate)
| ACP SessionUpdate | IPC SessionEvent |
|-------------------|-----------------|
| `text` | `text_delta` (batched) |
| `thinking` | `text_delta` (rendered as text) |
| `toolCall` (pending/in_progress) | `tool_start` |
| `toolCall` (completed/failed) | `tool_result` |
| `plan` | `text_complete` (rendered as assistant text) |
| `permissionRequest` | `permission_request` |
| `configUpdate` | Local state update only |

#### Removed Source/Skills Plumbing
- `agent.setAllSources()` calls removed
- `agent.setSourceServers()` calls removed
- `buildServersFromSources()` calls removed from hot path
- `agent.markSourceUnseen()` removed
- `agent.setThinkingLevel()` removed
- `agent.setUltrathinkOverride()` removed

### 3. apps/electron/src/main/index.ts
- No changes needed (SessionManager handles ACP lifecycle internally)

### 4. packages/shared/src/agent/providers/
- DELETED: `factory.ts`, `index.ts`, `opencode-provider.ts`, `types.ts`

## Pre-existing Typecheck Errors (NOT from our changes)
- `packages/shared/src/agent/session-scoped-tools.ts(1445)`: Missing `isGoogleOAuthConfigured`
- `apps/electron/src/renderer/pages/settings/AppearanceSettingsPage.tsx(258)`: Type mismatch
- `packages/shared/src/auth/__tests__/`: Mock type issues in test files

## Key Architecture Notes
- ACPClient spawns OpenCode as a subprocess via stdio transport (JSON-RPC)
- One ACPClient per app, one ACPSession per chat session
- Server owns tools/prompts/behavior - client just sends prompts and receives updates
- Permission requests use ACP's `PermissionRequest.respond(optionId)` pattern
- No client-side source/skills management - server handles everything

## Files Still Referencing Old Patterns (Phase 4 cleanup candidates)
- `packages/shared/src/agent/craft-agent.ts` - Still exists, not deleted yet
- Source imports in sessions.ts - Still imported but many unused now
- Auth retry logic in processEvent was removed - may need ACP equivalent later
- `buildServersFromSources()` top-level function still exists (unused in hot path)

## Next: Phase 2 - Strip UI
1. Bypass onboarding in `apps/electron/src/renderer/App.tsx`
2. Strip sidebar in `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
3. Remove unreachable pages (SourceInfoPage, SkillInfoPage, playground)
