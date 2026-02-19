---
name: test-case-generation
description: Using skill when the task involves the test-case generation pipeline — understanding, debugging, or modifying how WSTG test cases are generated
---

# Test Case Generation Pipeline

Generates OWASP WSTG-based security test cases using a two-pass RAG architecture with LMStudio (local LLM) for retrieval and OpenCode ACP for generation.

## Architecture Overview

```
User enters attack vector
        │
        ▼
┌─ Renderer ────────────────────────────┐
│  TestCaseGeneratorPage.tsx            │
│  calls electronAPI.generateTestCases()│
└───────────────┬───────────────────────┘
                │ IPC (TESTCASES_GENERATE)
                ▼
┌─ Main Process ────────────────────────┐
│                                       │
│  1. Load project context              │
│     manifest.json → docs              │
│                                       │
│  2. PASS 1: RAG Selection (LMStudio)  │
│     thin content (45KB) → model       │
│     → 1 primary + 2 secondary IDs     │
│                                       │
│  3. PASS 2: Prompt Augmentation       │
│     full content (826KB) + context    │
│     → augmented prompt                │
│                                       │
│  4. ACP Session (testcase profile)    │
│     prompt → markdown response        │
│                                       │
│  5. Parse → TestCase[] → storage      │
└───────────────┬───────────────────────┘
                │ IPC response
                ▼
        UI displays test cases
```

## Key Files

| File | Role |
|------|------|
| `apps/electron/src/renderer/pages/TestCaseGeneratorPage.tsx` | UI: input, loading state, error display |
| `apps/electron/src/main/ipc.ts` | IPC handler: orchestrates the 6-step pipeline |
| `apps/electron/src/main/lmstudio.ts` | Pass 1: LMStudio connection, model auto-load, WSTG selection |
| `apps/electron/src/main/wstg-selection-prompt.ts` | Builds the thin-content selection prompt |
| `apps/electron/src/main/wstg-prompt.ts` | Pass 2: builds augmented prompt with full WSTG + project context |
| `apps/electron/src/main/sessions.ts` | ACP session management (creates `testcase` profile session) |
| `apps/electron/src/shared/testcase-parser.ts` | Parses markdown response → `TestCase[]` |
| `packages/shared/src/testcases/storage.ts` | Persists test cases to `testcases.json` |
| `packages/shared/src/config/models.ts` | Model config: default model ID, context window |

## Data Files

| File | Built By | Used In | Size |
|------|----------|---------|------|
| `apps/electron/src/main/wstg-thin-content.json` | `scripts/build-wstg-thin-json.ts` | Pass 1 (selection) | ~45KB, 108 entries |
| `apps/electron/src/main/wstg-full-content.json` | `scripts/build-wstg-json.ts` | Pass 2 (augmentation) | ~826KB |
| `{workspace}/context/manifest.json` | User uploads | Pass 2 (project context) | Varies |

Rebuild data files: `bun run build:wstg` from `apps/electron/`.

## Pass 1: RAG Selection (LMStudio)

**File:** `apps/electron/src/main/lmstudio.ts` → `selectRelevantWSTGEntries(attackVector)`

1. Connect to LMStudio via `@lmstudio/sdk`
2. Get or auto-load model (`getOrLoadModel()`):
   - Try `client.llm.model()` for any loaded model
   - On `noModelMatchingQuery` / `specificModelUnloaded` error → auto-load via `client.llm.load(path, { config: { context_length } })`
   - On `pathNotFound` → throw user-friendly "not downloaded" error
3. Build selection prompt via `buildWSTGListPrompt(attackVector)` using thin content
4. Send to model with system prompt `wstg-selection-system.md`, temperature 0.1
5. Parse response: expects `{ "primary": "WSTG-XXXX-XX", "secondary": ["...", "..."] }`
   - JSON parse first, regex fallback for robustness

## Pass 2: Augmented Generation (ACP)

**File:** `apps/electron/src/main/wstg-prompt.ts` → `buildAugmentedPrompt()`

1. Fetch full markdown for primary entry from `wstg-full-content.json`
2. Include brief summaries for secondary entries
3. Inject project description + uploaded document text
4. Append formatting instructions from `wstg-testcase-instructions.md`

**ACP Session:**
- Profile: `testcase` → maps to `testcase-generator` agent mode
- Agent config: `.opencode/agents/testcase-generator.md`
- Temperature: 0.1, write/edit/bash tools disabled (read-only)
- Sends augmented prompt, collects streaming markdown response

## Parsing & Storage

**Parser:** `apps/electron/src/shared/testcase-parser.ts`
- Splits by `---` separators into blocks
- Extracts bold field labels: `**Name:**`, `**Attack Vector:**`, etc.
- Parses Guidance and Reference markdown tables
- Enriches with IDs (`tc-{timestamp}-{index}-{random}`), workspace/session metadata, timestamps

**Storage:** `packages/shared/src/testcases/storage.ts`
- Flat file: `CONFIG_DIR/testcases.json`
- Operations: `saveTestCases()` (batch upsert), `listTestCases()`, `getTestCase(id)`, `deleteTestCase(id)`

## Error Handling

Errors bubble from main process through IPC rejection to `TestCaseGeneratorPage` catch block → red error banner.

| Error | Source | Behavior |
|-------|--------|----------|
| `noModelMatchingQuery` | LMStudio | Auto-load attempt → retry |
| `pathNotFound` | LMStudio | "Model not downloaded. Please download in LMStudio." |
| `processNotRunning` | ACP | "Agent process is not running" |
| Connection errors | LMStudio/ACP | Surfaced to UI |

## Tests

**File:** `apps/electron/src/main/__tests__/lmstudio.test.ts`

```bash
cd apps/electron && bun test src/main/__tests__/lmstudio.test.ts
```

Test suites:
- `buildWSTGListPrompt`: verifies attack vector inclusion, WSTG IDs, uses titles not descriptions
- `wstg-thin-content.json` integrity: 108 entries, key format, non-empty values, matches `WSTG_ENTRIES`
- Prompt builder tests (pre-existing)

## Design Decisions

- **Two-pass architecture**: Thin content for selection keeps Pass 1 within small model context windows. Full content only for the 1–3 selected entries in Pass 2.
- **No model unload**: LMStudio is a persistent server; unloading would cause reload latency. TTL is the user's responsibility.
- **Extracted `buildWSTGListPrompt`**: Separate file avoids transitive `electron` imports when running bun tests.
