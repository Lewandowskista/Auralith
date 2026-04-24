export type RawChunk = {
  seq: number
  headingPath: string
  charStart: number
  charEnd: number
  page: number | undefined
  text: string
  tokens: number
}

const TARGET_TOKENS = 800
const OVERLAP_TOKENS = 100
// Rough chars-per-token estimate for English — good enough without a tokenizer
const CHARS_PER_TOKEN = 4

const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN

// Heading regex — matches ATX headings (#, ##, ###) and setext headings
const HEADING_RE = /^(#{1,6})\s+(.+)/m

type Section = {
  headingPath: string
  charStart: number
  text: string
}

export function chunkText(fullText: string, pageMap?: Map<number, number>): RawChunk[] {
  const sections = splitIntoSections(fullText)
  const chunks: RawChunk[] = []
  let seq = 0

  for (const section of sections) {
    const sectionChunks = slideSection(section, TARGET_CHARS, OVERLAP_CHARS)
    for (const sc of sectionChunks) {
      const absStart = section.charStart + sc.relStart
      const absEnd = section.charStart + sc.relEnd
      const midpoint = Math.floor((absStart + absEnd) / 2)
      const page = pageMap ? resolvePageNumber(pageMap, midpoint) : undefined

      chunks.push({
        seq: seq++,
        headingPath: section.headingPath,
        charStart: absStart,
        charEnd: absEnd,
        page,
        text: sc.text,
        tokens: estimateTokens(sc.text),
      })
    }
  }

  return chunks
}

function splitIntoSections(text: string): Section[] {
  const lines = text.split('\n')
  const sections: Section[] = []
  const headingStack: string[] = []
  let current = ''
  let currentStart = 0
  let charPos = 0

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      // Flush current section
      if (current.trim()) {
        sections.push({
          headingPath: headingStack.join(' › '),
          charStart: currentStart,
          text: current,
        })
      }
      const level = (headingMatch[1] ?? '').length
      const title = (headingMatch[2] ?? '').trim()
      // Trim stack to current level
      headingStack.splice(level - 1)
      headingStack[level - 1] = title
      current = line + '\n'
      currentStart = charPos
    } else {
      current += line + '\n'
    }
    charPos += line.length + 1
  }

  // Flush last section
  if (current.trim()) {
    sections.push({
      headingPath: headingStack.join(' › '),
      charStart: currentStart,
      text: current,
    })
  }

  // Merge tiny sections (< 200 chars) with the next
  return mergeTinySections(sections, 200)
}

function mergeTinySections(sections: Section[], minChars: number): Section[] {
  const merged: Section[] = []
  for (const s of sections) {
    const lastMerged = merged[merged.length - 1]
    if (merged.length > 0 && lastMerged !== undefined && lastMerged.text.length < minChars) {
      const last = lastMerged
      last.text += '\n' + s.text
    } else {
      merged.push({ ...s })
    }
  }
  return merged
}

type SlideResult = { relStart: number; relEnd: number; text: string }

function slideSection(section: Section, targetChars: number, overlapChars: number): SlideResult[] {
  const text = section.text
  if (text.length <= targetChars) {
    return [{ relStart: 0, relEnd: text.length, text }]
  }

  const results: SlideResult[] = []
  let start = 0

  while (start < text.length) {
    let end = Math.min(start + targetChars, text.length)
    // Snap to sentence/paragraph boundary if possible
    if (end < text.length) {
      const snap = findBreak(text, end)
      if (snap > start) end = snap
    }
    results.push({ relStart: start, relEnd: end, text: text.slice(start, end) })
    if (end >= text.length) break
    start = Math.max(end - overlapChars, start + 1)
  }

  return results
}

function findBreak(text: string, near: number): number {
  // Look up to 200 chars back for a paragraph or sentence break
  const window = text.slice(Math.max(0, near - 200), near)
  const paraBreak = window.lastIndexOf('\n\n')
  if (paraBreak >= 0) return near - (window.length - paraBreak - 2)
  const sentBreak = window.search(/[.!?]\s+[A-Z]/)
  if (sentBreak >= 0) return near - (window.length - sentBreak - 1)
  return near
}

function resolvePageNumber(pageMap: Map<number, number>, charPos: number): number | undefined {
  // pageMap maps charOffset → pageNumber (built during PDF parse)
  let page: number | undefined
  for (const [offset, p] of pageMap) {
    if (offset <= charPos) page = p
    else break
  }
  return page
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

// Exported for tests
export { HEADING_RE }
