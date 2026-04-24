import { readFileSync } from 'fs'
import type { ParsedDoc } from './md'

export type PdfParseResult = ParsedDoc & {
  pageTexts: string[]
}

export async function parsePdf(filePath: string): Promise<PdfParseResult> {
  // Dynamically import to avoid issues in non-Node environments
  // pdf-parse ships both CJS and ESM; use require-style import for Node compat
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (
    buf: Buffer,
    opts?: Record<string, unknown>,
  ) => Promise<{ text: string; numpages: number; info: unknown }>
  const buf = readFileSync(filePath)

  const pageTexts: string[] = []
  const result = await pdfParse(buf, {
    pagerender: async (pageData: {
      getTextContent: () => Promise<{ items: Array<{ str: string }> }>
    }) => {
      const content = await pageData.getTextContent()
      const text = content.items.map((i) => i.str).join(' ')
      pageTexts.push(text)
      return text
    },
  })

  const title =
    (result.info as { Title?: string })?.Title?.trim() ||
    filePath
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.pdf$/i, '') ||
    'Untitled'

  return {
    text: result.text,
    title,
    pageTexts,
  }
}
