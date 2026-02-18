/**
 * Pure functions for WSTG prompt building and LMStudio response parsing.
 *
 * Extracted from lmstudio.ts so they can be tested without electron/LMStudio dependencies.
 * Output format instructions live in packages/shared/assets/prompts/wstg-testcase-instructions.md.
 */

import type { WSTGEntry } from './wstg-data'
import wstgFullContent from './wstg-full-content.json'
import { loadPrompt, renderTemplate } from './prompt-loader'

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
  projectContext?: { description: string; documents: Array<{ name: string; extractedText: string }> },
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
      .map((e) => `- **${e.id}**: ${e.name} — ${e.description} (${e.url})`)
      .join('\n')
    secondaryContext = `\n\n### Secondary WSTG References (for additional context)\n${secondarySummaries}`
  }

  // Build project context section if available
  let projectContextSection = ''
  if (projectContext && (projectContext.description || projectContext.documents.length > 0)) {
    const parts: string[] = ['### Project Context (specific to the application being tested)']
    if (projectContext.description) {
      parts.push(`**Project Description:**\n${projectContext.description}`)
    }
    if (projectContext.documents.length > 0) {
      const docSummaries = projectContext.documents
        // TODO: add error if total document size exceeds Claude context window limit
        .map(d => `#### ${d.name}\n${d.extractedText}`)
        .join('\n\n')
      parts.push(`**Uploaded Documents:**\n${docSummaries}`)
    }
    projectContextSection = '\n\n' + parts.join('\n\n')
  }

  const instructions = renderTemplate(loadPrompt('wstg-testcase-instructions.md').trim(), { attackVector })

  return `Create detailed security test cases for the following attack vector: ${attackVector}

Use the following OWASP WSTG entries as context:

${primaryContext}${secondaryContext}${projectContextSection}

${instructions}`
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
