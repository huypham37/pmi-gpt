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
import { loadPrompt, renderTemplate } from './prompt-loader'

export { buildAugmentedPrompt, parseSelectedEntries, type WSTGSelection } from './wstg-prompt'

function buildWSTGListPrompt(attackVector: string): string {
  const entrySummaries = WSTG_ENTRIES.map(
    (e) => `- ${e.id}: ${e.name} — ${e.description}`,
  ).join('\n')

  return renderTemplate(loadPrompt('wstg-selection-user.md'), { attackVector, entrySummaries })
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
      { role: 'system', content: loadPrompt('wstg-selection-system.md').trim() },
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
