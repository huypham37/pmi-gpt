import wstgThinContent from './wstg-thin-content.json'
import { loadPrompt, renderTemplate } from './prompt-loader'

export function buildWSTGListPrompt(attackVector: string): string {
  const entrySummaries = Object.entries(wstgThinContent as Record<string, string>)
    .map(([id, content]) => `- ${id}: ${content.split('\n')[0].replace(/^#\s*/, '')}`)
    .join('\n')

  return renderTemplate(loadPrompt('wstg-selection-user.md'), { attackVector, entrySummaries })
}
