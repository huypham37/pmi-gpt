import { describe, it, expect } from 'bun:test'
import { DOCLING_EXTS, IMAGE_EXTS, getOutputMdPath } from '../lib/docling-extract'

describe('DOCLING_EXTS', () => {
  it('includes expected document formats', () => {
    expect(DOCLING_EXTS).toContain('pdf')
    expect(DOCLING_EXTS).toContain('docx')
    expect(DOCLING_EXTS).toContain('pptx')
    expect(DOCLING_EXTS).toContain('xlsx')
    expect(DOCLING_EXTS).toContain('html')
  })

  it('includes image formats', () => {
    for (const ext of IMAGE_EXTS) {
      expect(DOCLING_EXTS).toContain(ext)
    }
  })
})

describe('IMAGE_EXTS', () => {
  it('contains only image extensions', () => {
    expect(IMAGE_EXTS).toEqual(['png', 'jpg', 'jpeg', 'webp'])
  })
})

describe('getOutputMdPath', () => {
  it('replaces file extension with .md', () => {
    expect(getOutputMdPath('/out', '/docs/report.pdf')).toBe('/out/report.md')
    expect(getOutputMdPath('/out', '/docs/spec.docx')).toBe('/out/spec.md')
    expect(getOutputMdPath('/out', '/docs/slide.pptx')).toBe('/out/slide.md')
  })

  it('handles files with multiple dots', () => {
    expect(getOutputMdPath('/out', '/docs/my.report.v2.pdf')).toBe('/out/my.report.v2.md')
  })
})
