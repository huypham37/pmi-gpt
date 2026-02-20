/**
 * @pmi-agent/shared
 *
 * Shared business logic for PMI Agent.
 * Used by the Electron app.
 *
 * Import specific modules via subpath exports:
 *   import { CraftAgent } from '@pmi-agent/shared/agent';
 *   import { loadStoredConfig } from '@pmi-agent/shared/config';
 *   import { getCredentialManager } from '@pmi-agent/shared/credentials';
 *   import { CraftMcpClient } from '@pmi-agent/shared/mcp';
 *   import { debug } from '@pmi-agent/shared/utils';
 *   import { loadSource, createSource, getSourceCredentialManager } from '@pmi-agent/shared/sources';
 *   import { createWorkspace, loadWorkspace } from '@pmi-agent/shared/workspaces';
 *
 * Available modules:
 *   - agent: CraftAgent SDK wrapper, plan tools
 *   - auth: OAuth, token management, auth state
 *   - clients: Craft API client
 *   - config: Storage, models, preferences
 *   - credentials: Encrypted credential storage
 *   - headless: Non-interactive execution mode
 *   - mcp: MCP client, connection validation
 *   - prompts: System prompt generation
 *   - sources: Workspace-scoped source management (MCP, API, local)
 *   - utils: Debug logging, file handling, summarization
 *   - validation: URL validation
 *   - version: Version and installation management
 *   - workspaces: Workspace management (top-level organizational unit)
 */

// Export branding (standalone, no dependencies)
export * from './branding.ts';
