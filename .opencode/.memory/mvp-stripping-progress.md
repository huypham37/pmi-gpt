# MVP Stripping Progress

## Status: Phase 1, 2 & 3 COMPLETED
Branch: `feature/mvp-stripping`

---

## Phase 1: ACP Client Integration - COMPLETED

### packages/acp-client/package.json
- Renamed from `acp-client-ts` to `@craft-agent/acp-client`
- Built TypeScript → `dist/` generated

### apps/electron/src/main/sessions.ts (Major Refactor)

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

### apps/electron/src/main/index.ts
- No changes needed (SessionManager handles ACP lifecycle internally)

### packages/shared/src/agent/providers/
- DELETED: `factory.ts`, `index.ts`, `opencode-provider.ts`, `types.ts`

---

## Phase 2: Strip UI to "Chat + Attachments" - COMPLETED

### Step 2.1: Bypass Onboarding
**File:** `apps/electron/src/renderer/App.tsx`

**Changes:**
- Commented out the `OnboardingWizard` component render block
- App already initializes `appState` to `'ready'` via the `ensureDefaultWorkspace()` flow
- Onboarding code preserved in comments for potential future restoration

**Result:** App launches directly to main chat interface without onboarding flow.

### Step 2.2: Simplify Navigation
**File:** `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

**Changes:**
- Removed sidebar sections:
  - Status (todo states)
  - Labels
  - Sources (APIs, MCPs, Local Folders)
  - Skills
- Kept sidebar sections:
  - All Chats
  - Flagged
  - Settings (App, Shortcuts only)

**Result:** Sidebar now shows only essential chat navigation + settings.

### Step 2.3: Remove Unreachable Pages

**File:** `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx`
- Removed imports: `SourceInfoPage`, `SkillInfoPage`, `SourcesListPanel`, `SkillsListPanel`, `AppearanceSettingsPage`, `InputSettingsPage`, `WorkspaceSettingsPage`, `PermissionsSettingsPage`, `LabelsSettingsPage`, `PreferencesPage`
- Removed settings subpage navigation logic (now only `app` and `shortcuts` routes)
- Simplified to only render `ChatPage` and `AppSettingsPage`/`ShortcutsPage`

**File:** `apps/electron/src/renderer/pages/index.ts`
- Removed exports: `SourceInfoPage`, `SkillInfoPage`, and other non-MVP pages
- Kept exports: `ChatPage`, `AppSettingsPage`, `ShortcutsPage`

**File:** `apps/electron/src/renderer/pages/settings/index.ts`
- Removed exports: `SettingsNavigator`, `AppearanceSettingsPage`, `InputSettingsPage`, `WorkspaceSettingsPage`, `PermissionsSettingsPage`, `LabelsSettingsPage`, `PreferencesPage`
- Kept exports: `AppSettingsPage`, `ShortcutsPage`

**Result:** Only core pages are exported and accessible. Other pages still exist in source but are no longer reachable from UI.

---

## Pre-existing Typecheck Errors (NOT from our changes)
- `packages/shared/src/agent/session-scoped-tools.ts(1445)`: Missing `isGoogleOAuthConfigured`
- `apps/electron/src/renderer/pages/settings/AppearanceSettingsPage.tsx(258)`: Type mismatch
- `packages/shared/src/auth/__tests__/`: Mock type issues in test files

## Pre-existing Lint Warnings (NOT from our changes)
- Multiple React hook dependency warnings in various components

## Pre-existing Test Failures (NOT from our changes)
- `packages/mermaid` package: Edge label rendering, theme issues
- `packages/shared/src/auth/__tests__/`: OAuth test mock type issues

---

## Key Architecture Notes
- ACPClient spawns OpenCode as a subprocess via stdio transport (JSON-RPC)
- One ACPClient per app, one ACPSession per chat session
- Server owns tools/prompts/behavior - client just sends prompts and receives updates
- Permission requests use ACP's `PermissionRequest.respond(optionId)` pattern
- No client-side source/skills management - server handles everything
- Onboarding is bypassed - app launches directly to chat
- UI is simplified to core navigation (chats + settings)

---

## Files Still Referencing Old Patterns (Phase 4 cleanup candidates)
- `packages/shared/src/agent/craft-agent.ts` - Still exists, not deleted yet
- Source imports in sessions.ts - Still imported but many unused now
- `apps/electron/src/renderer/pages/settings/AppearanceSettingsPage.tsx` - Not accessible but still exists
- `apps/electron/src/renderer/pages/settings/LabelsSettingsPage.tsx` - Not accessible but still exists
- `apps/electron/src/renderer/pages/settings/WorkspaceSettingsPage.tsx` - Not accessible but still exists
- `apps/electron/src/renderer/pages/settings/PermissionsSettingsPage.tsx` - Not accessible but still exists
- `apps/electron/src/renderer/pages/settings/PreferencesPage.tsx` - Not accessible but still exists
- `apps/electron/src/renderer/pages/settings/InputSettingsPage.tsx` - Not accessible but still exists
- `apps/electron/src/renderer/pages/SourceInfoPage.tsx` - Not accessible but still exists
- `apps/electron/src/renderer/pages/SkillInfoPage.tsx` - Not accessible but still exists

---

## Phase 3: Profile Selection - COMPLETED

### Step 3.1: Added `AgentProfile` type to shared types
- **File:** `packages/shared/src/sessions/types.ts`
  - Added `AgentProfile` type: `'chat' | 'agent' | 'testcase'`
  - Added `profile?: AgentProfile` to `SessionConfig`, `SessionHeader`, `SessionMetadata`

### Step 3.2: Added profile types to renderer shared types
- **File:** `apps/electron/src/shared/types.ts`
  - Imported/re-exported `AgentProfile`
  - Added `profile?: AgentProfile` to renderer `Session` interface
  - Added `setProfile` to `SessionCommand` union
  - Added `session_profile_changed` to `SessionEvent` union

### Step 3.3: Added profile persistence, hydration, IPC
- **File:** `packages/shared/src/sessions/index.ts` — exported `AgentProfile`
- **File:** `apps/electron/src/main/sessions.ts`
  - Added `profile` to `ManagedSession`, hydration, and persistence
  - Added `setSessionProfile()` method
- **File:** `packages/shared/src/sessions/storage.ts` — profile in metadata extraction
- **File:** `packages/shared/src/sessions/jsonl.ts` — profile in session loading/header building
- **File:** `apps/electron/src/main/ipc.ts` — wired `setProfile` command

### Step 3.4-3.5: Added profile props and dropdown UI
- **File:** `apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx` — profile/onProfileChange props
- **File:** `apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx`
  - Added profile/onProfileChange props
  - Built profile picker dropdown (Chat/Agent/Testcase options, left of model selector)

### Step 3.6: Wired ChatPage callbacks
- **File:** `apps/electron/src/renderer/pages/ChatPage.tsx`
  - `handleProfileChange` callback via `sessionCommand`
  - Passed `profile`/`onProfileChange` to both `ChatDisplay` renders

### Step 3.7: Added event processor support
- **File:** `apps/electron/src/renderer/event-processor/types.ts` — `SessionProfileChangedEvent`
- **File:** `apps/electron/src/renderer/event-processor/handlers/session.ts` — `handleSessionProfileChanged()`
- **File:** `apps/electron/src/renderer/event-processor/processor.ts` — case handler
- **File:** `apps/electron/src/renderer/App.tsx` — added to `handoffEventTypes`

### Step 3.8: Typecheck verification — PASSED
- `bun run typecheck:all` — only pre-existing errors
- `bun run tsc --noEmit` (electron) — only pre-existing errors
- Zero new errors from Phase 3 changes

---

## Next: Phase 4 - Delete Non-MVP Code (After Stabilization)

### Step 4.1: Remove Playground
- Delete: `apps/electron/src/renderer/playground/**`
- Update: Remove playground routes from dev menu

### Step 4.2: Remove Source/Skills Features
- UI: Delete `SourceInfoPage.tsx`, `SkillInfoPage.tsx`, navigator components
- Keep shared logic in `packages/shared/src/sources/` and `packages/shared/src/skills/` (dormant)

### Step 4.3: Delete CraftAgent and provider abstraction remnants
- Delete: `packages/shared/src/agent/craft-agent.ts`
- Delete: `packages/shared/src/agent/providers/` (already done in Phase 1)
- Clean up any unused Claude SDK dependencies in `package.json`

### Step 4.4: Optional Hard Strips (for minimal desktop shell)
- Auto-update system
- Sentry error tracking
- Deep link handling
- Thumbnail protocol
- Notification system

---

## Verification Checklist

After Phase 2:
- [x] `bun run typecheck:all` - Pre-existing errors only
- [x] `bun run lint` - Pre-existing warnings only
- [x] `bun run test` - Pre-existing failures only
- [x] App launches without onboarding
- [ ] Can create new chat session
- [ ] Can send message with text
- [ ] Can attach files (image + text)
- [ ] Can switch profiles (chat ↔ agent ↔ testcase) - Phase 3
- [ ] Session persists across app restart
