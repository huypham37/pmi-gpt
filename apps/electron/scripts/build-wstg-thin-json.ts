/**
 * Build-time script: reads WSTG thin markdown files from wstg-tests-thin/ and outputs
 * a compact JSON mapping WSTG IDs to their thin content (for first-pass selection).
 *
 * Output: src/main/wstg-thin-content.json — { "WSTG-INPV-01": "thin markdown...", ... }
 *
 * Run: bun scripts/build-wstg-thin-json.ts
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const WSTG_ROOT = join(__dirname, '..', '..', '..', 'wstg-tests-thin')
const OUTPUT_PATH = join(__dirname, '..', 'src', 'main', 'wstg-thin-content.json')

const result: Record<string, string> = {}

const categoryDirs = readdirSync(WSTG_ROOT).filter(
  (d) => /^\d{2}-[A-Z]+$/.test(d),
)

for (const dir of categoryDirs.sort()) {
  const dirPath = join(WSTG_ROOT, dir)
  const files = readdirSync(dirPath).filter(
    (f) => f.endsWith('.md') && !f.includes(':'),
  )

  for (const file of files.sort()) {
    const content = readFileSync(join(dirPath, file), 'utf-8')

    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/m)
    if (!fmMatch) {
      const idFromFile = file.replace(/\.md$/, '')
      if (/^WSTG-[A-Z]+-\d+$/.test(idFromFile)) {
        result[idFromFile] = content
        continue
      }
      console.warn(`Skipping ${dir}/${file}: no frontmatter found`)
      continue
    }

    const idLine = fmMatch[1].match(/^id:\s*(.+)$/m)
    if (!idLine) {
      console.warn(`Skipping ${dir}/${file}: no id in frontmatter`)
      continue
    }

    result[idLine[1].trim()] = content
  }
}

writeFileSync(OUTPUT_PATH, JSON.stringify(result), 'utf-8')

const count = Object.keys(result).length
const sizeKB = Math.round(Buffer.byteLength(JSON.stringify(result)) / 1024)
console.log(`✓ Built wstg-thin-content.json: ${count} entries, ${sizeKB}KB`)
