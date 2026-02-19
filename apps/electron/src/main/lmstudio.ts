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
import { buildWSTGListPrompt } from './wstg-selection-prompt'
import { loadPrompt } from './prompt-loader'
import { DEFAULT_MODEL, getModelContextWindow } from '@craft-agent/shared/config/models'
import { getModel } from '@craft-agent/shared/config'

export { buildAugmentedPrompt, parseSelectedEntries, type WSTGSelection } from './wstg-prompt'

function isNoModelError(error: unknown): boolean {
  const code = (error as any)?.displayData?.code
  if (code === 'generic.noModelMatchingQuery' || code === 'generic.specificModelUnloaded') return true
  const title = (error as any)?.title ?? ''
  return title.includes('No model found') || title.includes('noModelMatchingQuery')
}

async function getOrLoadModel(client: LMStudioClient, modelIdentifier?: string) {
  try {
    return modelIdentifier ? await client.llm.model(modelIdentifier) : await client.llm.model()
  } catch (error) {
    if (!isNoModelError(error)) throw error
    const configuredModel = getModel()
    const resolvedModel = configuredModel ?? DEFAULT_MODEL
    const path = resolvedModel.replace(/^lmstudio\//, '')
    sessionLog.info(`[LMStudio] No model loaded. configuredModel=${configuredModel}, resolvedModel=${resolvedModel}, loadPath=${path}`)
    try {
      const contextLength = getModelContextWindow(resolvedModel)
      sessionLog.info(`[LMStudio] Auto-loading: path=${path}, contextLength=${contextLength ?? 'default (not set in models.ts)'}`)
      const loaded = await client.llm.load(path, { config: { context_length: contextLength } as any })
      sessionLog.info(`[LMStudio] Auto-load success: identifier=${loaded.identifier}, contextLength=${contextLength}`)
      return loaded
    } catch (loadError) {
      const code = (loadError as any)?.displayData?.code
      if (code === 'generic.pathNotFound') {
        throw new Error(`LMStudio model "${path}" is not downloaded. Please download it in LMStudio first.`)
      }
      throw new Error('Failed to auto-load LMStudio model. Please load a model manually in LMStudio.')
    }
  }
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
    const model = await getOrLoadModel(client, modelIdentifier)

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

    // Unload then reload with controlled context length for Pass 2 (ACP)
    try {
      sessionLog.info(`[LMStudio] Unloading model...`)
      await model.unload()
      sessionLog.info(`[LMStudio] Model unloaded. Reloading with controlled context...`)
      const configuredModel = getModel() ?? DEFAULT_MODEL
      const path = configuredModel.replace(/^lmstudio\//, '')
      const contextLength = getModelContextWindow(configuredModel)
      await client.llm.load(path, { config: { context_length: contextLength } as any })
      sessionLog.info(`[LMStudio] Reloaded: path=${path}, context_length=${contextLength}`)
    } catch (reloadErr) {
      sessionLog.warn(`[LMStudio] Failed to reload model (non-fatal): ${reloadErr}`)
    }

    const primary = WSTG_ENTRIES.find((e) => e.id === parsed.primary) ?? null
    const secondary = parsed.secondary
      .map((id) => WSTG_ENTRIES.find((e) => e.id === id))
      .filter((e): e is WSTGEntry => e !== undefined)

    return { primary, secondary }
  } catch (error) {
    sessionLog.error('[LMStudio] Failed to select WSTG entries:', error)
    throw error
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
