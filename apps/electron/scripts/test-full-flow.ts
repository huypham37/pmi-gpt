#!/usr/bin/env bun
/**
 * Full End-to-End Integration Test: Test Case Generation Pipeline
 *
 * Simulates the complete user flow:
 *   User enters attack vector
 *   → LMStudio selects WSTG entries (RAG)
 *   → Augmented prompt built
 *   → ACP session created, prompt sent to OpenCode
 *   → Streamed response collected
 *   → Markdown parsed into TestCase[]
 *   → Final structured test cases returned to user
 *
 * Prerequisites:
 * - LMStudio running with a model loaded
 * - OpenCode installed and on PATH (`opencode acp` must work)
 * - Run: bun scripts/test-full-flow.ts [attack_vector]
 */

import { LMStudioClient, Chat } from '@lmstudio/sdk'
import { ACPClient, ClientCapabilitiesPresets } from '@craft-agent/acp-client'
import { WSTG_ENTRIES, type WSTGEntry } from '../src/main/wstg-data'
import { parseSelectedEntries, buildAugmentedPrompt } from '../src/main/wstg-prompt'
import { parseTestCasesFromResponse, toTestCases } from '../src/shared/testcase-parser'

// ============================================================================
// ANSI helpers
// ============================================================================

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

function pass(label: string) { console.log(`${GREEN}✓ PASS${RESET}: ${label}`) }
function fail(label: string, reason: string) {
  console.log(`${RED}✗ FAIL${RESET}: ${label}`)
  console.log(`  ${RED}Reason: ${reason}${RESET}`)
}
function info(msg: string) { console.log(`${CYAN}ℹ ${msg}${RESET}`) }
function warn(msg: string) { console.log(`${YELLOW}⚠ ${msg}${RESET}`) }
function dim(msg: string)  { console.log(`${DIM}${msg}${RESET}`) }
function header(title: string) {
  console.log('')
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`)
  console.log(`${BOLD}${CYAN}  ${title}${RESET}`)
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`)
  console.log('')
}
function divider() { console.log(`${DIM}${'─'.repeat(60)}${RESET}`) }

// ============================================================================
// LMStudio prompt (must match lmstudio.ts)
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

// ============================================================================
// Step results
// ============================================================================

interface StepResults {
  attackVector: string
  primary: WSTGEntry | null
  secondary: WSTGEntry[]
  augmentedPrompt: string
  acpResponseText: string
  testCases: ReturnType<typeof toTestCases>
}

// ============================================================================
// Step 1: User Input
// ============================================================================

function stepUserInput(): string {
  header('Step 1: User Input')

  // Accept from CLI args or use default
  const attackVector = process.argv[2] || 'SQL injection in login form'
  info(`Attack vector: "${attackVector}"`)

  if (process.argv[2]) {
    info('(provided via CLI argument)')
  } else {
    info('(using default — pass a custom one: bun scripts/test-full-flow.ts "your attack vector")')
  }

  pass('User input received')
  return attackVector
}

// ============================================================================
// Step 2: LMStudio RAG Selection
// ============================================================================

async function stepLMStudioSelection(attackVector: string): Promise<{ primary: WSTGEntry | null; secondary: WSTGEntry[] }> {
  header('Step 2: LMStudio RAG Selection')

  info('Connecting to LMStudio...')
  const client = new LMStudioClient()
  const model = await client.llm.model()
  const modelInfo = await model.getModelInfo()
  pass(`Connected to LMStudio (model: ${modelInfo.path})`)

  info('Sending WSTG selection query...')
  const chat = Chat.from([
    { role: 'system', content: SELECTION_SYSTEM_PROMPT },
    { role: 'user', content: buildWSTGListPrompt(attackVector) },
  ])

  const result = await (model.respond(chat, { temperature: 0.1 }) as any).result()
  const responseText = result.content.trim()

  // Strip <think> blocks for display
  const cleanResponse = responseText.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()
  info(`LMStudio response: ${cleanResponse}`)

  // Parse
  const parsed = parseSelectedEntries(responseText)
  if (!parsed.primary) {
    fail('LMStudio selection', 'No primary entry parsed from response')
    throw new Error('LMStudio did not return a valid primary entry')
  }

  // Look up entries
  const primary = WSTG_ENTRIES.find((e) => e.id === parsed.primary) ?? null
  const secondary = parsed.secondary
    .map((id) => WSTG_ENTRIES.find((e) => e.id === id))
    .filter((e): e is WSTGEntry => e !== undefined)

  if (!primary) {
    fail('Entry lookup', `Primary ${parsed.primary} not found in WSTG_ENTRIES`)
    throw new Error(`Primary entry ${parsed.primary} not in WSTG_ENTRIES`)
  }

  pass(`Primary: ${primary.id} — ${primary.name}`)
  for (const s of secondary) {
    pass(`Secondary: ${s.id} — ${s.name}`)
  }

  return { primary, secondary }
}

// ============================================================================
// Step 3: Build Augmented Prompt
// ============================================================================

// Synthetic project context to simulate a real workspace with context layer
const SYNTHETIC_PROJECT_CONTEXT = {
  description: 'Healthcare SaaS platform. Tech stack: Next.js 14, Prisma ORM, PostgreSQL 15. Auth: NextAuth with Google OAuth + email/password. Key endpoints: /api/patients, /api/appointments, /api/billing. HIPAA-compliant data handling required. All API routes behind JWT middleware.',
  documents: [
    {
      name: 'api-documentation.pdf',
      extractedText: '## API Endpoints\n\nPOST /api/patients - Create patient record (requires admin role)\nGET /api/patients/:id - Get patient by ID (requires auth)\nPUT /api/patients/:id - Update patient (requires admin role)\nDELETE /api/patients/:id - Soft delete (requires superadmin)\nGET /api/patients/search?q= - Full-text search across patient records\n\nPOST /api/appointments - Book appointment\nGET /api/billing/invoices - List invoices for authenticated user\n\nAll endpoints validate JWT token in Authorization header.\nRate limited to 100 req/min per user.\nInput validation via Zod schemas on all POST/PUT bodies.',
    },
    {
      name: 'architecture-overview.docx',
      extractedText: '## Architecture\n\nThe application uses a microservices architecture:\n- API Gateway (Next.js API routes)\n- Auth Service (NextAuth + bcrypt password hashing)\n- Patient Service (Prisma + PostgreSQL)\n- Notification Service (SendGrid)\n\nAll inter-service communication uses signed JWTs.\nDatabase connections use connection pooling via PgBouncer.\nFile uploads stored in S3 with presigned URLs.\nCSRF protection via double-submit cookie pattern.',
    },
  ],
}

function stepBuildPrompt(attackVector: string, selection: { primary: WSTGEntry | null; secondary: WSTGEntry[] }): string {
  header('Step 3: Build Augmented Prompt (with Project Context)')

  const prompt = buildAugmentedPrompt(attackVector, selection, SYNTHETIC_PROJECT_CONTEXT)

  info(`Prompt length: ${prompt.length} chars`)

  // Validate structure
  const checks = [
    { label: 'Contains attack vector', ok: prompt.includes(attackVector) },
    { label: 'Contains Primary WSTG Reference', ok: prompt.includes('### Primary WSTG Reference') },
    { label: 'Contains test case instructions', ok: prompt.includes('**Name:**') },
    { label: 'Contains separator instruction', ok: prompt.includes('Separate each test case with a single --- on its own line') },
    { label: 'Contains Project Context section', ok: prompt.includes('### Project Context (specific to the application being tested)') },
    { label: 'Contains project description', ok: prompt.includes('Healthcare SaaS platform') },
    { label: 'Contains document: api-documentation.pdf', ok: prompt.includes('#### api-documentation.pdf') },
    { label: 'Contains document: architecture-overview.docx', ok: prompt.includes('#### architecture-overview.docx') },
  ]

  if (selection.secondary.length > 0) {
    checks.push({ label: 'Contains Secondary WSTG References', ok: prompt.includes('### Secondary WSTG References') })
  }

  let allOk = true
  for (const c of checks) {
    if (c.ok) pass(c.label)
    else { fail(c.label, 'Not found in prompt'); allOk = false }
  }

  if (!allOk) throw new Error('Augmented prompt validation failed')

  // Preview
  console.log('')
  dim('Preview (first 300 chars):')
  divider()
  dim(prompt.slice(0, 300) + '...')
  divider()

  return prompt
}

// ============================================================================
// Step 4: Send to OpenCode via ACP
// ============================================================================

async function stepACPPrompt(augmentedPrompt: string): Promise<string> {
  header('Step 4: Send to OpenCode via ACP')

  info('Starting ACP client (spawning opencode acp)...')

  const client = new ACPClient({
    executable: 'opencode',
    arguments: ['acp'],
    workingDirectory: process.cwd(),
    clientInfo: {
      name: 'test-full-flow',
      title: 'Full Flow Integration Test',
      version: '1.0.0',
    },
    capabilities: ClientCapabilitiesPresets.full,
  })

  await client.start()
  pass(`ACP client started (agent: ${client.agentInfo?.name ?? 'unknown'})`)

  info('Creating new ACP session...')
  const session = await client.newSession()
  pass(`Session created: ${session.id}`)

  // Set mode to testcase-generator
  info('Setting mode to testcase-generator...')
  try {
    await session.setMode('testcase-generator')
    pass('Mode set to testcase-generator')
  } catch (e) {
    warn(`Failed to set mode: ${e instanceof Error ? e.message : String(e)}`)
    warn('Continuing with default mode...')
  }

  info('Sending augmented prompt to OpenCode...')
  info('(this may take a while depending on the model)')
  console.log('')

  let fullText = ''
  let chunkCount = 0
  const startTime = Date.now()

  // Stream the response
  for await (const update of session.prompt(augmentedPrompt)) {
    switch (update.type) {
      case 'text':
        fullText += update.text
        chunkCount++
        // Print dots for progress
        if (chunkCount % 20 === 0) {
          process.stdout.write('.')
        }
        break
      case 'toolCall':
        dim(`  [tool call: ${update.toolCall.title}]`)
        break
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('') // newline after dots

  if (!fullText) {
    fail('ACP response', 'No text received from OpenCode')
    client.stop()
    throw new Error('Empty response from ACP')
  }

  pass(`Received response: ${fullText.length} chars in ${elapsed}s (${chunkCount} chunks)`)

  // Clean up
  client.stop()

  return fullText
}

// ============================================================================
// Step 5: Parse Response into TestCase[]
// ============================================================================

function stepParseTestCases(responseText: string, sessionId: string): ReturnType<typeof toTestCases> {
  header('Step 5: Parse Response into TestCase[]')

  const parsed = parseTestCasesFromResponse(responseText)
  info(`Parsed ${parsed.length} raw test case blocks`)

  if (parsed.length === 0) {
    fail('Parse test cases', 'No test cases parsed from response')
    console.log('')
    warn('Raw response preview:')
    divider()
    dim(responseText.slice(0, 500))
    divider()
    throw new Error('No test cases parsed')
  }

  const testCases = toTestCases(parsed, sessionId, 'test-workspace')

  pass(`Generated ${testCases.length} structured TestCase objects`)

  // Validate each test case
  let missingAttackVector = 0
  for (const tc of testCases) {
    const checks: string[] = []
    if (!tc.id) checks.push('missing id')
    if (!tc.name) checks.push('missing name')
    if (!tc.workspaceId) checks.push('missing workspaceId')
    if (!tc.generationSessionId) checks.push('missing generationSessionId')

    if (checks.length > 0) {
      fail(`TestCase "${tc.name || tc.id}"`, checks.join(', '))
    } else {
      pass(`TestCase: "${tc.name}"`)
    }

    // Show details
    if (tc.attackVector) dim(`  Attack Vector: ${tc.attackVector}`)
    else { dim(`  Attack Vector: ${RED}(missing)${RESET}`); missingAttackVector++ }
    if (tc.targetComponent) dim(`  Target: ${tc.targetComponent}`)
    if (tc.description) dim(`  Description: ${tc.description.slice(0, 100)}...`)
    if (tc.reference?.length) {
      dim(`  References: ${tc.reference.map(r => r.id).join(', ')}`)
    }
  }

  // Summary check for attack vector field
  if (missingAttackVector > 0) {
    warn(`${missingAttackVector}/${testCases.length} test cases missing Attack Vector field`)
  } else {
    pass(`All ${testCases.length} test cases have Attack Vector field`)
  }

  return testCases
}

// ============================================================================
// Step 6: Final Output (simulates what the user sees)
// ============================================================================

function stepFinalOutput(results: StepResults) {
  header('Step 6: Final Output (User View)')

  console.log(`${BOLD}Attack Vector:${RESET} ${results.attackVector}`)
  console.log(`${BOLD}WSTG Primary:${RESET} ${results.primary?.id} — ${results.primary?.name}`)
  console.log(`${BOLD}WSTG Secondary:${RESET} ${results.secondary.map(s => s.id).join(', ')}`)
  console.log(`${BOLD}Test Cases Generated:${RESET} ${results.testCases.length}`)
  console.log('')

  for (let i = 0; i < results.testCases.length; i++) {
    const tc = results.testCases[i]
    console.log(`${BOLD}${CYAN}Test Case ${i + 1}: ${tc.name}${RESET}`)
    if (tc.attackVector) console.log(`  ${BOLD}Attack Vector:${RESET} ${tc.attackVector}`)
    if (tc.targetComponent) console.log(`  ${BOLD}Target:${RESET} ${tc.targetComponent}`)
    if (tc.description) console.log(`  ${BOLD}Description:${RESET} ${tc.description.slice(0, 150)}${tc.description.length > 150 ? '...' : ''}`)
    if (tc.preconditions) console.log(`  ${BOLD}Preconditions:${RESET} ${tc.preconditions.slice(0, 150)}${tc.preconditions.length > 150 ? '...' : ''}`)
    if (tc.guidance) console.log(`  ${BOLD}Guidance:${RESET} ${tc.guidance.slice(0, 150)}${tc.guidance.length > 150 ? '...' : ''}`)
    if (tc.reference?.length) {
      console.log(`  ${BOLD}References:${RESET}`)
      for (const ref of tc.reference) {
        console.log(`    - ${ref.id}: ${ref.name}${ref.url ? ` (${ref.url})` : ''}`)
      }
    }
    console.log('')
  }
}

// ============================================================================
// Summary
// ============================================================================

function printSummary(steps: { name: string; passed: boolean; durationMs: number }[]) {
  header('Test Summary')

  let totalPassed = 0
  let totalFailed = 0

  for (const step of steps) {
    const dur = `${(step.durationMs / 1000).toFixed(1)}s`
    if (step.passed) {
      console.log(`${GREEN}✓${RESET} ${step.name} ${DIM}(${dur})${RESET}`)
      totalPassed++
    } else {
      console.log(`${RED}✗${RESET} ${step.name} ${DIM}(${dur})${RESET}`)
      totalFailed++
    }
  }

  console.log('')
  const totalDur = steps.reduce((sum, s) => sum + s.durationMs, 0)
  console.log(`${BOLD}Total: ${totalPassed} passed, ${totalFailed} failed (${(totalDur / 1000).toFixed(1)}s)${RESET}`)
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('')
  console.log(`${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════╗${RESET}`)
  console.log(`${BOLD}${CYAN}║   Full End-to-End Test: Test Case Generation Pipeline     ║${RESET}`)
  console.log(`${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════╝${RESET}`)

  const steps: { name: string; passed: boolean; durationMs: number }[] = []
  const results: Partial<StepResults> = {}

  // Step 1: User Input
  let t = Date.now()
  try {
    results.attackVector = stepUserInput()
    steps.push({ name: 'Step 1: User Input', passed: true, durationMs: Date.now() - t })
  } catch (e) {
    steps.push({ name: 'Step 1: User Input', passed: false, durationMs: Date.now() - t })
    printSummary(steps); process.exit(1)
  }

  // Step 2: LMStudio RAG Selection
  t = Date.now()
  try {
    const selection = await stepLMStudioSelection(results.attackVector!)
    results.primary = selection.primary
    results.secondary = selection.secondary
    steps.push({ name: 'Step 2: LMStudio RAG Selection', passed: true, durationMs: Date.now() - t })
  } catch (e) {
    fail('Step 2', e instanceof Error ? e.message : String(e))
    steps.push({ name: 'Step 2: LMStudio RAG Selection', passed: false, durationMs: Date.now() - t })
    printSummary(steps); process.exit(1)
  }

  // Step 3: Build Augmented Prompt
  t = Date.now()
  try {
    results.augmentedPrompt = stepBuildPrompt(results.attackVector!, {
      primary: results.primary!,
      secondary: results.secondary!,
    })
    steps.push({ name: 'Step 3: Build Augmented Prompt', passed: true, durationMs: Date.now() - t })
  } catch (e) {
    fail('Step 3', e instanceof Error ? e.message : String(e))
    steps.push({ name: 'Step 3: Build Augmented Prompt', passed: false, durationMs: Date.now() - t })
    printSummary(steps); process.exit(1)
  }

  // Step 4: Send to OpenCode via ACP
  t = Date.now()
  try {
    results.acpResponseText = await stepACPPrompt(results.augmentedPrompt!)
    steps.push({ name: 'Step 4: ACP → OpenCode', passed: true, durationMs: Date.now() - t })
  } catch (e) {
    fail('Step 4', e instanceof Error ? e.message : String(e))
    steps.push({ name: 'Step 4: ACP → OpenCode', passed: false, durationMs: Date.now() - t })
    printSummary(steps); process.exit(1)
  }

  // Step 5: Parse into TestCase[]
  t = Date.now()
  try {
    results.testCases = stepParseTestCases(results.acpResponseText!, 'test-session-001')
    steps.push({ name: 'Step 5: Parse TestCase[]', passed: true, durationMs: Date.now() - t })
  } catch (e) {
    fail('Step 5', e instanceof Error ? e.message : String(e))
    steps.push({ name: 'Step 5: Parse TestCase[]', passed: false, durationMs: Date.now() - t })
    printSummary(steps); process.exit(1)
  }

  // Step 6: Final Output
  t = Date.now()
  try {
    stepFinalOutput(results as StepResults)
    steps.push({ name: 'Step 6: Final Output', passed: true, durationMs: Date.now() - t })
  } catch (e) {
    fail('Step 6', e instanceof Error ? e.message : String(e))
    steps.push({ name: 'Step 6: Final Output', passed: false, durationMs: Date.now() - t })
  }

  printSummary(steps)
  process.exit(steps.some(s => !s.passed) ? 1 : 0)
}

main().catch((error) => {
  console.error(`${RED}Unexpected error:${RESET}`, error)
  process.exit(1)
})
