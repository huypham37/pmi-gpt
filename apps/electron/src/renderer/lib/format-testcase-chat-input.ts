/**
 * Formats a TestCase into a chat prompt string for use when opening a new
 * chat session from the test case report view.
 */
import type { TestCase } from '../../shared/types'

export function formatTestCaseChatInput(testCase: TestCase): string {
  const lines: string[] = []

  lines.push('You are my security testing assistant. Help me execute and refine the following test case.')
  lines.push('')
  lines.push('## Test Case')
  lines.push(`**Name:** ${testCase.name}`)

  if (testCase.targetComponent) {
    lines.push(`**Target:** ${testCase.targetComponent}`)
  }

  if (testCase.attackVector) {
    lines.push(`**Attack Vector:** ${testCase.attackVector}`)
  }

  if (testCase.description) {
    lines.push('')
    lines.push('## Description')
    lines.push(testCase.description)
  }

  if (testCase.preconditions) {
    lines.push('')
    lines.push('## Preconditions')
    lines.push(testCase.preconditions)
  }

  if (testCase.guidance) {
    lines.push('')
    lines.push('## Guidance')
    lines.push(testCase.guidance)
  }

  if (testCase.reference && testCase.reference.length > 0) {
    lines.push('')
    lines.push('## References')
    for (const ref of testCase.reference) {
      const urlPart = ref.url ? ` — ${ref.url}` : ''
      lines.push(`- [${ref.id}] ${ref.name}${urlPart}`)
    }
  }

  lines.push('')
  lines.push('## Note')
  lines.push('We are working on this, do not answer until the next request.')

  return lines.join('\n')
}
