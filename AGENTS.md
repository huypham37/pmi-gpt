# AGENTS.md

## Commands
- **Test:** `bun test` (single: `bun test path/to/file.test.ts`)
- **Typecheck:** `bun run typecheck:all`
- **Lint:** `bun run lint`
- **Dev:** `bun run electron:dev`
- **Build:** `bun run electron:build`

## Architecture
Bun monorepo with workspaces. Electron desktop app with OpenCode agent backend.
- `apps/electron/` - Desktop app (main/preload/renderer with React+Vite+shadcn)
- `packages/core/` - Shared TypeScript types (`@craft-agent/core`)
- `packages/shared/` - Business logic: agent, config, MCP, sessions (`@craft-agent/shared`)
- `packages/shared/src/agent/providers/` - Agent provider abstraction (OpenCode SDK)
- Config stored at `~/.craft-agent/`

## Agent Provider
- Internal tool using OpenCode SDK (`@opencode-ai/sdk`)
- No authentication required - auto-creates default workspace on first launch
- App starts OpenCode server automatically

### OpenCode Integration
OpenCode SDK is integrated via a provider abstraction layer at `packages/shared/src/agent/providers/`:
- **types.ts** - `AgentProvider` interface defining `runTurn()`, `abort()`, `dispose()`
- **opencode-provider.ts** - Wraps OpenCode SDK's `session.prompt()` + `event.subscribe()` pattern
- **factory.ts** - `createProvider('opencode', deps)` factory function

Provider emits unified `AgentEvent` types (text_delta, tool_start, tool_result, complete).

### Default Workspace
On first launch, the app auto-creates `~/.craft-agent/workspaces/default/` to hide workspace setup from users.
- `ensureDefaultWorkspace()` in `packages/shared/src/config/storage.ts` handles this
- No onboarding/authentication flow - goes straight to main app

## Code Style
- TypeScript with strict mode, ESNext target, React JSX
- Use subpath exports: `import { X } from '@craft-agent/shared/agent'`
- Tailwind CSS v4 + shadcn/ui components
- Zod for validation
- Session is primary isolation boundary (not workspace)
- Use `generateMessageId()` for message IDs

## MVP features:
- Principle: 
1. Agent-mode  
1.1. Testcase mode -> Talk with test case, generate test case.
1.1.2: main agent generate test case with steps and guidance, another agent to validate and modify if necessary. 
1.2 General Agent mode: Not at the moment to restrict

Chat-mode:
1.1. Normal chatmode with file attachment and stuffs.

## TODO: OpenCode Integration
The `CraftAgent` class in `packages/shared/src/agent/craft-agent.ts` still uses Claude SDK directly.
To complete OpenCode integration, need to:
1. Refactor `SessionManager.getOrCreateAgent()` to use `OpenCodeProvider` instead of `CraftAgent`
2. Or refactor `CraftAgent` to use the provider abstraction layer