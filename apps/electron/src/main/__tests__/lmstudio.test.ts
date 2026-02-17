import { describe, it, expect } from 'bun:test'
import { buildAugmentedPrompt, parseSelectedEntries, parseSelectedId, type WSTGSelection } from '../wstg-prompt'
import { WSTG_ENTRIES, type WSTGEntry } from '../wstg-data'
import wstgFullContent from '../wstg-full-content.json'

// ============================================================================
// Fixtures
// ============================================================================

const ENTRY_INPV01: WSTGEntry = {
  id: 'WSTG-INPV-01',
  name: 'Testing for Reflected Cross Site Scripting',
  description: 'Reflected Cross-site Scripting (XSS) occur when an attacker injects browser executable code within a single HTTP response.',
  url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
}

const ENTRY_INPV02: WSTGEntry = {
  id: 'WSTG-INPV-02',
  name: 'Testing for Stored Cross Site Scripting',
  description: 'Stored Cross-site Scripting (XSS) is the most dangerous type of Cross Site Scripting.',
  url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/',
}

const ENTRY_SESS01: WSTGEntry = {
  id: 'WSTG-SESS-01',
  name: 'Testing for Session Management Schema',
  description: 'Session management schema testing.',
  url: 'https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/06-Session_Management_Testing/',
}

// ============================================================================
// parseSelectedEntries (new format: 1 primary + 2 secondary)
// ============================================================================

describe('parseSelectedEntries', () => {
  it('parses JSON with primary and secondary keys', () => {
    const result = parseSelectedEntries('{"primary": "WSTG-INPV-01", "secondary": ["WSTG-INPV-02", "WSTG-SESS-01"]}')
    expect(result.primary).toBe('WSTG-INPV-01')
    expect(result.secondary).toEqual(['WSTG-INPV-02', 'WSTG-SESS-01'])
  })

  it('parses JSON wrapped in markdown code fences', () => {
    const result = parseSelectedEntries('```json\n{"primary": "WSTG-INPV-05", "secondary": ["WSTG-INPV-01", "WSTG-ATHN-03"]}\n```')
    expect(result.primary).toBe('WSTG-INPV-05')
    expect(result.secondary).toEqual(['WSTG-INPV-01', 'WSTG-ATHN-03'])
  })

  it('parses JSON with surrounding explanation text', () => {
    const result = parseSelectedEntries('Based on the attack vector:\n{"primary": "WSTG-SESS-01", "secondary": ["WSTG-ATHN-01", "WSTG-ATHN-02"]}\nThis is the best match.')
    expect(result.primary).toBe('WSTG-SESS-01')
    expect(result.secondary).toEqual(['WSTG-ATHN-01', 'WSTG-ATHN-02'])
  })

  it('limits secondary to 2 entries', () => {
    const result = parseSelectedEntries('{"primary": "WSTG-INPV-01", "secondary": ["WSTG-A", "WSTG-B", "WSTG-C", "WSTG-D"]}')
    expect(result.secondary.length).toBe(2)
  })

  it('handles missing secondary array gracefully', () => {
    const result = parseSelectedEntries('{"primary": "WSTG-INPV-01"}')
    expect(result.primary).toBe('WSTG-INPV-01')
    expect(result.secondary).toEqual([])
  })

  it('falls back to regex extraction when JSON is malformed', () => {
    const result = parseSelectedEntries('The best entry is WSTG-INPV-01, also consider WSTG-INPV-02 and WSTG-SESS-01.')
    expect(result.primary).toBe('WSTG-INPV-01')
    expect(result.secondary).toEqual(['WSTG-INPV-02', 'WSTG-SESS-01'])
  })

  it('returns null primary when no ID is found', () => {
    const result = parseSelectedEntries('I cannot determine the relevant entry.')
    expect(result.primary).toBeNull()
    expect(result.secondary).toEqual([])
  })

  it('returns null primary for empty input', () => {
    const result = parseSelectedEntries('')
    expect(result.primary).toBeNull()
  })
})

// ============================================================================
// parseSelectedId (deprecated, backward compat)
// ============================================================================

describe('parseSelectedId (deprecated)', () => {
  it('returns primary from new format', () => {
    const result = parseSelectedId('{"primary": "WSTG-ATHN-03", "secondary": ["WSTG-A", "WSTG-B"]}')
    expect(result).toBe('WSTG-ATHN-03')
  })

  it('falls back to regex extraction', () => {
    const result = parseSelectedId('The best entry is WSTG-INPV-01.')
    expect(result).toBe('WSTG-INPV-01')
  })
})

// ============================================================================
// buildAugmentedPrompt
// ============================================================================

describe('buildAugmentedPrompt', () => {
  it('returns a generic prompt when primary is null', () => {
    const selection: WSTGSelection = { primary: null, secondary: [] }
    const result = buildAugmentedPrompt('XSS in comments', selection)
    expect(result).toContain('XSS in comments')
    expect(result).not.toContain('WSTG Reference')
  })

  it('includes full markdown content for primary entry from wstg-full-content.json', () => {
    const selection: WSTGSelection = { primary: ENTRY_INPV01, secondary: [] }
    const result = buildAugmentedPrompt('reflected XSS', selection)

    const fullContent = (wstgFullContent as Record<string, string>)['WSTG-INPV-01']
    expect(fullContent).toBeDefined()
    expect(result).toContain(`### Primary WSTG Reference (WSTG-INPV-01)`)
    expect(result).toContain(fullContent!)
    expect(result).toContain('reflected XSS')
  })

  it('includes secondary entries as brief summaries', () => {
    const selection: WSTGSelection = { primary: ENTRY_INPV01, secondary: [ENTRY_INPV02, ENTRY_SESS01] }
    const result = buildAugmentedPrompt('XSS attack', selection)

    expect(result).toContain('### Secondary WSTG References')
    expect(result).toContain('**WSTG-INPV-02**')
    expect(result).toContain('**WSTG-SESS-01**')
  })

  it('falls back to brief description when primary entry ID is not in JSON bundle', () => {
    const fakeEntry: WSTGEntry = {
      id: 'WSTG-FAKE-99',
      name: 'Fake Entry',
      description: 'A fake entry for testing.',
      url: 'https://example.com',
    }
    const selection: WSTGSelection = { primary: fakeEntry, secondary: [] }
    const result = buildAugmentedPrompt('fake attack', selection)

    expect(result).toContain('### Primary WSTG Reference')
    expect(result).toContain('**WSTG-FAKE-99**: Fake Entry')
    expect(result).toContain('A fake entry for testing.')
    expect(result).toContain('URL: https://example.com')
  })

  it('includes test case generation instructions', () => {
    const selection: WSTGSelection = { primary: ENTRY_INPV01, secondary: [] }
    const result = buildAugmentedPrompt('XSS', selection)
    expect(result).toContain('**Name:**')
    expect(result).toContain('**Target Component:**')
    expect(result).toContain('**Guidance:**')
    expect(result).toContain('**Reference:**')
    expect(result).toContain('Separate each test case with a single --- on its own line')
  })
})

// ============================================================================
// wstg-full-content.json integrity
// ============================================================================

describe('wstg-full-content.json', () => {
  it('contains 108 entries', () => {
    expect(Object.keys(wstgFullContent).length).toBe(108)
  })

  it('all keys follow WSTG-XXXX-NN format', () => {
    for (const key of Object.keys(wstgFullContent)) {
      expect(key).toMatch(/^WSTG-[A-Z]+-\d+$/)
    }
  })

  it('every entry has non-empty content', () => {
    for (const [, content] of Object.entries(wstgFullContent)) {
      expect((content as string).length).toBeGreaterThan(0)
    }
  })

  it('entries contain expected markdown sections', () => {
    const content = (wstgFullContent as Record<string, string>)['WSTG-INPV-01']
    expect(content).toContain('## Summary')
    expect(content).toContain('## How to Test')
  })
})

// ============================================================================
// End-to-end flow: LMStudio response → parse → lookup → augmented prompt
// ============================================================================

describe('RAG flow: LMStudio response → parse → lookup → prompt', () => {
  it('parses LMStudio JSON response with 1 primary + 2 secondary, builds prompt with full markdown', () => {
    // Simulate LMStudio returning a JSON response with new format
    const lmstudioResponse = '{"primary": "WSTG-INPV-01", "secondary": ["WSTG-INPV-02", "WSTG-SESS-01"]}'

    // Step 1: Parse the entries
    const parsed = parseSelectedEntries(lmstudioResponse)
    expect(parsed.primary).toBe('WSTG-INPV-01')
    expect(parsed.secondary).toEqual(['WSTG-INPV-02', 'WSTG-SESS-01'])

    // Step 2: Look up in WSTG_ENTRIES (same logic as selectRelevantWSTGEntries)
    const primary = WSTG_ENTRIES.find((e) => e.id === parsed.primary) ?? null
    const secondary = parsed.secondary
      .map((id) => WSTG_ENTRIES.find((e) => e.id === id))
      .filter((e): e is WSTGEntry => e !== undefined)

    expect(primary).not.toBeNull()
    expect(primary!.name).toBe('Testing for Reflected Cross Site Scripting')
    expect(secondary.length).toBe(2)

    // Step 3: Build augmented prompt
    const prompt = buildAugmentedPrompt('XSS in search field', { primary, secondary })

    // Verify full markdown from JSON bundle is in the prompt
    const fullContent = (wstgFullContent as Record<string, string>)['WSTG-INPV-01']
    expect(prompt).toContain(fullContent!)
    expect(prompt).toContain('XSS in search field')
    expect(prompt).toContain('## Summary')
    expect(prompt).toContain('## How to Test')
    expect(prompt).toContain('### Secondary WSTG References')
  })

  it('handles code-fenced response with SQL injection entry', () => {
    const lmstudioResponse = '```json\n{"primary": "WSTG-INPV-05", "secondary": ["WSTG-INPV-01", "WSTG-ATHN-03"]}\n```'

    const parsed = parseSelectedEntries(lmstudioResponse)
    const primary = WSTG_ENTRIES.find((e) => e.id === parsed.primary) ?? null
    const secondary = parsed.secondary
      .map((id) => WSTG_ENTRIES.find((e) => e.id === id))
      .filter((e): e is WSTGEntry => e !== undefined)

    expect(primary).not.toBeNull()
    expect(primary!.name).toContain('SQL Injection')

    const prompt = buildAugmentedPrompt('SQL injection in login form', { primary, secondary })
    const fullContent = (wstgFullContent as Record<string, string>)['WSTG-INPV-05']
    expect(prompt).toContain(fullContent!)
  })

  it('handles unrecognized ID gracefully — entry not found, generic prompt returned', () => {
    const lmstudioResponse = '{"primary": "WSTG-ZZZZ-99", "secondary": []}'

    const parsed = parseSelectedEntries(lmstudioResponse)
    expect(parsed.primary).toBe('WSTG-ZZZZ-99')

    const primary = WSTG_ENTRIES.find((e) => e.id === parsed.primary) ?? null
    expect(primary).toBeNull()

    const prompt = buildAugmentedPrompt('some attack', { primary, secondary: [] })
    expect(prompt).toContain('some attack')
    expect(prompt).not.toContain('WSTG Reference')
  })

  it('handles garbage LMStudio response — falls back to generic prompt', () => {
    const lmstudioResponse = 'Sorry, I cannot help with that.'

    const parsed = parseSelectedEntries(lmstudioResponse)
    expect(parsed.primary).toBeNull()

    const primary = WSTG_ENTRIES.find((e) => e.id === parsed.primary) ?? null
    expect(primary).toBeNull()

    const prompt = buildAugmentedPrompt('SSRF attack', { primary, secondary: [] })
    expect(prompt).toContain('SSRF attack')
    expect(prompt).not.toContain('WSTG Reference')
  })

  it('every WSTG_ENTRIES ID has a matching key in wstg-full-content.json', () => {
    const jsonKeys = new Set(Object.keys(wstgFullContent))
    for (const entry of WSTG_ENTRIES) {
      expect(jsonKeys.has(entry.id)).toBe(true)
    }
  })
})
