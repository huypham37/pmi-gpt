# MVP Stripping Plan

**Goal:** Strip the Bun/Electron monorepo app to core MVP features defined in AGENTS.md while maintaining a runnable app.

## MVP Features (Clarified)

### Profiles (all via ACP)
All modes use the same UI flow: user picks a profile, types message, attaches files, receives streamed response.

1. **Chat Profile**: mode/type + model selection (server decides prompts/tools/policies)
2. **Agent Profile**: mode/type + model selection (server decides prompts/tools/policies)
3. **Testcase Profile**: specialized mode/type + model (server implements testcase protocol, including any multi-pass validation)

### Key Principles
- **No client-side "tools on/off" toggle** - when user switches profile, client sends ACP request with the corresponding mode
- **No client-side multi-turn pipeline** - server owns any multi-pass behavior (e.g., testcase generation + validation)
- **Single UX flow** - all profiles share the same chat interface

## Current State Analysis

### Architecture
- Bun monorepo with Electron desktop app
- Current backend uses `CraftAgent` (Claude SDK) - **will be completely removed**
- Provider abstraction exists (`packages/shared/src/agent/providers/`) - **will be deleted**
- **Goal:** Electron Main becomes a thin ACP client to OpenCode runtime; OpenCode runtime owns tools/MCP/prompts
- File attachments: Fully implemented in renderer + main process with storage/thumbnails

### Non-MVP Features to Remove/Disable
- **Onboarding wizard** (`apps/electron/src/renderer/components/onboarding/`)
- **Playground** (`apps/electron/src/renderer/playground/`)
- **Sources** (MCP servers, API integrations) - UI + backend plumbing
- **Skills** - UI + backend plumbing
- **Labels** - Filtering system
- **Statuses/Views** - Session organization
- **Multiple complex settings pages** - Keep minimal settings only

## Implementation Plan

### Phase 1: Replace CraftAgent with ACP Client

**Step 1.1: Implement ACP client wrapper**
- **File:** `apps/electron/src/main/acp-client.ts` (new file)
- **Implementation:**
  - Create ACP client using **subprocess stdio transport** (recommended for MVP)
    - Launch OpenCode ACP runtime as child process on Electron app start
    - Communicate via JSON-RPC over stdin/stdout
  - Core methods:
    - `start()` - spawn OpenCode agent process
    - `createSession(workspaceId: string)` - create/restore ACP session
    - `sendMessage(sessionId, { profile, model, message, attachments })` - send user message with profile context
    - `streamEvents()` - async generator yielding ACP events (text_delta, tool_start, tool_result, etc.)
    - `abort(sessionId, reason)` - abort current turn
    - `dispose()` - cleanup subprocess
  - **Attachments strategy:** pass file paths/URIs (subprocess can read local files directly)
  - **Tool events:** MVP renders streamed text only; tool timeline is optional

**Step 1.2: Refactor SessionManager to use ACP client**
- **File:** `apps/electron/src/main/sessions.ts`
- **Changes:**
  - Remove all `CraftAgent` imports and usage
  - Replace `agent: CraftAgent | null` with `acpClient: ACPClient` (singleton shared across sessions)
  - Remove `agent.setAllSources()`, `agent.setSourceServers()`, `buildServersFromSources()` calls (MVP doesn't need Sources/Skills)
  - Replace `agent.chat(message, attachments)` loop with:
    ```typescript
    for await (const event of acpClient.sendMessage(sessionId, {
      profile: session.profile || 'chat',
      model: session.model,
      message,
      attachments
    })) {
      // Map ACP events to existing UI event handlers
      processEvent(event);
    }
    ```

**Step 1.3: Delete provider abstraction**
- **Delete directory:** `packages/shared/src/agent/providers/`
- **Follow-ups:**
  - Remove any imports/exports referencing it from `packages/shared/src/agent/index.ts`
  - Mark `packages/shared/src/agent/craft-agent.ts` as deprecated (can delete in Phase 4)

### Phase 2: Strip UI to "Chat + Attachments"

**Step 2.1: Bypass Onboarding**
- **File:** `apps/electron/src/renderer/App.tsx`
- **Changes:**
  - Line 152: Initialize `appState` to `'ready'` instead of `'loading'`
  - Lines 1311-1329: Remove `OnboardingWizard` from render tree
  - Keep default workspace auto-creation in main process

**Step 2.2: Simplify Navigation**
- **File:** `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- **Changes:**
  - Remove/hide sidebar items: Sources, Skills, Labels, Statuses, Views
  - Keep: Chats navigator + minimal Settings
  - Update navigation state handling to only support chat routes

**Step 2.3: Remove Unreachable Pages**
- Keep: `apps/electron/src/renderer/pages/ChatPage.tsx`
- Remove/disable: `SourceInfoPage.tsx`, `SkillInfoPage.tsx`, complex settings pages
- Keep minimal: `AppSettingsPage.tsx` (for model selection + reset)

### Phase 3: Implement Profile Selection (Server-Owned Behavior)

**Step 3.1: Add Profile Selection to Session**
- **Storage:** Add `profile: 'chat' | 'agent' | 'testcase'` to session metadata
- **UI:** Add profile picker in chat header (dropdown or toggle)
- **Persistence:** Store in session config, survives app restart

**Step 3.2: No Client Pipeline**
- Client simply sends profile with each message:
  ```typescript
  acpClient.sendMessage(sessionId, {
    profile: session.profile, // 'chat' | 'agent' | 'testcase'
    model: session.model,
    message: userMessage,
    attachments
  });
  ```
- **Server responsibility:** OpenCode ACP runtime interprets `profile: 'testcase'` and applies:
  - Testcase-specific system prompt
  - Tool access policy
  - Any multi-pass validation logic (generation + validator agent pass)
  - Response formatting rules

### Phase 4: Delete Non-MVP Code (After Stabilization)

**Step 4.1: Remove Playground**
- Delete: `apps/electron/src/renderer/playground/**`
- Update: Remove playground routes from dev menu

**Step 4.2: Remove Source/Skills Features**
- UI: Delete `SourceInfoPage.tsx`, `SkillInfoPage.tsx`, navigator components
- Keep shared logic in `packages/shared/src/sources/` and `packages/shared/src/skills/` (dormant)

**Step 4.3: Delete CraftAgent and provider abstraction remnants**
- Delete: `packages/shared/src/agent/craft-agent.ts`
- Delete: `packages/shared/src/agent/providers/` (already done in Phase 1)
- Clean up any unused Claude SDK dependencies in `package.json`

**Step 4.4: Optional Hard Strips (for minimal desktop shell)**
- Auto-update system
- Sentry error tracking
- Deep link handling
- Thumbnail protocol
- Notification system

## Verification Checklist

After each phase:
- [ ] `bun run typecheck:all` passes
- [ ] `bun run test` passes
- [ ] `bun run electron:dev` launches successfully
- [ ] Can create new chat session
- [ ] Can send message with text
- [ ] Can attach files (image + text)
- [ ] Can switch profiles (chat ↔ agent ↔ testcase)
- [ ] Session persists across app restart

## Key Files Modified

### Backend (Main Process)
- `apps/electron/src/main/acp-client.ts` - **New:** ACP client wrapper (subprocess transport)
- `apps/electron/src/main/sessions.ts` - Refactored to use ACP client instead of CraftAgent
- `apps/electron/src/main/index.ts` - App initialization (optional cleanup)

### Provider Layer (DELETED)
- `packages/shared/src/agent/providers/` - **Entire directory deleted in Phase 1**

### Frontend (Renderer)
- `apps/electron/src/renderer/App.tsx` - Bypass onboarding
- `apps/electron/src/renderer/components/app-shell/AppShell.tsx` - Simplified navigation
- `apps/electron/src/renderer/pages/ChatPage.tsx` - Add profile picker

## Risk Mitigation

1. **Work on feature branch:** `feature/mvp-stripping` (already on it)
2. **Commit after each phase** so rollback is easy
3. **Keep deleted code in git history** for potential restoration
4. **Test thoroughly** after Phase 1 before proceeding to Phase 2
5. **Don't delete shared packages** until UI is fully decoupled

## Open Questions

1. **Settings minimal vs none?** 
   - **Recommendation:** Keep minimal settings (model selector + reset app)
   
2. **Profile picker UI placement?**
   - **Recommendation:** Dropdown in chat header showing "Chat", "Agent", "Testcase"
   
3. **Delete or disable Sources/Skills?**
   - **Recommendation:** Disable in Phase 2, delete in Phase 4 (after stabilization)

4. **Keep or remove auto-update?**
   - **Recommendation:** Keep for now (minimal overhead, useful for distribution)

## Timeline Estimate

- Phase 1: 6-8 hours (ACP client implementation + SessionManager refactor + provider deletion)
- Phase 2: 2-3 hours (UI simplification)
- Phase 3: 2-3 hours (Profile selection UI + persistence)
- Phase 4: 2-3 hours (Code deletion + cleanup)

**Total:** 12-17 hours

## Success Criteria

MVP is achieved when:
1. App launches without onboarding
2. Can create chat sessions and send messages
3. File attachments work (images + text files)
4. Profile selection works (can switch between chat/agent/testcase profiles)
5. Settings allow model selection
6. No references to Sources/Skills in active UI paths
7. OpenCode ACP subprocess starts/stops cleanly with Electron app
8. All tests pass
9. Bundle size reduced by ~30-40%

## Architecture Diagram

```ascii
┌─────────────────────────────────────────────┐
│      Electron Renderer (React UI)           │
│─────────────────────────────────────────────│
│ - Profile picker (chat/agent/testcase)      │
│ - Message input + attachments                │
│ - Streamed Markdown output                   │
│ - (Optional) Tool timeline                   │
└──────────────────┬──────────────────────────┘
                   │ IPC
                   ▼
┌─────────────────────────────────────────────┐
│      Electron Main (Session Bridge)         │
│─────────────────────────────────────────────│
│ - Session persistence (messages, metadata)   │
│ - Attachment storage (disk)                  │
│ - ACP Client (subprocess stdio)              │
│   • start/stop OpenCode subprocess           │
│   • create/restore session IDs               │
│   • send: {profile, model, msg, attachments} │
│   • stream: text_delta + tool events         │
└──────────────────┬──────────────────────────┘
                   │ ACP (JSON-RPC over stdio)
                   ▼
┌─────────────────────────────────────────────┐
│    OpenCode Agent Runtime (ACP Server)      │
│─────────────────────────────────────────────│
│ - Profile registry (server-side):           │
│   • "chat": tools off, prompt A, model X    │
│   • "agent": tools on, prompt B, model Y    │
│   • "testcase": prompt C + validation pass  │
│ - Orchestrates: LLM calls, tools, MCP        │
│ - Emits: text deltas + tool events           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
            Tools / MCP / APIs / FS
```

## Transport: Subprocess vs Remote

**Subprocess (stdio JSON-RPC)** ✅ Recommended for MVP
- Electron Main spawns OpenCode as child process
- Communication over stdin/stdout
- Pros: simple, no network config, local file paths work, tied to app lifecycle
- Cons: runs on user machine, resource use is local

**Remote (ws/http JSON-RPC)**
- Electron connects to pre-running OpenCode server
- Pros: centralized, easier updates, scalable
- Cons: attachments need upload, requires auth/config, network failure modes

**Decision:** Use subprocess for MVP (simpler, attachments "just work")
