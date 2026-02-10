# PMI-Agent Config Analysis: What to Keep for OpenCode Integration

## Current Actual Config (from ~/.craft-agent/config.json)

```json
{
  "workspaces": [...],
  "activeWorkspaceId": "1c9e87c3-bed5-b82a-2cfd-9f298e4e8b8e",
  "activeSessionId": null,
  "provider": "opencode",
  "notificationsEnabled": true
}
```

## Full StoredConfig Interface

```typescript
export interface StoredConfig {
  // === CORE AGENT FIELDS (KEEP FOR OPENCODE) ===
  authType?: AuthType;                    // 'api_key' | 'oauth_token'
  anthropicBaseUrl?: string;              // Custom API base URL (for LMStudio, Ollama, etc.)
  customModel?: string;                   // Custom model override
  provider?: AgentProviderType;           // 'opencode' - REQUIRED
  
  // === WORKSPACE & SESSION (KEEP) ===
  workspaces: Workspace[];                // REQUIRED - List of workspaces
  activeWorkspaceId: string | null;       // REQUIRED - Current active workspace
  activeSessionId: string | null;         // REQUIRED - Current active session
  
  // === MODEL CONFIGURATION (KEEP) ===
  model?: string;                         // Model selection
  
  // === UI PREFERENCES (OPTIONAL - Can remove if headless) ===
  notificationsEnabled?: boolean;         // Desktop notifications (default: true)
  colorTheme?: string;                    // Theme ID (e.g., 'dracula', 'nord')
  dismissedUpdateVersion?: string;        // Auto-update dismissed version
  autoCapitalisation?: boolean;           // Auto-capitalize input (default: true)
  sendMessageKey?: 'enter' | 'cmd-enter'; // Send message keybinding
  spellCheck?: boolean;                   // Spell check in input (default: false)
}
```

## Workspace Interface

```typescript
export interface Workspace {
  id: string;                   // UUID - REQUIRED
  name: string;                 // Display name - REQUIRED
  rootPath: string;             // Absolute path to workspace folder - REQUIRED
  createdAt: number;            // Timestamp - REQUIRED
  lastAccessedAt?: number;      // For sorting recent workspaces
  iconUrl?: string;             // Workspace icon
  mcpUrl?: string;              // MCP server URL (if using custom MCP)
  mcpAuthType?: McpAuthType;    // 'workspace_oauth' | 'workspace_bearer' | 'public'
}
```

---

## Recommendation: What to Keep for OpenCode Integration

### ✅ MUST KEEP (Core Functionality)

```typescript
interface PMIAgentConfig {
  // Provider settings
  provider: 'opencode';                   // Always 'opencode'
  authType?: 'api_key' | 'oauth_token';   // How user authenticates
  anthropicBaseUrl?: string;              // LMStudio/Ollama/Custom endpoint
  customModel?: string;                   // Model override
  
  // Workspace & Session management
  workspaces: Workspace[];                // Workspace list
  activeWorkspaceId: string | null;       // Current workspace
  activeSessionId: string | null;         // Current session
  
  // Model
  model?: string;                         // Model selection
}
```

### ⚠️ OPTIONAL (UI-Related - Remove if Headless)

```typescript
interface PMIAgentUIConfig {
  notificationsEnabled?: boolean;
  colorTheme?: string;
  dismissedUpdateVersion?: string;
  autoCapitalisation?: boolean;
  sendMessageKey?: 'enter' | 'cmd-enter';
  spellCheck?: boolean;
}
```

---

## How Config Works with OpenCode

### 1. **Provider Field**
- **Current value:** `"opencode"`
- **Purpose:** Tells the app to use OpenCode as the agent backend
- **Usage:** `getProvider()` → `'opencode'`
- **Must keep:** ✅ YES

### 2. **API Configuration**
- `authType`: How user authenticates (API key vs OAuth)
- `anthropicBaseUrl`: Override for LMStudio/Ollama endpoints
- `customModel`: Model override for custom endpoints
- **Must keep:** ✅ YES (for flexibility with different LLM providers)

### 3. **Workspace System**
- Each workspace has its own folder: `~/.craft-agent/workspaces/{id}/`
- Contains:
  - `config.json` - Workspace-specific settings
  - `sessions/` - Chat sessions
  - `sources/` - MCP servers, APIs
  - `permissions.json` - Permission overrides
  - `theme.json` - Theme overrides
- **Must keep:** ✅ YES (core architecture)

### 4. **Session Tracking**
- `activeSessionId` tracks the current conversation
- Sessions are the primary isolation boundary
- **Must keep:** ✅ YES (critical for OpenCode)

---

## Minimal Config for OpenCode (Recommended)

```typescript
interface MinimalPMIConfig {
  // Required core fields
  provider: 'opencode';
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeSessionId: string | null;
  
  // Optional but recommended
  authType?: 'api_key' | 'oauth_token';
  anthropicBaseUrl?: string;        // For LMStudio, Ollama
  customModel?: string;
  model?: string;
  
  // UI fields (only if building UI)
  notificationsEnabled?: boolean;
  colorTheme?: string;
}
```

---

## Environment Variables to Support

```bash
# Config directory (multi-instance support)
CRAFT_CONFIG_DIR=~/.craft-agent

# API configuration
ANTHROPIC_API_KEY=sk-...
ANTHROPIC_BASE_URL=http://localhost:1234/v1  # LMStudio/Ollama

# Model override
ANTHROPIC_MODEL=custom-model

# Debug logging
CRAFT_DEBUG=1
```

---

## Config Loader Pattern (From storage.ts)

```typescript
// 1. Load with defaults
export function loadStoredConfig(): StoredConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  const content = readFileSync(CONFIG_FILE, 'utf-8');
  const config = JSON.parse(content) as StoredConfig;
  
  // Expand paths (~ and ${HOME})
  for (const workspace of config.workspaces) {
    workspace.rootPath = expandPath(workspace.rootPath);
  }
  
  return config;
}

// 2. Getter/Setter pattern
export function getProvider(): AgentProviderType {
  const config = loadStoredConfig();
  return config?.provider ?? 'opencode';  // Default
}

export function setProvider(provider: AgentProviderType): void {
  const config = loadStoredConfig();
  if (!config) return;
  config.provider = provider;
  saveConfig(config);
}

// 3. Save atomically
export function saveConfig(config: StoredConfig): void {
  const toSave = { ...config };
  
  // Convert paths to portable format (~)
  for (const workspace of toSave.workspaces) {
    workspace.rootPath = toPortablePath(workspace.rootPath);
  }
  
  writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
}
```

---

## Summary: Fields to Keep for OpenCode

| Field | Keep? | Reason |
|-------|-------|--------|
| `provider` | ✅ YES | Identifies OpenCode as backend |
| `workspaces` | ✅ YES | Core architecture |
| `activeWorkspaceId` | ✅ YES | Session context |
| `activeSessionId` | ✅ YES | Conversation tracking |
| `authType` | ✅ YES | API key vs OAuth |
| `anthropicBaseUrl` | ✅ YES | LMStudio/Ollama support |
| `customModel` | ✅ YES | Model flexibility |
| `model` | ✅ YES | Model selection |
| `notificationsEnabled` | ⚠️ OPTIONAL | UI only |
| `colorTheme` | ⚠️ OPTIONAL | UI only |
| `dismissedUpdateVersion` | ❌ NO | Auto-updater specific |
| `autoCapitalisation` | ❌ NO | Input UI specific |
| `sendMessageKey` | ❌ NO | Input UI specific |
| `spellCheck` | ❌ NO | Input UI specific |

**Verdict:** Keep 8 core fields, optionally 2 UI fields, remove 4 UI-specific fields.
