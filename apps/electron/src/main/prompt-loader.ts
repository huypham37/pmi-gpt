/**
 * Prompt loader for bundled .md template files.
 *
 * Prompts live in packages/shared/assets/prompts/ and are copied to
 * dist/assets/prompts/ at build time via copy-assets.ts.
 *
 * At runtime the main process resolves the directory via getBundledAssetsDir('prompts').
 * Template variables use {{key}} syntax and are substituted via renderTemplate().
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { getBundledAssetsDir } from '@craft-agent/shared/utils'

/** Cache of loaded prompt content keyed by filename. */
const _cache = new Map<string, string>()

/**
 * Load a bundled prompt .md file synchronously.
 * Results are cached in memory after the first load.
 *
 * @param name - Filename inside the prompts/ asset directory (e.g. 'wstg-selection-system.md')
 * @throws Error if the prompts directory cannot be resolved or the file is not found.
 */
export function loadPrompt(name: string): string {
  if (_cache.has(name)) return _cache.get(name)!

  const dir = getBundledAssetsDir('prompts')
  if (!dir) {
    throw new Error(
      `[prompt-loader] Could not resolve bundled prompts directory. ` +
      `Ensure copy-assets has been run and setBundledAssetsRoot() was called at startup.`
    )
  }

  const text = readFileSync(join(dir, name), 'utf-8')
  _cache.set(name, text)
  return text
}

/**
 * Substitute {{key}} placeholders in a template string.
 * Throws if any placeholder in the template has no corresponding value in vars.
 *
 * @param template - Template string with {{key}} placeholders
 * @param vars     - Key/value map of substitutions
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (match, key) => {
    if (!(key in vars)) {
      throw new Error(`[prompt-loader] Missing template variable: "${key}"`)
    }
    return vars[key]
  })
}
