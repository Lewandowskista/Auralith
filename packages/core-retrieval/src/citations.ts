import type { SearchHit, NeighborChunk } from './hybrid'

export type Citation = {
  n: number
  chunkId: string
  docPath: string
  docTitle: string
  docSummary: string | null
  headingPath: string
  charStart: number
  charEnd: number
  page: number | undefined
  text: string
  neighbors?: NeighborChunk[]
}

export type CitationContext = {
  chunks: Array<{ n: number; text: string; path: string }>
  citations: Citation[]
}

export function assembleCitations(hits: SearchHit[]): CitationContext {
  const citations: Citation[] = hits.map((h, i) => {
    const c: Citation = {
      n: i + 1,
      chunkId: h.chunkId,
      docPath: h.docPath,
      docTitle: h.docTitle,
      docSummary: h.docSummary ?? null,
      headingPath: h.headingPath,
      charStart: h.charStart,
      charEnd: h.charEnd,
      page: h.page,
      text: h.text,
    }
    if (h.neighbors) c.neighbors = h.neighbors
    return c
  })

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
