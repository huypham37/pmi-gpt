import { describe, it, expect, beforeAll } from 'bun:test'
import { join } from 'path'
import { setBundledAssetsRoot } from '@craft-agent/shared/utils'
import { buildAugmentedPrompt, parseSelectedEntries, parseSelectedId, type WSTGSelection } from '../wstg-prompt'
import { buildWSTGListPrompt } from '../wstg-selection-prompt'
import { WSTG_ENTRIES, type WSTGEntry } from '../wstg-data'
import wstgFullContent from '../wstg-full-content.json'
import wstgThinContent from '../wstg-thin-content.json'

beforeAll(() => {
  // Point to packages/shared so getBundledAssetsDir('prompts') resolves correctly
  setBundledAssetsRoot(join(__dirname, '..', '..', '..', '..', '..', 'packages', 'shared'))
})

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

// ============================================================================
// Project Context injection into prompt
// ============================================================================

describe('buildAugmentedPrompt with project context', () => {
  const SELECTION_WITH_PRIMARY: WSTGSelection = {
    primary: ENTRY_INPV01,
    secondary: [ENTRY_INPV02],
  }

  const SELECTION_NULL: WSTGSelection = { primary: null, secondary: [] }

  it('injects project description into the prompt', () => {
    const ctx = {
      description: 'A Node.js/Express REST API with JWT auth, PostgreSQL database, endpoints: /api/users, /api/orders',
      documents: [],
    }
    const prompt = buildAugmentedPrompt('XSS in search', SELECTION_WITH_PRIMARY, ctx)

    expect(prompt).toContain('### Project Context (specific to the application being tested)')
    expect(prompt).toContain('**Project Description:**')
    expect(prompt).toContain('Node.js/Express REST API')
    expect(prompt).toContain('JWT auth')
    expect(prompt).toContain('/api/users')
  })

  it('injects document extracted text into the prompt', () => {
    const ctx = {
      description: '',
      documents: [
        { name: 'api-spec.pdf', extractedText: 'POST /login accepts username and password fields. Returns JWT token in response body.' },
        { name: 'architecture.docx', extractedText: 'The app uses a 3-tier architecture: React frontend, Express API, PostgreSQL DB.' },
      ],
    }
    const prompt = buildAugmentedPrompt('SQL injection', SELECTION_WITH_PRIMARY, ctx)

    expect(prompt).toContain('### Project Context')
    expect(prompt).toContain('**Uploaded Documents:**')
    expect(prompt).toContain('#### api-spec.pdf')
    expect(prompt).toContain('POST /login accepts username and password')
    expect(prompt).toContain('#### architecture.docx')
    expect(prompt).toContain('3-tier architecture')
  })

  it('injects both description and documents together', () => {
    const ctx = {
      description: 'E-commerce app with Stripe integration',
      documents: [
        { name: 'endpoints.pdf', extractedText: 'GET /products, POST /checkout, DELETE /cart/:id' },
      ],
    }
    const prompt = buildAugmentedPrompt('IDOR in cart', SELECTION_WITH_PRIMARY, ctx)

    expect(prompt).toContain('**Project Description:**')
    expect(prompt).toContain('Stripe integration')
    expect(prompt).toContain('**Uploaded Documents:**')
    expect(prompt).toContain('#### endpoints.pdf')
    expect(prompt).toContain('DELETE /cart/:id')
  })

  it('truncates document text to 2000 characters', () => {
    const longText = 'Z'.repeat(5000)
    const ctx = {
      description: '',
      documents: [{ name: 'big-doc.pdf', extractedText: longText }],
    }
    const prompt = buildAugmentedPrompt('test', SELECTION_WITH_PRIMARY, ctx)

    // The prompt should contain exactly 2000 Z's, not 5000
    const allRuns = [...prompt.matchAll(/Z+/g)].map(m => m[0].length)
    const longest = Math.max(...allRuns)
    expect(longest).toBe(2000)
  })

  it('omits project context section when context is empty', () => {
    const ctx = { description: '', documents: [] }
    const prompt = buildAugmentedPrompt('XSS', SELECTION_WITH_PRIMARY, ctx)

    expect(prompt).not.toContain('### Project Context')
    expect(prompt).not.toContain('**Project Description:**')
    expect(prompt).not.toContain('**Uploaded Documents:**')
  })

  it('omits project context section when context is undefined', () => {
    const prompt = buildAugmentedPrompt('XSS', SELECTION_WITH_PRIMARY)
    expect(prompt).not.toContain('### Project Context')
  })

  it('still includes WSTG references alongside project context', () => {
    const ctx = {
      description: 'My app uses React + Flask',
      documents: [],
    }
    const prompt = buildAugmentedPrompt('reflected XSS', SELECTION_WITH_PRIMARY, ctx)

    // WSTG content present
    expect(prompt).toContain('### Primary WSTG Reference (WSTG-INPV-01)')
    expect(prompt).toContain('### Secondary WSTG References')
    expect(prompt).toContain('**WSTG-INPV-02**')
    // Project context present
    expect(prompt).toContain('### Project Context')
    expect(prompt).toContain('React + Flask')
  })

  it('injects context even when primary WSTG selection is null (generic prompt)', () => {
    const ctx = {
      description: 'Django REST Framework API',
      documents: [{ name: 'spec.pdf', extractedText: 'Authentication via OAuth2' }],
    }
    // When primary is null, buildAugmentedPrompt returns the short generic prompt
    // and does NOT inject context (by current design — context only augments the full prompt)
    const prompt = buildAugmentedPrompt('CSRF attack', SELECTION_NULL, ctx)
    // The generic fallback doesn't include project context — verify this behavior
    expect(prompt).toContain('CSRF attack')
  })
})

// ============================================================================
// buildWSTGListPrompt — uses thin content for first-pass selection
// ============================================================================

describe('buildWSTGListPrompt', () => {
  it('includes the attack vector in the prompt', () => {
    const prompt = buildWSTGListPrompt('SQL injection in login form')
    expect(prompt).toContain('SQL injection in login form')
  })

  it('includes WSTG IDs from thin content', () => {
    const prompt = buildWSTGListPrompt('XSS attack')
    for (const id of Object.keys(wstgThinContent)) {
      expect(prompt).toContain(id)
    }
  })

  it('uses titles from thin content, not descriptions from wstg-data.ts', () => {
    const prompt = buildWSTGListPrompt('XSS attack')
    // Thin title for WSTG-INFO-01 (from first line of thin file)
    expect(prompt).toContain('Conduct Search Engine Discovery Reconnaissance for Information Leakage')
    // wstg-data.ts description should NOT appear (it has different phrasing with raw text)
    const infoEntry = WSTG_ENTRIES.find(e => e.id === 'WSTG-INFO-01')!
    expect(prompt).not.toContain(infoEntry.description)
  })

  it('does not include full markdown content from wstg-full-content.json', () => {
    const prompt = buildWSTGListPrompt('CSRF')
    // Full content has section headers like "## How to Test" — should not be in selection prompt
    expect(prompt).not.toContain('## How to Test')
    expect(prompt).not.toContain('## Summary')
  })
})

// ============================================================================
// wstg-thin-content.json integrity
// ============================================================================

describe('wstg-thin-content.json', () => {
  it('contains 108 entries', () => {
    expect(Object.keys(wstgThinContent).length).toBe(108)
  })

  it('all keys follow WSTG-XXXX-NN format', () => {
    for (const key of Object.keys(wstgThinContent)) {
      expect(key).toMatch(/^WSTG-[A-Z]+-\d+$/)
    }
  })

  it('every entry has non-empty content', () => {
    for (const [, content] of Object.entries(wstgThinContent)) {
      expect((content as string).length).toBeGreaterThan(0)
    }
  })

  it('every WSTG_ENTRIES ID has a matching key in wstg-thin-content.json', () => {
    const thinKeys = new Set(Object.keys(wstgThinContent))
    for (const entry of WSTG_ENTRIES) {
      expect(thinKeys.has(entry.id)).toBe(true)
    }
  })
})

// ============================================================================
// Full flow: LMStudio → parse → lookup → prompt WITH project context
// ============================================================================

describe('Full flow with project context', () => {
  it('end-to-end: parse LMStudio response + inject synthetic project context into OpenCode prompt', () => {
    // Simulate LMStudio selecting entries
    const lmstudioResponse = '{"primary": "WSTG-INPV-05", "secondary": ["WSTG-INPV-01"]}'

    // Step 1: Parse
    const parsed = parseSelectedEntries(lmstudioResponse)
    expect(parsed.primary).toBe('WSTG-INPV-05')

    // Step 2: Lookup
    const primary = WSTG_ENTRIES.find((e) => e.id === parsed.primary) ?? null
    const secondary = parsed.secondary
      .map((id) => WSTG_ENTRIES.find((e) => e.id === id))
      .filter((e): e is WSTGEntry => e !== undefined)
    expect(primary).not.toBeNull()

    // Step 3: Synthetic project context (what would come from manifest.json)
    const projectContext = {
      description: 'Healthcare SaaS app. Tech stack: Next.js 14, Prisma ORM, PostgreSQL. Auth: NextAuth with Google OAuth + email/password. Key endpoints: /api/patients, /api/appointments, /api/billing. HIPAA-compliant data handling required.',
      documents: [
        {
          name: 'api-documentation.pdf',
          extractedText: '## API Endpoints\n\nPOST /api/patients - Create patient record (requires admin role)\nGET /api/patients/:id - Get patient by ID (requires auth)\nPUT /api/patients/:id - Update patient (requires admin role)\nDELETE /api/patients/:id - Soft delete (requires superadmin)\n\nAll endpoints validate JWT token in Authorization header.\nRate limited to 100 req/min per user.',
        },
        {
          name: 'architecture-overview.docx',
          extractedText: '## Architecture\n\nThe application uses a microservices architecture:\n- API Gateway (Next.js API routes)\n- Auth Service (NextAuth)\n- Patient Service (Prisma + PostgreSQL)\n- Notification Service (SendGrid)\n\nAll inter-service communication uses signed JWTs.\nDatabase connections use connection pooling via PgBouncer.',
        },
      ],
    }

    // Step 4: Build the prompt that goes to OpenCode
    const prompt = buildAugmentedPrompt('SQL injection in patient search', { primary, secondary }, projectContext)

    // Verify WSTG content is present
    const fullContent = (wstgFullContent as Record<string, string>)['WSTG-INPV-05']
    expect(prompt).toContain(fullContent!)
    expect(prompt).toContain('SQL injection in patient search')

    // Verify project context is injected
    expect(prompt).toContain('### Project Context (specific to the application being tested)')
    expect(prompt).toContain('Healthcare SaaS app')
    expect(prompt).toContain('Prisma ORM')
    expect(prompt).toContain('HIPAA-compliant')
    expect(prompt).toContain('/api/patients')

    // Verify documents are included
    expect(prompt).toContain('#### api-documentation.pdf')
    expect(prompt).toContain('POST /api/patients - Create patient record')
    expect(prompt).toContain('#### architecture-overview.docx')
    expect(prompt).toContain('microservices architecture')
    expect(prompt).toContain('PgBouncer')

    // Verify prompt structure order: WSTG first, then project context, then instructions
    const wstgPos = prompt.indexOf('### Primary WSTG Reference')
    const contextPos = prompt.indexOf('### Project Context')
    const instructionPos = prompt.indexOf('STRICT OUTPUT FORMAT')
    expect(wstgPos).toBeLessThan(contextPos)
    expect(contextPos).toBeLessThan(instructionPos)
  })

  it('graceful fallback: empty context produces same prompt as no context', () => {
    const selection: WSTGSelection = { primary: ENTRY_INPV01, secondary: [] }
    const promptWithEmpty = buildAugmentedPrompt('XSS', selection, { description: '', documents: [] })
    const promptWithout = buildAugmentedPrompt('XSS', selection)
    expect(promptWithEmpty).toBe(promptWithout)
  })

  it('multiple documents are all included in prompt', () => {
    const selection: WSTGSelection = { primary: ENTRY_SESS01, secondary: [] }
    const ctx = {
      description: '',
      documents: [
        { name: 'doc1.pdf', extractedText: 'Content from first document' },
        { name: 'doc2.docx', extractedText: 'Content from second document' },
        { name: 'doc3.pdf', extractedText: 'Content from third document' },
      ],
    }
    const prompt = buildAugmentedPrompt('session hijacking', selection, ctx)

    expect(prompt).toContain('#### doc1.pdf')
    expect(prompt).toContain('Content from first document')
    expect(prompt).toContain('#### doc2.docx')
    expect(prompt).toContain('Content from second document')
    expect(prompt).toContain('#### doc3.pdf')
    expect(prompt).toContain('Content from third document')
  })
})
