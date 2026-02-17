/**
 * Pure functions for WSTG prompt building and LMStudio response parsing.
 *
 * Extracted from lmstudio.ts so they can be tested without electron/LMStudio dependencies.
 */

import type { WSTGEntry } from './wstg-data'
import wstgFullContent from './wstg-full-content.json'

export interface WSTGSelection {
  primary: WSTGEntry | null
  secondary: WSTGEntry[]
}

/**
 * Build an augmented prompt with full WSTG context for the selected entries.
 * Uses full markdown for primary entry, brief summaries for secondary entries.
 */
export function buildAugmentedPrompt(
  attackVector: string,
  selection: WSTGSelection,
): string {
  if (!selection.primary) {
    return `Create detailed security test cases for the following attack vector: ${attackVector}`
  }

  const { primary, secondary } = selection

  // Full context for primary entry
  const primaryContent = (wstgFullContent as Record<string, string>)[primary.id]
  const primaryContext = primaryContent
    ? `### Primary WSTG Reference (${primary.id})\n${primaryContent}`
    : `### Primary WSTG Reference\n**${primary.id}**: ${primary.name}\n${primary.description}\nURL: ${primary.url}`

  // Brief summaries for secondary entries
  let secondaryContext = ''
  if (secondary.length > 0) {
    const secondarySummaries = secondary
      .map((e) => `- **${e.id}**: ${e.name} — ${e.description}`)
      .join('\n')
    secondaryContext = `\n\n### Secondary WSTG References (for additional context)\n${secondarySummaries}`
  }

  return `Create detailed security test cases for the following attack vector: ${attackVector}

Use the following OWASP WSTG entries as context:

${primaryContext}${secondaryContext}

STRICT OUTPUT FORMAT — follow this exactly, no deviations:
- Do NOT include any preamble, introduction, or commentary before the first test case.
- Do NOT use markdown headings (## or ###). Use only bold field labels.
- Each test case MUST use exactly these bold field labels on separate lines:

**Name:** A descriptive test case name
**Target Component:** The specific component/endpoint being tested
**Description:** What this test case validates
**Preconditions:** Requirements before running the test
**Guidance:**
| Step | Expected-result | Example |
|------|-----------------|---------|
| ... | ... | ... |
**Reference:**
| ID | Name | URL |
|----|------|-----|
| ... | ... | ... |

- Separate each test case with a single --- on its own line.
- Place tables immediately after their field label (no blank lines between label and table).
- Start your response directly with the first **Name:** field.`
}

export interface ParsedSelection {
  primary: string | null
  secondary: string[]
}

/**
 * Parse selected WSTG IDs from LMStudio response.
 * Expects JSON: {"primary": "WSTG-...", "secondary": ["WSTG-...", "WSTG-..."]}
 */
export function parseSelectedEntries(responseText: string): ParsedSelection {
  // Strip markdown code fences if present
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()

  // Try to parse as JSON object
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0])
      const primary = typeof parsed.primary === 'string' ? parsed.primary : null
      const secondary = Array.isArray(parsed.secondary)
        ? parsed.secondary.filter((id: unknown) => typeof id === 'string')
        : []
      
      if (primary) {
        return { primary, secondary: secondary.slice(0, 2) }
      }
    } catch {
      // Failed to parse JSON, try regex fallback
    }
  }

  // Fallback: extract all WSTG-* IDs via regex
  const allIds = cleaned.match(/WSTG-[A-Z]+-\d+/g) || []
  const uniqueIds = [...new Set(allIds)]
  
  return {
    primary: uniqueIds[0] || null,
    secondary: uniqueIds.slice(1, 3),
  }
}

/**
 * @deprecated Use parseSelectedEntries instead
 */
export function parseSelectedId(responseText: string): string | null {
  return parseSelectedEntries(responseText).primary
}
