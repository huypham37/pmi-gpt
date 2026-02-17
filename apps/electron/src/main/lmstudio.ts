/**
 * LMStudio client wrapper for WSTG entry retrieval (RAG step).
 *
 * Uses @lmstudio/sdk to query a local LMStudio model, sending the full WSTG
 * entry list + attack vector and asking the model to select the single most
 * relevant entry.
 */

import { LMStudioClient, Chat } from '@lmstudio/sdk'
import { WSTG_ENTRIES, type WSTGEntry } from './wstg-data'
import { sessionLog } from './logger'
import { parseSelectedEntries } from './wstg-prompt'

export { buildAugmentedPrompt, parseSelectedEntries, type WSTGSelection } from './wstg-prompt'

const SELECTION_SYSTEM_PROMPT = `You are a security testing assistant. Given a list of OWASP WSTG (Web Security Testing Guide) entries and an attack vector description, select the most relevant WSTG entries for generating test cases.

STRICT REQUIREMENTS:
1. Select exactly 1 PRIMARY entry — the single best match for the attack vector
2. Select exactly 2 SECONDARY entries — related entries that provide additional context

RESPONSE FORMAT (strict JSON, no exceptions):
{"primary": "WSTG-XXXX-XX", "secondary": ["WSTG-XXXX-XX", "WSTG-XXXX-XX"]}

RULES:
- primary: MUST be exactly 1 WSTG ID (the best match)
- secondary: MUST be exactly 2 WSTG IDs (related but distinct from primary)
- All 3 IDs MUST be different
- Return ONLY the JSON object — no explanation, no markdown, no commentary`

function buildWSTGListPrompt(attackVector: string): string {
  const entrySummaries = WSTG_ENTRIES.map(
    (e) => `- ${e.id}: ${e.name} — ${e.description}`,
  ).join('\n')

  return `Attack vector: "${attackVector}"

Available WSTG entries:
${entrySummaries}

Select 1 PRIMARY entry (best match) and 2 SECONDARY entries (related context).
Return JSON: {"primary": "WSTG-...", "secondary": ["WSTG-...", "WSTG-..."]}`
}

/**
 * Query LMStudio to select relevant WSTG entries for an attack vector.
 * Returns 1 primary entry + up to 2 secondary entries.
 */
export async function selectRelevantWSTGEntries(
  attackVector: string,
  modelIdentifier?: string,
): Promise<{ primary: WSTGEntry | null; secondary: WSTGEntry[] }> {
  if (WSTG_ENTRIES.length === 0) {
    sessionLog.warn('[LMStudio] WSTG_ENTRIES is empty, skipping RAG selection')
    return { primary: null, secondary: [] }
  }

  try {
    const client = new LMStudioClient()
    const model = modelIdentifier
      ? await client.llm.model(modelIdentifier)
      : await client.llm.model()

    const chat = Chat.from([
      { role: 'system', content: SELECTION_SYSTEM_PROMPT },
      { role: 'user', content: buildWSTGListPrompt(attackVector) },
    ])

    sessionLog.info(`[LMStudio] Selecting WSTG entries for: "${attackVector}"`)
    const result = await (model.respond(chat, { temperature: 0.1 }) as any).result()
    const responseText = result.content.trim()
    sessionLog.info(`[LMStudio] Raw response: ${responseText}`)

    const parsed = parseSelectedEntries(responseText)
    sessionLog.info(`[LMStudio] Selected primary: ${parsed.primary}, secondary: ${parsed.secondary.join(', ')}`)

    const primary = WSTG_ENTRIES.find((e) => e.id === parsed.primary) ?? null
    const secondary = parsed.secondary
      .map((id) => WSTG_ENTRIES.find((e) => e.id === id))
      .filter((e): e is WSTGEntry => e !== undefined)

    return { primary, secondary }
  } catch (error) {
    sessionLog.error('[LMStudio] Failed to select WSTG entries:', error)
    return { primary: null, secondary: [] }
  }
}

/**
 * @deprecated Use selectRelevantWSTGEntries instead
 */
export async function selectRelevantWSTGEntry(
  attackVector: string,
  modelIdentifier?: string,
): Promise<{ entry: WSTGEntry | null }> {
  const { primary } = await selectRelevantWSTGEntries(attackVector, modelIdentifier)
  return { entry: primary }
}
