/**
 * Build-time script: reads all WSTG markdown files from wstg-tests/ and outputs
 * a single JSON file mapping WSTG IDs to their full markdown content.
 *
 * Output: src/main/wstg-full-content.json — { "WSTG-INPV-01": "full markdown...", ... }
 *
 * This JSON is imported by lmstudio.ts and inlined by esbuild into the main bundle,
 * so there's no runtime file I/O needed.
 *
 * Run: bun scripts/build-wstg-json.ts
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const WSTG_ROOT = join(__dirname, '..', '..', '..', 'wstg-tests')
const OUTPUT_PATH = join(__dirname, '..', 'src', 'main', 'wstg-full-content.json')

const result: Record<string, string> = {}

// Category directories: 01-INFO, 02-CONF, ..., 12-API
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

    // Extract id from frontmatter (between --- markers)
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/m)
    if (!fmMatch) {
      // Try extracting from filename: WSTG-INPV-01.md → WSTG-INPV-01
      const idFromFile = file.replace(/\.md$/, '')
      if (/^WSTG-[A-Z]+-\d+$/.test(idFromFile)) {
        result[idFromFile] = content
        continue
      }
      console.warn(`Skipping ${dir}/${file}: no frontmatter found`)
      continue
    }

    // Parse id from frontmatter block
    const idLine = fmMatch[1].match(/^id:\s*(.+)$/m)
    if (!idLine) {
      console.warn(`Skipping ${dir}/${file}: no id in frontmatter`)
      continue
    }

    const id = idLine[1].trim()
    result[id] = content
  }
}

writeFileSync(OUTPUT_PATH, JSON.stringify(result), 'utf-8')

const count = Object.keys(result).length
const sizeKB = Math.round(Buffer.byteLength(JSON.stringify(result)) / 1024)
console.log(`✓ Built wstg-full-content.json: ${count} entries, ${sizeKB}KB`)
