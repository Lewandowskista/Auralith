import type { SearchHit } from './hybrid'

export type Citation = {
  n: number
  chunkId: string
  docPath: string
  docTitle: string
  headingPath: string
  charStart: number
  charEnd: number
  page: number | undefined
  text: string
}

export type CitationContext = {
  chunks: Array<{ n: number; text: string; path: string }>
  citations: Citation[]
}

export function assembleCitations(hits: SearchHit[]): CitationContext {
  const citations: Citation[] = hits.map((h, i) => ({
    n: i + 1,
    chunkId: h.chunkId,
    docPath: h.docPath,
    docTitle: h.docTitle,
    headingPath: h.headingPath,
    charStart: h.charStart,
    charEnd: h.charEnd,
    page: h.page,
    text: h.text,
  }))

  const chunks = citations.map((c) => ({
    n: c.n,
    text: c.text,
    path: c.docTitle + (c.headingPath ? ` › ${c.headingPath}` : ''),
  }))

  return { citations, chunks }
}

// Parse [^n] references out of an LLM response and return cited citation numbers
export function parseCitationRefs(answer: string): number[] {
  const matches = [...answer.matchAll(/\[\^(\d+)\]/g)]
  return [...new Set(matches.map((m) => parseInt(m[1] ?? '0', 10)).filter((n) => n > 0))].sort(
    (a, b) => a - b,
  )
}
