# Fix: Stale acp-client dist — No Response from Opencode

**Date:** 2026-02-11  
**Affected:** Electron app sending messages via ACP on Windows  
**Status:** Fixed (manual rebuild)

## Problem

Sending a message (e.g. "hello") from the Electron UI to the opencode server via ACP produced no response. The prompt sat indefinitely with zero streaming updates. The `[PERF]` log showed `chat.complete` timing of 818,707ms (~13.6 minutes) with no actual output — the user aborted.

Meanwhile, the standalone Python test script (`test-acp.py`) with the same model (`github-copilot/gpt-5-mini`) and protocol worked correctly.

## Investigation

1. **ACP protocol is fine** — `test-acp.py` successfully completes the full initialize → session/new → set_model → set_mode → session/prompt flow.
2. **No `[ACP DEBUG]` logs in terminal** — The `acp-client` package uses `console.log("[ACP DEBUG]...")` but none appeared in the Electron terminal output.
3. **Perf span showed prompt was called** — `acpSession.ready:0.0ms → chat.starting:0.9ms → chat.complete:818707.6ms` confirmed the code reached `prompt()`.
4. **Build analysis** — esbuild bundles `sessions.ts` into `main.cjs` but loads `@craft-agent/acp-client` via runtime `require()` from `packages/acp-client/dist/`.

## Root Cause

The `packages/acp-client/dist/` directory contained **stale compiled output**. The source code (`ACPClient.ts`) had been updated with the WSL bridge for Windows (routing `opencode acp` through WSL to avoid the native Windows subprocess hang), but `dist/` was never rebuilt.

Since the Electron main process loads `@craft-agent/acp-client` via `require()` at runtime (not inlined by esbuild), it was running the **old compiled code** without the WSL fix. This meant:

- Native Windows `opencode.exe` was spawned directly (no WSL bridge)
- `session/prompt` hung indefinitely (the known Windows ACP hang issue)

## Fix

Rebuild the `acp-client` package:

```bash
cd packages/acp-client
npm run build
```

This compiles the current TypeScript source (with WSL bridge) into `dist/`, which the Electron app loads at runtime.

## Why It Was Hard to Diagnose

1. **Silent failure** — The prompt hung but produced no errors. The `for await` loop just never yielded updates.
2. **Logging mismatch** — The main process uses `electron-log` (scoped loggers like `sessionLog`), but `acp-client` uses raw `console.log`. Both go to stdout, but the `acp-client` debug logs from the stale `dist/` didn't have the same log points as the source.
3. **esbuild doesn't inline the package** — Despite not being marked `--external`, esbuild leaves `@craft-agent/acp-client` as a runtime `require()` due to ESM/CJS interop. So source edits require a separate build step.

## Prevention

The `acp-client` package uses `tsc` (no watch mode). Source changes are NOT automatically compiled. After editing any file in `packages/acp-client/src/`:

```bash
cd packages/acp-client && npm run build
```

Consider adding `acp-client` build to the Electron dev script or adding a `tsc --watch` mode.

## Files Involved

- `packages/acp-client/src/ACPClient.ts` — Source with WSL bridge (was correct)
- `packages/acp-client/dist/ACPClient.js` — Stale compiled output (was missing WSL bridge)
- `apps/electron/dist/main.cjs` — Loads acp-client via `require()` at runtime

## Related

- [windows-acp-hang.md](windows-acp-hang.md) — The underlying Windows ACP hang issue that the WSL bridge solves
