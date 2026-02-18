import { spawn } from 'child_process'
import { readFile, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'

export const DOCLING_EXTS = ['pdf', 'docx', 'pptx', 'xlsx', 'html', 'png', 'jpg', 'jpeg', 'webp']
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp']

export function getOutputMdPath(outDir: string, filePath: string): string {
  return join(outDir, basename(filePath).replace(/\.[^.]+$/, '.md'))
}

export async function extractWithDocling(filePath: string): Promise<string> {
  const outDir = join(tmpdir(), `docling-${randomUUID()}`)
  await mkdir(outDir)

  return new Promise((resolve, reject) => {
    const proc = spawn('docling', ['--to', 'md', '--image-export-mode', 'placeholder', '--output', outDir, filePath])

    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })

    proc.on('error', err => {
      rm(outDir, { recursive: true }).catch(() => {})
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Docling is not installed. Run: pip install docling'))
      } else {
        reject(err)
      }
    })

    proc.on('close', async code => {
      if (code !== 0) {
        rm(outDir, { recursive: true }).catch(() => {})
        reject(new Error(`Docling failed (exit ${code}): ${stderr.trim() || 'no output'}`))
        return
      }
      const mdPath = getOutputMdPath(outDir, filePath)
      try {
        const text = await readFile(mdPath, 'utf-8')
        resolve(text)
      } catch {
        reject(new Error(`Docling output not found. stderr: ${stderr.trim()}`))
      } finally {
        rm(outDir, { recursive: true }).catch(() => {})
      }
    })
  })
}
