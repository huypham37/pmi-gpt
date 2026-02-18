import type { TestCase, Reference } from './types'

/**
 * Parsed test case fields extracted from AI markdown response.
 * Missing fields are undefined — caller fills in id, timestamps, etc.
 */
export interface ParsedTestCase {
  name: string
  attackVector?: string
  targetComponent?: string
  description?: string
  preconditions?: string
  guidance?: string
  reference?: Reference[]
}

/**
 * Parse a single AI-generated markdown block into a ParsedTestCase.
 *
 * Expected markdown shape:
 *
 * ```
 * **Name:** Basic <script> Tag Injection
 * **Attack Vector:** Reflected XSS
 * **Target Component:** Comment body field in POST /api/comments
 * **Description:** Tests whether the application properly sanitizes ...
 *
 * **Guidance:**
 * | Step | Expected-result | Example |
 * |------|-----------------|---------|
 * | 1. Navigate to /comments | Page loads | ... |
 *
 * **Reference:**
 * | ID | Name | URL |
 * |----|------|-----|
 * | WSTG-INPV-01 | Testing for Reflected XSS | https://... |
 * ```
 */
export function parseSingleTestCase(block: string): ParsedTestCase | null {
  const name = extractField(block, 'Name')
  if (!name) return null

  const attackVector = extractField(block, 'Attack Vector')
  const targetComponent = extractField(block, 'Target Component')
  const description = extractField(block, 'Description')
  const preconditions = extractField(block, 'Preconditions')
  const guidanceTable = extractTable(block, 'Guidance')
  const referenceTable = extractTable(block, 'Reference')

  const guidance = guidanceTable
    ? formatGuidanceRows(parseMarkdownTable(guidanceTable))
    : undefined

  const reference = referenceTable
    ? parseReferenceTable(parseMarkdownTable(referenceTable))
    : undefined

  return {
    name,
    attackVector,
    targetComponent,
    description,
    preconditions,
    guidance,
    reference: reference && reference.length > 0 ? reference : undefined,
  }
}

/**
 * Parse a full AI response that may contain multiple test cases.
 * Test cases are separated by markdown horizontal rules (---) or
 * numbered headings (### 1., ### 2., etc.).
 */
export function parseTestCasesFromResponse(response: string): ParsedTestCase[] {
  const blocks = splitIntoBlocks(response)
  const results: ParsedTestCase[] = []

  for (const block of blocks) {
    const parsed = parseSingleTestCase(block)
    if (parsed) {
      results.push(parsed)
    }
  }

  return results
}

/**
 * Convert parsed test cases into full TestCase objects with IDs and timestamps.
 */
export function toTestCases(
  parsed: ParsedTestCase[],
  sessionId: string,
  workspaceId: string,
): TestCase[] {
  const now = Date.now()
  return parsed.map((p, i) => ({
    id: `tc-${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    generationSessionId: sessionId,
    name: p.name,
    attackVector: p.attackVector,
    targetComponent: p.targetComponent,
    description: p.description,
    preconditions: p.preconditions,
    guidance: p.guidance,
    reference: p.reference,
    createdAt: now + i,
    updatedAt: now + i,
  }))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract a simple key-value field like `**Name:** value`.
 * Captures everything after the colon up to the next field header or table.
 */
function extractField(text: string, fieldName: string): string | undefined {
  // Match **Field:** or **Field :** with optional whitespace
  const pattern = new RegExp(
    `\\*\\*${escapeRegex(fieldName)}\\s*:\\*\\*\\s*(.+?)(?=\\n\\s*\\*\\*[A-Z]|\\n\\s*\\|\\s*[-A-Z]|$)`,
    's',
  )
  const match = text.match(pattern)
  if (!match) return undefined

  const value = match[1].trim()
  return value || undefined
}

/**
 * Extract a markdown table that follows a **FieldName:** header.
 * Returns the raw table string (header row + separator + data rows).
 */
function extractTable(text: string, fieldName: string): string | undefined {
  // Find the field header, then capture the table that follows
  const pattern = new RegExp(
    `\\*\\*${escapeRegex(fieldName)}\\s*:\\*\\*[^\\n]*\\n((?:\\s*\\|.+\\|\\s*\\n?)+)`,
    's',
  )
  const match = text.match(pattern)
  if (!match) return undefined

  return match[1].trim() || undefined
}

/**
 * Parse a markdown table string into an array of row objects.
 * First row is treated as headers; separator row (|---|) is skipped.
 */
function parseMarkdownTable(tableStr: string): Record<string, string>[] {
  const lines = tableStr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length < 2) return []

  // Parse header row
  const headers = parseTableRow(lines[0])

  // Find where data rows start (skip separator rows like |---|---|)
  let dataStart = 1
  for (let i = 1; i < lines.length; i++) {
    if (/^\|[\s-:|]+\|$/.test(lines[i])) {
      dataStart = i + 1
    } else {
      break
    }
  }

  const rows: Record<string, string>[] = []
  for (let i = dataStart; i < lines.length; i++) {
    const cells = parseTableRow(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j].toLowerCase().trim()
      row[key] = (cells[j] ?? '').trim()
    }
    rows.push(row)
  }

  return rows
}

/** Split a markdown table row `| a | b | c |` into cell values. */
function parseTableRow(line: string): string[] {
  // Remove leading/trailing pipes and split
  const trimmed = line.replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

/**
 * Format guidance table rows into a readable markdown string
 * for storage in the `guidance` field.
 */
function formatGuidanceRows(rows: Record<string, string>[]): string | undefined {
  if (rows.length === 0) return undefined

  const lines: string[] = []
  for (const row of rows) {
    const step = row['step'] ?? ''
    const expected = row['expected-result'] ?? row['expected result'] ?? ''
    const example = row['example'] ?? ''

    const parts: string[] = []
    if (step) parts.push(step)
    if (expected) parts.push(`Expected: ${expected}`)
    if (example) parts.push(`Example: ${example}`)

    if (parts.length > 0) {
      lines.push(parts.join('\n   '))
    }
  }

  return lines.length > 0 ? lines.join('\n') : undefined
}

/**
 * Parse reference table rows into Reference objects.
 */
function parseReferenceTable(rows: Record<string, string>[]): Reference[] {
  const refs: Reference[] = []
  for (const row of rows) {
    const id = row['id'] ?? ''
    const name = row['name'] ?? ''
    if (!id) continue

    const ref: Reference = { id, name }
    const url = row['url'] ?? ''
    if (url) ref.url = url

    refs.push(ref)
  }
  return refs
}

/**
 * Split a full AI response into individual test case blocks.
 * Handles:
 * - Horizontal rules: `---`, `***`, `___`
 * - Numbered headings: `### 1.`, `## Test Case 2`
 * - Multiple `**Name:**` fields as implicit separators
 */
function splitIntoBlocks(text: string): string[] {
  // Try splitting by --- / *** / ___ horizontal rules first
  const hrParts = text.split(/\n\s*(?:---+|\*\*\*+|___+)\s*\n/)
  if (hrParts.length > 1) {
    return hrParts.map((p) => p.trim()).filter((p) => p.length > 0)
  }

  // Try splitting by numbered headings (### 1., ## Test Case 2, etc.)
  const headingParts = text.split(/\n(?=#{1,3}\s+(?:\d+[\.\):]|Test\s*Case))/i)
  if (headingParts.length > 1) {
    return headingParts.map((p) => p.trim()).filter((p) => p.length > 0)
  }

  // Try splitting by repeated **Name:** occurrences
  const nameParts = text.split(/\n(?=\*\*Name\s*:\*\*)/)
  if (nameParts.length > 1) {
    return nameParts.map((p) => p.trim()).filter((p) => p.length > 0)
  }

  // Single block
  return [text.trim()]
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
