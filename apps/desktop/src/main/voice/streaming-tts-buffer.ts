// Buffers LLM tokens and flushes complete sentences/clauses to TTS.
// Flush triggers:
//   - terminal punctuation [.!?] followed by space or newline (not acronyms like U.S.A.)
//   - clause break [,;:—] after >= 40 chars buffered
//   - >= 120 chars without any break (hard cap)
//   - single newline (model greeting/ack prefix)

const CLAUSE_BREAK_RE = /[,;:—]/
const CLAUSE_MIN_LEN = 40
const HARD_CAP = 120

// Matches [A-Z]. patterns at the tail — likely an acronym mid-stream (U.S., Dr., etc.)
const ACRONYM_TAIL_RE = /(?:^|\s)[A-Z][a-z]{0,2}\.\s*$|(?:[A-Z]\.){2,}\s*$/

// Numbered list item prefix — "1. " at the very start of a flush candidate
const NUMBERED_LIST_RE = /^\d+\.\s/

export class StreamingTtsBuffer {
  private buf = ''
  private cancelled = false

  constructor(private readonly onFlush: (chunk: string) => void) {}

  push(token: string): void {
    if (this.cancelled) return
    this.buf += token

    // Single newline prefix flush
    if (this.buf === '\n') {
      this.buf = ''
      return
    }

    // Sentence-end: [.!?] followed by whitespace or end of token
    // Guard: skip if it looks like an acronym, ellipsis, or numbered list
    const sentenceMatch = this.buf.match(/^(.*[.!?])\s/)
    if (sentenceMatch && sentenceMatch[1]) {
      const candidate = sentenceMatch[1]
      // Skip ellipsis
      if (candidate.endsWith('...')) {
        /* not a real sentence end */
      }
      // Skip acronyms (U.S., Dr., N.A.T.O., etc.) and numbered list items
      else if (!ACRONYM_TAIL_RE.test(candidate) && !NUMBERED_LIST_RE.test(candidate)) {
        const chunk = candidate.trim()
        this.buf = this.buf.slice(sentenceMatch[0].length)
        if (chunk.length > 0) this.onFlush(chunk)
        return
      }
    }

    // Clause break after min length
    if (this.buf.length >= CLAUSE_MIN_LEN && CLAUSE_BREAK_RE.test(token)) {
      const chunk = this.buf.trim()
      this.buf = ''
      if (chunk.length > 0) this.onFlush(chunk)
      return
    }

    // Hard cap
    if (this.buf.length >= HARD_CAP) {
      // Try to break at last space to avoid mid-word cut
      const lastSpace = this.buf.lastIndexOf(' ')
      const cutAt = lastSpace > 0 ? lastSpace : this.buf.length
      const chunk = this.buf.slice(0, cutAt).trim()
      this.buf = this.buf.slice(cutAt).trimStart()
      if (chunk.length > 0) this.onFlush(chunk)
    }
  }

  flushFinal(): void {
    if (this.cancelled) return
    const remaining = this.buf.trim()
    this.buf = ''
    if (remaining.length > 0) this.onFlush(remaining)
  }

  cancel(): void {
    this.cancelled = true
    this.buf = ''
  }

  reset(): void {
    this.cancelled = false
    this.buf = ''
  }
}
