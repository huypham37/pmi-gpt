/**
 * WSTG augmented prompt builder.
 *
 * All prompt text (headings, labels, glue copy) lives here so that the
 * human-readable content is co-located in packages/shared/src/prompts/
 * rather than scattered across the Electron app.
 *
 * The output-format instructions block is loaded from the bundled asset:
 *   packages/shared/assets/prompts/wstg-testcase-instructions.md
 * via getBundledAssetsDir('prompts') (same mechanism used by the Electron
 * main process prompt-loader).
 *
 * Electron's wstg-prompt.ts is a thin wrapper that:
 *   1. Looks up primary markdown from its local wstg-full-content.json
 *   2. Delegates everything else to buildAugmentedPrompt() here.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getBundledAssetsDir } from '../utils/paths.ts';

// ============================================================
// Types
// ============================================================

export interface WSTGEntryRef {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface WSTGSelectionInput {
  /** The single best-match WSTG entry, or null when no selection was made. */
  primary: WSTGEntryRef | null;
  /**
   * Related WSTG entries selected by the RAG step.
   * These are NOT injected into the OpenCode prompt — they are kept on the
   * selection object for downstream use (e.g. storing metadata alongside the
   * generated test cases) but the AI generates its own reference links from
   * the WSTG content it already knows.
   */
  secondary: WSTGEntryRef[];
}

export interface ProjectContextInput {
  description: string;
  documents: Array<{ name: string; extractedText: string }>;
}

/** Maximum characters of extracted document text to include per document. */
const MAX_DOC_TEXT_CHARS = 2000;

// ============================================================
// Instruction template loader
// ============================================================

/** In-memory cache for the instructions template. */
let _instructionsCache: string | undefined;

/**
 * Load and cache the wstg-testcase-instructions.md content.
 * Uses getBundledAssetsDir so it works in both dev and packaged Electron.
 */
function loadInstructionsTemplate(): string {
  if (_instructionsCache !== undefined) return _instructionsCache;

  const dir = getBundledAssetsDir('prompts');
  if (!dir) {
    throw new Error(
      '[wstg-augmented-prompt] Could not resolve bundled prompts directory. ' +
        'Ensure copy-assets has been run and setBundledAssetsRoot() was called at startup.',
    );
  }

  _instructionsCache = readFileSync(join(dir, 'wstg-testcase-instructions.md'), 'utf-8');
  return _instructionsCache;
}

/**
 * Substitute {{key}} placeholders in a template string.
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key: string): string => {
    if (!(key in vars)) {
      throw new Error(`[wstg-augmented-prompt] Missing template variable: "${key}"`);
    }
    return vars[key]!;
  });
}

// ============================================================
// Section builders — all prompt text lives here
// ============================================================

function buildPrimarySection(
  primary: WSTGEntryRef,
  primaryMarkdown: string | undefined,
): string {
  if (primaryMarkdown) {
    return `### Primary WSTG Reference (${primary.id})\n${primaryMarkdown}`;
  }
  return (
    `### Primary WSTG Reference\n` +
    `**${primary.id}**: ${primary.name}\n` +
    `${primary.description}\n` +
    `URL: ${primary.url}`
  );
}

function buildProjectContextSection(ctx: ProjectContextInput | undefined): string {
  if (!ctx || (!ctx.description && ctx.documents.length === 0)) return '';

  const parts: string[] = ['### Project Context (specific to the application being tested)'];

  if (ctx.description) {
    parts.push(`**Project Description:**\n${ctx.description}`);
  }

  if (ctx.documents.length > 0) {
    const docSummaries = ctx.documents
      // Truncate long documents to stay within context window limits
      .map((d) => `#### ${d.name}\n${d.extractedText.slice(0, MAX_DOC_TEXT_CHARS)}`)
      .join('\n\n');
    parts.push(`**Uploaded Documents:**\n${docSummaries}`);
  }

  return '\n\n' + parts.join('\n\n');
}

// ============================================================
// Public API
// ============================================================

/**
 * Build the augmented prompt that is sent to OpenCode for test case generation.
 *
 * @param attackVector     - The user's described attack vector
 * @param selection        - WSTG entries selected by the RAG step
 * @param projectContext   - Optional project description + uploaded documents
 * @param primaryMarkdown  - Optional full markdown content for the primary WSTG entry
 *                           (passed in by Electron, which owns wstg-full-content.json)
 */
export function buildAugmentedPrompt(
  attackVector: string,
  selection: WSTGSelectionInput,
  projectContext?: ProjectContextInput,
  primaryMarkdown?: string,
): string {
  if (!selection.primary) {
    return `Create detailed security test cases for the following attack vector: ${attackVector}`;
  }

  const primarySection = buildPrimarySection(selection.primary, primaryMarkdown);
  const projectContextSection = buildProjectContextSection(projectContext);

  const instructions = renderTemplate(loadInstructionsTemplate().trim(), { attackVector });

  return (
    `Create detailed security test cases for the following attack vector: ${attackVector}\n` +
    `\n` +
    `Use the following OWASP WSTG entries as context:\n` +
    `\n` +
    `${primarySection}${projectContextSection}\n` +
    `\n` +
    `${instructions}`
  );
}
