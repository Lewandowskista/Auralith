import { readFileSync } from 'fs'
import { basename, extname } from 'path'
import { inflateRawSync } from 'zlib'

// Parse DOCX by extracting word/document.xml from the ZIP archive.
// Uses built-in Node zlib + manual ZIP traversal — no extra deps.

function findZipEntry(buf: Buffer, name: string): Buffer | null {
  // Scan local file headers (signature 0x04034b50)
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

    if (entryName === name) {
      const compressed = buf.subarray(dataOffset, dataOffset + compSize)
      if (method === 0) return compressed
      if (method === 8) {
        try {
          return inflateRawSync(compressed)
        } catch {
          return null
        }
      }
      return null
    }

    offset = dataOffset + compSize
  }
  return null
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<w:br[^/]*/gi, '\n')
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function parseDocx(filePath: string): { text: string; title: string } {
  const buf = readFileSync(filePath)
  const entry = findZipEntry(buf, 'word/document.xml')
  if (!entry) throw new Error('word/document.xml not found in DOCX')
  const text = xmlToText(entry.toString('utf8'))
  const title = basename(filePath, extname(filePath))
  return { text, title }
}
