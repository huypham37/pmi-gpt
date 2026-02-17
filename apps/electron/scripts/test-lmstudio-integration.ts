#!/usr/bin/env bun
/**
 * LMStudio Integration Test Script
 *
 * Tests the RAG pipeline with a live LMStudio server:
 * 1. Test LMStudio server connection
 * 2. Test model response format (1 primary + 2 secondary WSTG entries)
 * 3. Test full RAG flow end-to-end
 *
 * Prerequisites:
 * - LMStudio running with a model loaded
 * - Run: bun scripts/test-lmstudio-integration.ts
 */

import { LMStudioClient, Chat } from '@lmstudio/sdk'
import { WSTG_ENTRIES } from '../src/main/wstg-data'
import { parseSelectedEntries, buildAugmentedPrompt } from '../src/main/wstg-prompt'

// ANSI colors for output
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

function log(msg: string) {
  console.log(msg)
}

function pass(test: string) {
  log(`${GREEN}✓ PASS${RESET}: ${test}`)
}

function fail(test: string, reason: string) {
  log(`${RED}✗ FAIL${RESET}: ${test}`)
  log(`  ${RED}Reason: ${reason}${RESET}`)
}

function info(msg: string) {
  log(`${CYAN}ℹ ${msg}${RESET}`)
}

function warn(msg: string) {
  log(`${YELLOW}⚠ ${msg}${RESET}`)
}

function header(title: string) {
  log('')
  log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`)
  log(`${BOLD}${CYAN}  ${title}${RESET}`)
  log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`)
  log('')
}

// ============================================================================
// Test 1: LMStudio Server Connection
// ============================================================================

async function testLMStudioConnection(): Promise<boolean> {
  header('Test 1: LMStudio Server Connection')

  try {
    const client = new LMStudioClient()
    info('Attempting to connect to LMStudio...')

    // Try to get the default model
    const model = await client.llm.model()
    const modelInfo = await model.getModelInfo()

    pass('Connected to LMStudio')
    info(`Model: ${modelInfo.path}`)
    info(`Context length: ${modelInfo.maxContextLength}`)

    return true
  } catch (error) {
    fail('LMStudio connection', error instanceof Error ? error.message : String(error))
    warn('Make sure LMStudio is running with a model loaded')
    return false
  }
}

// ============================================================================
// Test 2: Model Response Format (1 primary + 2 secondary)
// ============================================================================

const SELECTION_SYSTEM_PROMPT = `You are a security testing assistant. Given a list of OWASP WSTG (Web Security Testing Guide) entries and an attack vector description, select the most relevant WSTG entries for generating test cases.

STRICT REQUIREMENTS:
1. Select exactly 1 PRIMARY entry — the single best match for the attack vector
2. Select exactly 2 SECONDARY entries — related entries that provide additional context

RESPONSE FORMAT (strict JSON, no exceptions):
{"primary": "WSTG-XXXX-XX", "secondary": ["WSTG-XXXX-XX", "WSTG-XXXX-XX"]}

RULES:
- primary: MUST be exactly 1 WSTG ID (the best match)
- secondary: MUST be exactly 2 WSTG IDs (related but distinct from primary)
- All 3 IDs MUST be different
- Return ONLY the JSON object — no explanation, no markdown, no commentary`

function buildWSTGListPrompt(attackVector: string): string {
  const entrySummaries = WSTG_ENTRIES.map(
    (e) => `- ${e.id}: ${e.name} — ${e.description}`,
  ).join('\n')

  return `Attack vector: "${attackVector}"

Available WSTG entries:
${entrySummaries}

Select 1 PRIMARY entry (best match) and 2 SECONDARY entries (related context).
Return JSON: {"primary": "WSTG-...", "secondary": ["WSTG-...", "WSTG-..."]}`
}

async function testModelResponseFormat(): Promise<boolean> {
  header('Test 2: Model Response Format')

  const testCases = [
    'SQL injection in login form',
    'Cross-site scripting (XSS) in search field',
    'Session hijacking attack',
  ]

  let allPassed = true

  for (const attackVector of testCases) {
    info(`Testing attack vector: "${attackVector}"`)

    try {
      const client = new LMStudioClient()
      const model = await client.llm.model()

      const chat = Chat.from([
        { role: 'system', content: SELECTION_SYSTEM_PROMPT },
        { role: 'user', content: buildWSTGListPrompt(attackVector) },
      ])

      const result = await (model.respond(chat, { temperature: 0.1 }) as any).result()
      const responseText = result.content.trim()

      info(`Raw response: ${responseText}`)

      // Parse the response
      const parsed = parseSelectedEntries(responseText)

      // Validate primary
      if (!parsed.primary) {
        fail(`Response format for "${attackVector}"`, 'No primary entry found')
        allPassed = false
        continue
      }

      if (!/^WSTG-[A-Z]+-\d+$/.test(parsed.primary)) {
        fail(`Response format for "${attackVector}"`, `Invalid primary ID format: ${parsed.primary}`)
        allPassed = false
        continue
      }

      // Validate secondary
      if (parsed.secondary.length !== 2) {
        fail(`Response format for "${attackVector}"`, `Expected 2 secondary entries, got ${parsed.secondary.length}`)
        allPassed = false
        continue
      }

      for (const id of parsed.secondary) {
        if (!/^WSTG-[A-Z]+-\d+$/.test(id)) {
          fail(`Response format for "${attackVector}"`, `Invalid secondary ID format: ${id}`)
          allPassed = false
          continue
        }
      }

      // Check all IDs are different
      const allIds = [parsed.primary, ...parsed.secondary]
      const uniqueIds = new Set(allIds)
      if (uniqueIds.size !== 3) {
        fail(`Response format for "${attackVector}"`, `Duplicate IDs found: ${allIds.join(', ')}`)
        allPassed = false
        continue
      }

      // Validate IDs exist in WSTG_ENTRIES
      const validIds = new Set(WSTG_ENTRIES.map((e) => e.id))
      for (const id of allIds) {
        if (!validIds.has(id)) {
          warn(`ID ${id} not found in WSTG_ENTRIES (may be hallucinated)`)
        }
      }

      pass(`Response format for "${attackVector}"`)
      info(`  Primary: ${parsed.primary}`)
      info(`  Secondary: ${parsed.secondary.join(', ')}`)

    } catch (error) {
      fail(`Response format for "${attackVector}"`, error instanceof Error ? error.message : String(error))
      allPassed = false
    }

    log('') // spacing between test cases
  }

  return allPassed
}

// ============================================================================
// Test 3: Full RAG Flow End-to-End
// ============================================================================

async function testFullRAGFlow(): Promise<boolean> {
  header('Test 3: Full RAG Flow End-to-End')

  const attackVector = 'Reflected XSS in user profile page'
  info(`Attack vector: "${attackVector}"`)

  try {
    // Step 1: Connect to LMStudio and get selection
    info('Step 1: Querying LMStudio for WSTG selection...')
    const client = new LMStudioClient()
    const model = await client.llm.model()

    const chat = Chat.from([
      { role: 'system', content: SELECTION_SYSTEM_PROMPT },
      { role: 'user', content: buildWSTGListPrompt(attackVector) },
    ])

    const result = await (model.respond(chat, { temperature: 0.1 }) as any).result()
    const responseText = result.content.trim()
    info(`LMStudio response: ${responseText}`)
    pass('LMStudio responded')

    // Step 2: Parse the response
    info('Step 2: Parsing response...')
    const parsed = parseSelectedEntries(responseText)

    if (!parsed.primary) {
      fail('Parse response', 'No primary entry parsed')
      return false
    }
    pass(`Parsed primary: ${parsed.primary}`)
    pass(`Parsed secondary: ${parsed.secondary.join(', ') || '(none)'}`)

    // Step 3: Look up entries in WSTG_ENTRIES
    info('Step 3: Looking up entries in WSTG_ENTRIES...')
    const primary = WSTG_ENTRIES.find((e) => e.id === parsed.primary) ?? null
    const secondary = parsed.secondary
      .map((id) => WSTG_ENTRIES.find((e) => e.id === id))
      .filter((e): e is typeof WSTG_ENTRIES[0] => e !== undefined)

    if (!primary) {
      fail('Entry lookup', `Primary entry ${parsed.primary} not found in WSTG_ENTRIES`)
      return false
    }
    pass(`Found primary entry: ${primary.name}`)
    info(`Found ${secondary.length} secondary entries`)

    // Step 4: Build augmented prompt
    info('Step 4: Building augmented prompt...')
    const augmentedPrompt = buildAugmentedPrompt(attackVector, { primary, secondary })

    if (!augmentedPrompt.includes(attackVector)) {
      fail('Build prompt', 'Augmented prompt does not contain attack vector')
      return false
    }

    if (!augmentedPrompt.includes('### Primary WSTG Reference')) {
      fail('Build prompt', 'Augmented prompt does not contain primary reference')
      return false
    }

    pass('Built augmented prompt')
    info(`Prompt length: ${augmentedPrompt.length} characters`)

    // Show a preview of the prompt
    log('')
    log(`${BOLD}Augmented Prompt Preview (first 500 chars):${RESET}`)
    log('─'.repeat(60))
    log(augmentedPrompt.slice(0, 500) + '...')
    log('─'.repeat(60))

    // Step 5: Verify secondary entries are included
    if (secondary.length > 0) {
      info('Step 5: Verifying secondary entries in prompt...')
      if (!augmentedPrompt.includes('### Secondary WSTG References')) {
        fail('Secondary entries', 'Augmented prompt does not contain secondary references section')
        return false
      }
      pass('Secondary entries included in prompt')
    }

    log('')
    pass('Full RAG flow completed successfully!')
    return true

  } catch (error) {
    fail('Full RAG flow', error instanceof Error ? error.message : String(error))
    return false
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log('')
  log(`${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════╗${RESET}`)
  log(`${BOLD}${CYAN}║     LMStudio Integration Test Suite                       ║${RESET}`)
  log(`${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════╝${RESET}`)

  const results: { name: string; passed: boolean }[] = []

  // Test 1: Connection
  const test1 = await testLMStudioConnection()
  results.push({ name: 'LMStudio Connection', passed: test1 })

  if (!test1) {
    log('')
    log(`${RED}${BOLD}Aborting: Cannot proceed without LMStudio connection${RESET}`)
    process.exit(1)
  }

  // Test 2: Response Format
  const test2 = await testModelResponseFormat()
  results.push({ name: 'Model Response Format', passed: test2 })

  // Test 3: Full RAG Flow
  const test3 = await testFullRAGFlow()
  results.push({ name: 'Full RAG Flow', passed: test3 })

  // Summary
  header('Test Summary')

  let totalPassed = 0
  let totalFailed = 0

  for (const result of results) {
    if (result.passed) {
      log(`${GREEN}✓${RESET} ${result.name}`)
      totalPassed++
    } else {
      log(`${RED}✗${RESET} ${result.name}`)
      totalFailed++
    }
  }

  log('')
  log(`${BOLD}Total: ${totalPassed} passed, ${totalFailed} failed${RESET}`)

  process.exit(totalFailed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
