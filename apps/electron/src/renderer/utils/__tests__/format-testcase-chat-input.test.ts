import { describe, it, expect } from 'bun:test'
import { formatTestCaseChatInput } from '../../lib/format-testcase-chat-input'
import type { TestCase } from '../../../shared/types'

// Minimal valid TestCase for testing
function makeTestCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: 'tc-1',
    workspaceId: 'ws-1',
    generationSessionId: 'sess-1',
    name: 'SQL Injection in Login Form',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('formatTestCaseChatInput', () => {
  it('includes the test case name', () => {
    const tc = makeTestCase({ name: 'My Test Case' })
    const result = formatTestCaseChatInput(tc)
    expect(result).toContain('My Test Case')
  })

  it('includes attackVector when present', () => {
    const tc = makeTestCase({ attackVector: 'SQL injection' })
    const result = formatTestCaseChatInput(tc)
    expect(result).toContain('**Attack Vector:** SQL injection')
  })

  it('omits attackVector section when not present', () => {
    const tc = makeTestCase({ attackVector: undefined })
    const result = formatTestCaseChatInput(tc)
    expect(result).not.toContain('Attack Vector')
  })

  it('includes targetComponent when present', () => {
    const tc = makeTestCase({ targetComponent: 'Login form username parameter' })
    const result = formatTestCaseChatInput(tc)
    expect(result).toContain('Login form username parameter')
  })

  it('includes description when present', () => {
    const tc = makeTestCase({ description: 'A detailed description of the test.' })
    const result = formatTestCaseChatInput(tc)
    expect(result).toContain('## Description')
    expect(result).toContain('A detailed description of the test.')
  })

  it('omits description section when not present', () => {
    const tc = makeTestCase({ description: undefined })
    const result = formatTestCaseChatInput(tc)
    expect(result).not.toContain('## Description')
  })

  it('includes preconditions when present', () => {
    const tc = makeTestCase({ preconditions: 'User must be logged out.' })
    const result = formatTestCaseChatInput(tc)
    expect(result).toContain('## Preconditions')
    expect(result).toContain('User must be logged out.')
  })

  it('includes guidance when present', () => {
    const tc = makeTestCase({ guidance: 'Step 1: Navigate to /login.' })
    const result = formatTestCaseChatInput(tc)
    expect(result).toContain('## Guidance')
    expect(result).toContain('Step 1: Navigate to /login.')
  })

  it('includes references when present', () => {
    const tc = makeTestCase({
      reference: [
        { id: 'WSTG-INPV-05', name: 'Testing for SQL Injection', url: 'https://owasp.org/wstg-inpv-05' },
        { id: 'CWE-89', name: 'SQL Injection', url: undefined },
      ],
    })
    const result = formatTestCaseChatInput(tc)
    expect(result).toContain('## References')
    expect(result).toContain('[WSTG-INPV-05] Testing for SQL Injection')
    expect(result).toContain('https://owasp.org/wstg-inpv-05')
    expect(result).toContain('[CWE-89] SQL Injection')
  })

  it('omits references section when empty', () => {
    const tc = makeTestCase({ reference: [] })
    const result = formatTestCaseChatInput(tc)
    expect(result).not.toContain('## References')
  })

  it('always includes the note section', () => {
    const tc = makeTestCase()
    const result = formatTestCaseChatInput(tc)
    expect(result).toContain('We are working on this, do not answer until the next request.')
  })

  it('returns a non-empty string for a minimal test case', () => {
    const tc = makeTestCase()
    const result = formatTestCaseChatInput(tc)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
