# Claude Agent SDK vs OpenCode SDK - Comparison

## Key Similarities

✓ Both provide an AI agent with tool-calling capabilities
✓ Both support session/conversation persistence
✓ Both support MCP (Model Context Protocol) for extensibility
✓ Both support streaming responses
✓ Both have abort/cancel functionality
✓ Both handle file operations, bash commands, code editing

## API Mapping

| Claude Agent SDK | OpenCode SDK Equivalent |
|------------------|-------------------------|
| `query({ prompt, options })` | `session.prompt({ path, body })` |
| `for await (msg of query)` | `event.subscribe()` + iterate stream |
| `options.resume = sessionId` | Use existing `session.id` in `path` |
| `createSdkMcpServer()` | Configure MCP in `opencode.json` |
| `AbortController.abort()` | `session.abort({ path })` |
| Built-in tools (Read, Edit, Bash) | Built into OpenCode server |

## Architecture Differences

### Claude Agent SDK
- Single `query()` function does everything
- SDK manages subprocess internally
- Streaming is built into `query()` iterator
- Tools defined programmatically with `tool()`

### OpenCode SDK
- Client/Server architecture (REST-like API)
- Server runs separately, client connects
- Streaming via separate `event.subscribe()` SSE
- More explicit session management
- Tools configured via `opencode.json` or built-in

## Core Functions

### Claude Agent SDK
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({ prompt, options })) {
  // Handle SDKMessage
}
```

### OpenCode SDK
```typescript
import { createOpencode } from '@opencode-ai/sdk';

const { client } = await createOpencode();
const session = await client.session.create({ body: { title: 'My session' } });

// Send prompt
const result = await client.session.prompt({
  path: { id: session.id },
  body: {
    model: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet-20241022' },
    parts: [{ type: 'text', text: 'Hello!' }],
  },
});

// Stream events
const events = await client.event.subscribe();
for await (const event of events.stream) {
  console.log('Event:', event.type, event.properties);
}
```

## Session Management

### Claude Agent SDK
- Implicit: SDK manages session internally
- Resume via `options.resume = sessionId`

### OpenCode SDK
- Explicit: Full CRUD API
- `session.create()`, `session.get()`, `session.list()`, `session.delete()`
- `session.messages()` to get message history

## Refactoring Notes

To migrate CraftAgent from Claude SDK to OpenCode SDK:

1. Replace `query()` calls with `session.prompt()` + `event.subscribe()`
2. Change message type handling (SDKMessage → OpenCode event types)
3. Use OpenCode's session API instead of SDK's internal session management
4. MCP servers: move from programmatic `createSdkMcpServer()` to config-based
5. Abort: replace `AbortController` pattern with `session.abort()`

## Migration Plan

### Phase 1: Infrastructure (COMPLETED ✅)

1. **Skip authentication flow**
   - Modified `App.tsx` to go directly to `'ready'` state
   - Auto-create default workspace via `ensureDefaultWorkspace()`

2. **Remove Claude provider from abstraction layer**
   - Deleted `claude-provider.ts`
   - Updated `ProviderName` type to only `'opencode'`
   - Updated factory to only create OpenCode provider
   - Changed default provider from `'claude'` to `'opencode'`

### Phase 2: Refactor CraftAgent (TODO)

**Option A: Replace CraftAgent with OpenCodeProvider (Quick)**
- Modify `SessionManager.getOrCreateAgent()` to use `OpenCodeProvider` directly
- Lose advanced features: permissions, safe mode, MCP tools, session resume
- Fast to implement

**Option B: Refactor CraftAgent internals (Full)**
- Keep CraftAgent class structure
- Replace Claude SDK calls with OpenCode SDK equivalents
- ~3000 lines to modify
- Preserves all features

**Recommended: Option B with incremental approach**

#### Step 2.1: Create OpenCode client wrapper
```typescript
// packages/shared/src/agent/opencode-client.ts
import { createOpencode } from '@opencode-ai/sdk';

let opencodeInstance: Awaited<ReturnType<typeof createOpencode>> | null = null;

export async function getOpenCodeClient() {
  if (!opencodeInstance) {
    opencodeInstance = await createOpencode({
      config: { /* default config */ }
    });
  }
  return opencodeInstance.client;
}
```

#### Step 2.2: Replace query() in CraftAgent.chat()

**Before (Claude SDK):**
```typescript
this.currentQuery = query({ prompt, options: optionsWithAbort });
for await (const message of this.currentQuery) {
  // handle SDKMessage
}
```

**After (OpenCode SDK):**
```typescript
const client = await getOpenCodeClient();
const session = await this.ensureOpenCodeSession(client);

// Subscribe to events first
const { stream } = await client.event.subscribe();

// Send prompt (non-blocking)
client.session.prompt({
  path: { id: session.id },
  body: { parts: [{ type: 'text', text: prompt }] }
});

// Process events
for await (const event of stream) {
  const agentEvents = this.convertOpenCodeEvent(event);
  for (const evt of agentEvents) yield evt;
  if (event.type === 'done') break;
}
```

#### Step 2.3: Update message type conversion

Create mapping function:
```typescript
function convertOpenCodeEvent(event: OpenCodeEvent): AgentEvent[] {
  switch (event.type) {
    case 'message.text':
      return [{ type: 'text_delta', text: event.properties.text }];
    case 'tool.start':
      return [{ type: 'tool_start', toolName: event.properties.name, ... }];
    case 'tool.result':
      return [{ type: 'tool_result', ... }];
    case 'done':
      return [{ type: 'complete', usage: event.properties.usage }];
    default:
      return [];
  }
}
```

#### Step 2.4: Replace MCP server creation

**Before:**
```typescript
createSdkMcpServer({ name, version, tools: [...] })
```

**After:**
Configure in `opencode.json` or use OpenCode's built-in tools

#### Step 2.5: Update abort handling

**Before:**
```typescript
this.currentQueryAbortController?.abort();
// Catch AbortError
```

**After:**
```typescript
await client.session.abort({ path: { id: this.sessionId } });
```

### Phase 3: Cleanup (TODO)

1. Remove `@anthropic-ai/claude-agent-sdk` from dependencies
2. Remove unused Claude-specific imports and types
3. Update tests
4. Update AGENTS.md documentation

### Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/agent/craft-agent.ts` | Replace Claude SDK with OpenCode SDK |
| `packages/shared/src/agent/options.ts` | Remove Claude-specific options |
| `apps/electron/src/main/sessions.ts` | Update agent creation if needed |
| `package.json` | Remove Claude SDK dependency |
| `AGENTS.md` | Update documentation |
