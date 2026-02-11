---
name: agent-client-protocol
description: Using skill when the task at hand is relevant to ACP or Agent Client Protocol
---

# Agent Client Protocol (ACP)

ACP standardizes communication between editors/IDEs and AI coding agents using JSON-RPC 2.0.

Reference: https://agentclientprotocol.com/get-started/introduction

## Transport

- **Local agents**: stdio (stdin/stdout)
- **Remote agents**: HTTP with Server-Sent Events (SSE)
- Messages are JSON-RPC 2.0 formatted

## Protocol Lifecycle

```
Client                          Agent (Server)
  |                                |
  |--- initialize --------------->|  (exchange capabilities)
  |<-- initialize response -------|
  |                                |
  |--- session/new -------------->|  (create session)
  |<-- session response ----------|  (sessionId, models, modes, configOptions)
  |                                |
  |--- session/set_model -------->|  (optional: change model)
  |<-- response ------------------|
  |                                |
  |--- session/set_mode ---------->|  (optional: change mode)
  |<-- response ------------------|
  |                                |
  |--- session/prompt ----------->|  (send user message)
  |<-- streaming updates ---------|  (text, tool calls, status)
  |<-- prompt response ----------|
  |                                |
  |--- session/close ------------>|  (end session)
```

## 1. Initialize

Exchanged once per connection. No models/modes at this stage.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientInfo": { "name": "my-client", "version": "1.0.0" },
    "capabilities": { ... }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1,
    "agentInfo": { "name": "AgentName", "version": "1.0.0" },
    "agentCapabilities": { ... }
  }
}
```

## 2. Session Management

### session/new

Creates a new session. **This is where models, modes, and config options are returned.**

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/new",
  "params": {
    "cwd": "/path/to/workspace",
    "mcpServers": []
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "sessionId": "uuid-string",
    "models": {
      "currentModelId": "model-id",
      "availableModels": [
        { "modelId": "provider/model-name", "name": "Display Name" }
      ]
    },
    "modes": {
      "currentModeId": "mode-id",
      "availableModes": [
        { "id": "mode-id", "name": "Mode Name", "description": "..." }
      ]
    },
    "configOptions": [
      {
        "id": "option-id",
        "name": "Option Name",
        "description": "...",
        "category": "model|mode|thought_level",
        "type": "select",
        "currentValue": "value",
        "options": [{ "value": "v", "label": "Label" }]
      }
    ]
  }
}
```

### session/load

Resumes a previous session by sessionId. The agent replays conversation history via `session/update` notifications.

## 3. Config Options (Preferred API)

Supersedes the modes API. Agent MAY return `configOptions` in session/new response.

**Categories:** `model`, `mode`, `thought_level`

**Change a config option:**
```json
{
  "method": "session/set_config_option",
  "params": {
    "sessionId": "...",
    "configId": "option-id",
    "value": "new-value"
  }
}
```

**Agent-pushed updates:** Agent can notify the client of config changes via `config_options_update` session notification. Response always contains the COMPLETE config state.

## 4. Modes (Deprecated, use Config Options)

Agent MAY return `modes` in session/new response.

**Change mode:**
```json
{
  "method": "session/set_mode",
  "params": {
    "sessionId": "...",
    "modeId": "mode-id"
  }
}
```

**Agent-pushed updates:** `current_mode_update` notification.

During transition period, agents may send both `configOptions` and `modes`.

## 5. Models

**Change model:**
```json
{
  "method": "session/set_model",
  "params": {
    "sessionId": "...",
    "modelId": "provider/model-name"
  }
}
```

Model IDs follow the format `provider/model-name` (e.g., `lmstudio/qwen3-coder-next`, `github-copilot/gpt-5-mini`, `anthropic/claude-sonnet-4-20250514`).

## 6. Prompt Turn

**Send a prompt:**
```json
{
  "method": "session/prompt",
  "params": {
    "sessionId": "...",
    "prompt": [{ "type": "text", "text": "user message" }]
  }
}
```

During a prompt turn, the agent streams back:
- **Text content** — incremental text updates
- **Tool calls** — tool use requests with name, arguments, results
- **Status updates** — progress indicators
- **Session updates** — available commands, conversation state

## 7. Key Facts

- Models and modes are ONLY available after `session/new` — NOT from `initialize`
- `configOptions` is the preferred API over `modes` (modes is deprecated)
- Model IDs use `provider/model-name` format
- The agent can push config/mode/model changes to the client via notifications
- `session/new` requires `mcpServers` parameter (can be empty array `[]`)

## Testing

Use `./test-acp.py` to test ACP communication:

```bash
# Basic: initialize + create session (prints all available models and modes)
python3 .opencode/skills/acp/test-acp.py

# Set model after session creation
python3 .opencode/skills/acp/test-acp.py --model provider/model-name

# Set mode after session creation
python3 .opencode/skills/acp/test-acp.py --mode mode-id

# Both
python3 .opencode/skills/acp/test-acp.py --model provider/model-name --mode mode-id
```

The script spawns `opencode acp` via stdio, sends JSON-RPC messages, and prints full responses.
