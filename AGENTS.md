## Description:

You are working on an application names pmi-agent, the main goal of this application is to provide a UI for AI agent, it is backed by Opencode as backend agent framework. The app (client) communicates with opencode via Agent-Client Protocol (ACP).

## IMPORTANT: 
This describes the important decision that you should an should not do in the period of the session:
SHOULD NOT:
* Do not create unnessary file (report,etc) if user did not ask for.
## Memory
The application memory is structured into two different level. 
1. Issue-based memory: You can find the memory at .opencode/.memory/issue/*.md
2. Project memory: the project memory you can find it here.

### Memory Schema:
Current Step: Brief desc on the current step
(Optional) Plan
Next immediate: Brief desc on the next immediate step
(Optional) Current issues: Brief Description on current issues
Tried approach n | status | why it failed (Optional)
If current issues exists: 

Note:
* Update the memory as frequent as possible.

### Current State:
Current Step: Bundle custom OpenCode agents with the app via OPENCODE_CONFIG_DIR
- Branch: `feature/bundle-opencode-config-dir`
- Changed `apps/electron/src/main/sessions.ts`: added `OPENCODE_CONFIG_DIR` env var to `ACPClient` constructor
  - In packaged app: points to `resources/opencode-config` (bundled at build time)
  - In development: points to repo's `.opencode/` directory directly
- Changed `apps/electron/electron-builder.yml`: added top-level `extraResources` to copy `.opencode/` → `opencode-config` for all platforms (mac, win, linux)
- Rationale: fresh OpenCode installs have no custom agents; OPENCODE_CONFIG_DIR is an official OpenCode env var that loads agents/modes/plugins from a custom directory

Next immediate: Verify the app picks up the testcase-generator agent correctly at runtime

## References:
2. Find more about Opencode at: https://opencode.ai/docs
1. Find more about Agent Client Protocol at: https://agentclientprotocol.com/get-started/introduction
