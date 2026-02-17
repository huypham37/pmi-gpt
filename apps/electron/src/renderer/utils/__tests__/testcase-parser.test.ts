import { describe, it, expect } from 'bun:test'
import {
  parseSingleTestCase,
  parseTestCasesFromResponse,
  toTestCases,
} from '../testcase-parser'

// ============================================================================
// parseSingleTestCase
// ============================================================================

describe('parseSingleTestCase', () => {
  it('parses all fields from a well-formed block', () => {
    const block = `
**Name:** Basic <script> Tag Injection
**Target Component:** Comment body field in POST /api/comments
**Description:** Tests whether the application properly sanitizes basic script tag injections.

**Guidance:**
| Step | Expected-result | Example |
|------|-----------------|---------|
| 1. Navigate to /comments/new | Page loads | Open browser |
| 2. Enter payload in body | Input accepted | <script>alert(1)</script> |

**Reference:**
| ID | Name | URL |
|----|------|-----|
| WSTG-INPV-01 | Testing for Reflected XSS | https://owasp.org/wstg-inpv-01 |
| CAPEC-86 | XSS via HTTP Headers | https://capec.mitre.org/data/definitions/86.html |
`
    const result = parseSingleTestCase(block)

    expect(result).not.toBeNull()
    expect(result!.name).toBe('Basic <script> Tag Injection')
    expect(result!.targetComponent).toBe('Comment body field in POST /api/comments')
    expect(result!.description).toBe('Tests whether the application properly sanitizes basic script tag injections.')
    expect(result!.guidance).toContain('1. Navigate to /comments/new')
    expect(result!.guidance).toContain('Expected: Page loads')
    expect(result!.guidance).toContain('2. Enter payload in body')
    expect(result!.reference).toHaveLength(2)
    expect(result!.reference![0]).toEqual({
      id: 'WSTG-INPV-01',
      name: 'Testing for Reflected XSS',
      url: 'https://owasp.org/wstg-inpv-01',
    })
    expect(result!.reference![1]).toEqual({
      id: 'CAPEC-86',
      name: 'XSS via HTTP Headers',
      url: 'https://capec.mitre.org/data/definitions/86.html',
    })
  })

  it('returns null when Name is missing', () => {
    const block = `
**Target Component:** Something
**Description:** No name field here
`
    expect(parseSingleTestCase(block)).toBeNull()
  })

  it('parses preconditions field', () => {
    const block = `
**Name:** Auth Bypass Test
**Preconditions:** User must be authenticated and have admin role
**Description:** Tests authorization bypass
`
    const result = parseSingleTestCase(block)

    expect(result).not.toBeNull()
    expect(result!.preconditions).toBe('User must be authenticated and have admin role')
  })

  it('handles missing optional fields', () => {
    const block = `**Name:** Minimal Test Case`
    const result = parseSingleTestCase(block)

    expect(result).not.toBeNull()
    expect(result!.name).toBe('Minimal Test Case')
    expect(result!.targetComponent).toBeUndefined()
    expect(result!.description).toBeUndefined()
    expect(result!.guidance).toBeUndefined()
    expect(result!.reference).toBeUndefined()
  })

  it('handles reference table without URL column', () => {
    const block = `
**Name:** No URL Refs
**Reference:**
| ID | Name | URL |
|----|------|-----|
| CWE-79 | Improper Neutralization | |
`
    const result = parseSingleTestCase(block)

    expect(result!.reference).toHaveLength(1)
    expect(result!.reference![0].id).toBe('CWE-79')
    expect(result!.reference![0].url).toBeUndefined()
  })

  it('handles guidance table with Example column', () => {
    const block = `
**Name:** With Examples
**Guidance:**
| Step | Expected-result | Example |
|------|-----------------|---------|
| Submit form | 200 OK | curl -X POST /api |
`
    const result = parseSingleTestCase(block)

    expect(result!.guidance).toContain('Submit form')
    expect(result!.guidance).toContain('Expected: 200 OK')
    expect(result!.guidance).toContain('Example: curl -X POST /api')
  })
})

// ============================================================================
// parseTestCasesFromResponse
// ============================================================================

describe('parseTestCasesFromResponse', () => {
  it('splits multiple test cases by horizontal rule', () => {
    const response = `
**Name:** Test Case A
**Target Component:** Target A
**Description:** First test case

---

**Name:** Test Case B
**Target Component:** Target B
**Description:** Second test case
`
    const results = parseTestCasesFromResponse(response)

    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('Test Case A')
    expect(results[1].name).toBe('Test Case B')
  })

  it('splits by numbered headings', () => {
    const response = `
### 1. First Test
**Name:** SQL Injection Basic
**Description:** Tests basic SQL injection

### 2. Second Test
**Name:** XSS Reflected
**Description:** Tests reflected XSS
`
    const results = parseTestCasesFromResponse(response)

    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('SQL Injection Basic')
    expect(results[1].name).toBe('XSS Reflected')
  })

  it('splits by repeated **Name:** fields', () => {
    const response = `
**Name:** First
**Description:** Desc 1

**Name:** Second
**Description:** Desc 2
`
    const results = parseTestCasesFromResponse(response)

    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('First')
    expect(results[1].name).toBe('Second')
  })

  it('handles a single test case', () => {
    const response = `
**Name:** Only One
**Target Component:** Single target
`
    const results = parseTestCasesFromResponse(response)

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Only One')
  })

  it('skips blocks without a Name field', () => {
    const response = `
Here is some preamble text without test case fields.

---

**Name:** Valid Test Case
**Description:** This one is valid

---

Some trailing commentary.
`
    const results = parseTestCasesFromResponse(response)

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Valid Test Case')
  })
})

// ============================================================================
// toTestCases
// ============================================================================

describe('toTestCases', () => {
  it('converts parsed results into full TestCase objects', () => {
    const parsed = [
      { name: 'TC1', targetComponent: 'Target 1', description: 'Desc 1' },
      { name: 'TC2', description: 'Desc 2' },
    ]

    const results = toTestCases(parsed, 'session-123', 'workspace-456')

    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('TC1')
    expect(results[0].generationSessionId).toBe('session-123')
    expect(results[0].workspaceId).toBe('workspace-456')
    expect(results[0].id).toMatch(/^tc-/)
    expect(results[0].createdAt).toBeGreaterThan(0)
    expect(results[1].name).toBe('TC2')
    // IDs should be unique
    expect(results[0].id).not.toBe(results[1].id)
  })
})
