# Architecture Diagrams: Current vs Proposed

## Current Architecture (CraftAgent + Claude SDK)

```ascii
┌───────────────────────────────────────────────────────────────────┐
│                    Electron Renderer (React UI)                    │
│────────────────────────────────────────────────────────────────────│
│  Components:                                                        │
│  - OnboardingWizard (auth setup)                                   │
│  - AppShell (sidebar: Chats/Sources/Skills/Labels/Statuses/Views)  │
│  - ChatPage (message input, attachment UI, streaming display)      │
│  - SourceInfoPage, SkillInfoPage, Settings (multiple pages)        │
│                                                                     │
│  Flow:                                                              │
│  1. User attaches file → window.electronAPI.storeAttachment()      │
│  2. Receives StoredAttachment (storedPath, thumbnailBase64, etc.)  │
│  3. Builds processedAttachments (resized/markdown for API)         │
│  4. Calls window.electronAPI.sendMessage(sessionId, msg, attach)   │
│  5. Listens to SESSION_EVENT stream (text_delta, tool_start, etc.) │
└────────────────────────┬──────────────────────────────────────────┘
                         │
                         │ IPC (ipcRenderer.invoke/on)
                         ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Electron Main (SessionManager)                  │
│────────────────────────────────────────────────────────────────────│
│  IPC Handlers (apps/electron/src/main/ipc.ts):                     │
│  - STORE_ATTACHMENT → resize/thumbnail/markdown, write to disk     │
│  - SEND_MESSAGE → SessionManager.sendMessage()                     │
│  - SESSION_COMMAND → abort/retry/delete                            │
│                                                                     │
│  SessionManager (apps/electron/src/main/sessions.ts):              │
│  - Manages ManagedSession instances (in-memory + persistence)      │
│  - sendMessage():                                                   │
│    1. Queue management (abort if processing, queue new messages)   │
│    2. Persist user message + storedAttachments                     │
│    3. getOrCreateAgent() → lazy-create CraftAgent instance         │
│    4. Load workspace sources → buildServersFromSources()           │
│       • OAuth credential management                                │
│       • Build MCP servers + API servers from enabled sources       │
│    5. agent.setAllSources(allSources)                              │
│    6. agent.setSourceServers(mcpServers, apiServers)               │
│    7. agent.setUltrathinkOverride(enabled)                         │
│    8. for await (event of agent.chat(message, attachments)) {      │
│         processEvent(event) → batch deltas, persist, emit to UI    │
│       }                                                             │
│  - processEvent():                                                  │
│    • text_delta → batch (50ms) + send to renderer                  │
│    • tool_start/tool_result → persist, resolve icons, emit         │
│    • auth_request → pause, send auth UI prompt, wait for creds     │
│    • typed_error → auth retry flow (reinit + retry once)           │
│    • complete → usage aggregation, unread state, queue drain       │
└────────────────────────┬──────────────────────────────────────────┘
                         │
                         │ Direct SDK calls (@anthropic-ai/claude-agent-sdk)
                         ▼
┌───────────────────────────────────────────────────────────────────┐
│          CraftAgent (packages/shared/src/agent/craft-agent.ts)     │
│────────────────────────────────────────────────────────────────────│
│  Constructor:                                                       │
│  - Initialize Claude Code SDK client                               │
│  - Register session-scoped tools (SubmitPlan, OAuth, etc.)         │
│                                                                     │
│  chat(message, attachments) → AsyncGenerator<AgentEvent>:          │
│  1. Build MCP server config:                                       │
│     • Session-scoped tools (SubmitPlan, source_test, OAuth)        │
│     • Preferences server                                           │
│     • craft-agents-docs server                                     │
│     • User source MCP/API servers (from setSourceServers)          │
│  2. Configure PreToolUse hook:                                     │
│     • Permission mode checks (bypass, allow, deny)                 │
│     • Source activation auto-enable (triggers onSourceActivation)  │
│     • Path expansion (~)                                           │
│     • Config validation hooks                                      │
│  3. Call SDK session.prompt() with mcpServers config               │
│  4. Yield AgentEvent stream:                                       │
│     • text_delta, text_complete                                    │
│     • tool_start, tool_result                                      │
│     • auth_request (via onAuthRequest callback)                    │
│     • plan_submitted (via onPlanSubmitted callback)                │
│     • typed_error (API errors, auth failures)                      │
│     • usage_update, complete                                       │
└────────────────────────┬──────────────────────────────────────────┘
                         │
                         │ SDK subprocess communication
                         ▼
┌───────────────────────────────────────────────────────────────────┐
│       Claude Code SDK Runtime (@anthropic-ai/claude-agent-sdk)    │
│────────────────────────────────────────────────────────────────────│
│  - Spawns agent subprocess                                         │
│  - Manages conversation state + memory                             │
│  - Tool execution orchestration                                    │
│  - MCP client connections                                          │
│  - API calls to Anthropic Claude                                   │
└────────────────────────┬──────────────────────────────────────────┘
                         │
                         ├─────► MCP Servers (user sources: GitHub, Linear, etc.)
                         ├─────► Session tools (SubmitPlan, OAuth, etc.)
                         ├─────► Preferences server
                         └─────► Documentation server
```

---

## Proposed Architecture (ACP Client + OpenCode Runtime)

```ascii
┌───────────────────────────────────────────────────────────────────┐
│                    Electron Renderer (React UI)                    │
│────────────────────────────────────────────────────────────────────│
│  Simplified Components:                                             │
│  - AppShell (sidebar: Chats + Settings only)                       │
│  - ChatPage with:                                                   │
│    • Profile picker dropdown: Chat / Agent / Testcase              │
│    • Model selector                                                │
│    • Message input + attachment UI                                 │
│    • Streaming Markdown display                                    │
│    • (Optional) Tool timeline                                      │
│                                                                     │
│  Flow:                                                              │
│  1. User picks profile (chat/agent/testcase) + model               │
│  2. User attaches files → window.electronAPI.storeAttachment()     │
│  3. Calls window.electronAPI.sendMessage(sessionId, {              │
│       profile, model, message, attachments                         │
│     })                                                              │
│  4. Listens to SESSION_EVENT stream (text_delta, optional tools)   │
│                                                                     │
│  REMOVED:                                                           │
│  ✗ OnboardingWizard                                                │
│  ✗ Sources/Skills/Labels/Statuses/Views UI                         │
│  ✗ Complex multi-page settings                                     │
└────────────────────────┬──────────────────────────────────────────┘
                         │
                         │ IPC (ipcRenderer.invoke/on)
                         ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Electron Main (Session Bridge)                  │
│────────────────────────────────────────────────────────────────────│
│  IPC Handlers (apps/electron/src/main/ipc.ts):                     │
│  - STORE_ATTACHMENT → write to disk, return file path/URI          │
│  - SEND_MESSAGE → SessionManager.sendMessage()                     │
│  - SESSION_COMMAND → abort/delete                                  │
│                                                                     │
│  SessionManager (apps/electron/src/main/sessions.ts - REFACTORED): │
│  - Manages session metadata + message persistence                  │
│  - Uses singleton ACPClient (shared across all sessions)           │
│  - sendMessage(sessionId, { profile, model, message, attachments })│
│    1. Queue management (same as before)                            │
│    2. Persist user message + metadata                              │
│    3. Call acpClient.sendMessage(sessionId, {                      │
│         profile: 'chat' | 'agent' | 'testcase',                    │
│         model: 'claude-...',                                       │
│         message: string,                                           │
│         attachments: [{ path, type }] // file paths for subprocess │
│       })                                                            │
│    4. for await (event of acpClient.streamEvents()) {              │
│         processEvent(event) → batch deltas, emit to UI             │
│       }                                                             │
│  - processEvent():                                                  │
│    • text_delta → batch + send                                     │
│    • (optional) tool_start/tool_result → emit if ACP provides      │
│    • complete → persist, emit                                      │
│                                                                     │
│  REMOVED:                                                           │
│  ✗ CraftAgent initialization                                       │
│  ✗ buildServersFromSources / setAllSources / setSourceServers      │
│  ✗ setUltrathinkOverride                                           │
│  ✗ Auth retry flow (moved to server)                               │
│  ✗ Source activation auto-enable flow                              │
└────────────────────────┬──────────────────────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────────────────────┐
│   ACP Client (apps/electron/src/main/acp-client.ts - NEW FILE)    │
│────────────────────────────────────────────────────────────────────│
│  Thin wrapper over ACP subprocess:                                 │
│                                                                     │
│  start():                                                           │
│  - Spawn OpenCode ACP runtime as child process:                    │
│    `opencode acp` or `opencode agent --acp`                        │
│  - Communication: JSON-RPC over stdin/stdout                       │
│                                                                     │
│  createSession(workspaceId):                                       │
│  - Send JSON-RPC: { method: 'session/create', params: {...} }     │
│  - Return sessionId                                                │
│                                                                     │
│  sendMessage(sessionId, { profile, model, message, attachments }): │
│  - Send JSON-RPC: {                                                │
│      method: 'session/message',                                    │
│      params: {                                                     │
│        sessionId,                                                  │
│        mode: profile, // 'chat' | 'agent' | 'testcase'            │
│        model,                                                      │
│        message,                                                    │
│        attachments: [{ path: '/abs/path', type: 'image/png' }]    │
│      }                                                             │
│    }                                                               │
│  - Return AsyncGenerator<ACPEvent>                                 │
│                                                                     │
│  streamEvents() → AsyncGenerator<ACPEvent>:                        │
│  - Parse stdin for JSON-RPC notifications:                         │
│    • text_delta: { delta: string }                                │
│    • text_complete: {}                                            │
│    • tool_start: { tool: string, input: {...} } (optional)        │
│    • tool_result: { output: {...} } (optional)                    │
│    • complete: { usage?: {...} }                                  │
│                                                                     │
│  abort(sessionId, reason):                                         │
│  - Send JSON-RPC: { method: 'session/abort', params: {sessionId} }│
│                                                                     │
│  dispose():                                                         │
│  - Kill subprocess gracefully                                      │
└────────────────────────┬──────────────────────────────────────────┘
                         │
                         │ JSON-RPC over stdio (subprocess)
                         ▼
┌───────────────────────────────────────────────────────────────────┐
│         OpenCode Agent Runtime (ACP Server - subprocess)           │
│────────────────────────────────────────────────────────────────────│
│  Profile Registry (server-side configuration):                     │
│                                                                     │
│  Profile: "chat"                                                    │
│  - System prompt: General assistant behavior                       │
│  - Tools: disabled or minimal (read-only)                          │
│  - Model: default to specified or claude-3-5-sonnet               │
│                                                                     │
│  Profile: "agent"                                                   │
│  - System prompt: Agentic assistant with tool use                  │
│  - Tools: enabled (file ops, bash, web, MCP connections)           │
│  - Model: default to specified or claude-3-5-sonnet               │
│                                                                     │
│  Profile: "testcase"                                                │
│  - System prompt: Test case generator protocol                     │
│    "Generate structured test cases with: title, preconditions,    │
│     numbered steps, expected results, test data"                   │
│  - Multi-pass behavior (server-owned):                             │
│    1. Generate test case                                           │
│    2. Validate pass (separate agent reviews for completeness,      │
│       clarity, format, edge cases)                                 │
│    3. Return final validated test case                             │
│  - Tools: limited (read context files only)                        │
│  - Model: default or optimized for structured output               │
│                                                                     │
│  Orchestration:                                                     │
│  - Receives JSON-RPC requests from ACP client                      │
│  - Routes by profile → applies prompt + tool policy + model        │
│  - Manages LLM calls, tool execution, MCP connections              │
│  - Emits streaming events back over stdout (JSON-RPC notifications)│
│                                                                     │
│  Lifecycle:                                                         │
│  - Started as subprocess by Electron Main on app launch            │
│  - Terminated when Electron app quits                              │
└────────────────────────┬──────────────────────────────────────────┘
                         │
                         ├─────► LLM API (Anthropic Claude)
                         ├─────► MCP Servers (configured server-side)
                         ├─────► Tools (file ops, bash, web, custom)
                         └─────► Local filesystem (for attachments via paths)
```

---

## Key Differences Summary

| Aspect | Current (CraftAgent) | Proposed (ACP) |
|--------|---------------------|----------------|
| **Architecture** | Electron → CraftAgent wrapper → Claude SDK subprocess | Electron → ACP Client → OpenCode subprocess |
| **Protocol** | Custom SDK API (`agent.chat()`, `AgentEvent`) | ACP (JSON-RPC over stdio) |
| **Agent Logic** | Client-side (SessionManager + CraftAgent wrapper) | Server-side (OpenCode runtime) |
| **Profiles/Modes** | No profiles; tools/sources set via API calls | Profiles define behavior server-side |
| **Tool Configuration** | Client calls `setSourceServers()`, `setAllSources()` | Server owns tool policy per profile |
| **Multi-pass Workflows** | Client-side orchestration (testcase = 2 `runTurn()` calls) | Server-side (testcase profile handles internally) |
| **Source/MCP Management** | Client builds servers, sets on agent, auto-enable flow | Server-side MCP config (profile-specific) |
| **Auth Retry** | Client-side logic (detect error, reinit, retry) | Server-side (handled by OpenCode runtime) |
| **Attachments** | Store → resize/thumbnail → processedAttachments with base64 | Store → pass file paths (subprocess reads locally) |
| **Complexity** | High (client manages agent lifecycle, sources, auth, tools) | Low (client is thin bridge, server owns behavior) |
| **UI** | Onboarding, Sources, Skills, Labels, Statuses, Views | Chat + Settings only, profile picker |
| **Code to Delete** | Keep `CraftAgent`, provider abstraction, source building | Delete `CraftAgent`, `packages/shared/src/agent/providers/` |

---

## Data Flow Comparison

### Current: User sends message with attachment

```
User types + attaches file
  ↓
Renderer: storeAttachment(file) → IPC
  ↓
Main: resize/thumbnail/markdown → write to disk → return StoredAttachment
  ↓
Renderer: build processedAttachments (resized base64)
  ↓
Renderer: sendMessage(msg, processedAttachments) → IPC
  ↓
Main SessionManager:
  - getOrCreateAgent()
  - buildServersFromSources() → OAuth creds, MCP servers
  - agent.setAllSources(), agent.setSourceServers()
  - agent.chat(message, processedAttachments)
  ↓
CraftAgent:
  - Build full MCP config (session tools + user sources + docs)
  - PreToolUse hook (permissions, auto-enable)
  - SDK session.prompt() → subprocess
  ↓
Claude SDK subprocess → Anthropic API → stream events
  ↓
CraftAgent yields AgentEvent
  ↓
SessionManager processEvent() → batch deltas → IPC SESSION_EVENT
  ↓
Renderer displays streaming text
```

### Proposed: User sends message with attachment

```
User picks profile + types + attaches file
  ↓
Renderer: storeAttachment(file) → IPC
  ↓
Main: write to disk → return file path
  ↓
Renderer: sendMessage({ profile, model, msg, attachments: [paths] }) → IPC
  ↓
Main SessionManager:
  - acpClient.sendMessage(sessionId, { profile, model, msg, attachments })
  ↓
ACP Client:
  - JSON-RPC over stdio: { method: 'session/message', params: {...} }
  ↓
OpenCode subprocess:
  - Resolve profile → load prompt + tool policy
  - Read attachment files from paths
  - Call LLM API with profile-specific config
  - Execute tools if profile allows
  - (testcase profile: run generator + validator internally)
  - Stream events → stdout (JSON-RPC notifications)
  ↓
ACP Client parses events → AsyncGenerator<ACPEvent>
  ↓
SessionManager processEvent() → batch deltas → IPC SESSION_EVENT
  ↓
Renderer displays streaming text
```

---

## Migration Impact

### Files to Create
- `apps/electron/src/main/acp-client.ts` - ACP client wrapper (subprocess stdio transport)

### Files to Refactor
- `apps/electron/src/main/sessions.ts` - Replace CraftAgent with ACPClient
- `apps/electron/src/renderer/App.tsx` - Remove onboarding, add profile picker
- `apps/electron/src/renderer/components/app-shell/AppShell.tsx` - Simplify sidebar
- `apps/electron/src/renderer/pages/ChatPage.tsx` - Add profile dropdown

### Files/Directories to Delete (Phase 4)
- `packages/shared/src/agent/providers/` - Provider abstraction
- `packages/shared/src/agent/craft-agent.ts` - Claude SDK wrapper
- `apps/electron/src/renderer/components/onboarding/` - Onboarding wizard
- `apps/electron/src/renderer/playground/` - Playground UI
- Source/Skill pages and navigation components

### Complexity Reduction
- **Current LOC (estimate):**
  - SessionManager: ~2700 lines
  - CraftAgent: ~600 lines
  - Provider abstraction: ~400 lines
  - Source building + auth: ~800 lines
  - **Total agent runtime code: ~4500 lines**

- **Proposed LOC (estimate):**
  - SessionManager (refactored): ~1200 lines
  - ACP Client: ~300 lines
  - **Total agent runtime code: ~1500 lines**

**Reduction: ~67% less code in agent layer**
