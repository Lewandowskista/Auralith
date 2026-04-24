import { readFileSync } from 'fs'
import { basename, extname } from 'path'
import { inflateRawSync } from 'zlib'

// Parse EPUB by extracting content/*.html + xhtml files from the ZIP.
// Reuses the same ZIP traversal approach as docx.ts.

function findAllZipEntries(
  buf: Buffer,
  predicate: (name: string) => boolean,
): Array<{ name: string; data: Buffer }> {
  const results: Array<{ name: string; data: Buffer }> = []
  let offset = 0
  while (offset < buf.length - 30) {
    const sig = buf.readUInt32LE(offset)
    if (sig !== 0x04034b50) {
      offset++
      continue
    }
    const fnLen = buf.readUInt16LE(offset + 26)
    const extraLen = buf.readUInt16LE(offset + 28)
    const entryName = buf.subarray(offset + 30, offset + 30 + fnLen).toString('utf8')
    const dataOffset = offset + 30 + fnLen + extraLen
    const compSize = buf.readUInt32LE(offset + 18)
    const method = buf.readUInt16LE(offset + 8)

    if (predicate(entryName)) {
      const compressed = buf.subarray(dataOffset, dataOffset + compSize)
      let data: Buffer | null = null
      if (method === 0) {
        data = compressed
      } else if (method === 8) {
        try {
          data = inflateRawSync(compressed)
        } catch {
          /* skip */
        }
      }
      if (data) results.push({ name: entryName, data })
    }

    offset = dataOffset + compSize
  }
  return results
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}

export function parseEpub(filePath: string): { text: string; title: string } {
  const buf = readFileSync(filePath)

  // Try to get title from OPF metadata
  let title = basename(filePath, extname(filePath))
  const opfEntries = findAllZipEntries(buf, (n) => n.endsWith('.opf'))
  if (opfEntries.length > 0) {
    const opf = (opfEntries[0]?.data ?? Buffer.alloc(0)).toString('utf8')
    const m = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)
    if (m?.[1]) title = m[1].trim()
  }

  const htmlEntries = findAllZipEntries(buf, (n) => {
    const lower = n.toLowerCase()
    return lower.endsWith('.html') || lower.endsWith('.xhtml') || lower.endsWith('.htm')
  })

  // Sort by name for consistent chapter order
  htmlEntries.sort((a, b) => a.name.localeCompare(b.name))

  const textParts = htmlEntries.map((e) => htmlToText(e.data.toString('utf8'))).filter(Boolean)
  const text = textParts.join('\n\n')

  return { text: text || '(no readable content)', title }
}
