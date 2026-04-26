// Buffers LLM tokens and flushes complete sentences/clauses to TTS.
// Flush triggers:
//   - terminal punctuation [.!?] followed by space or newline
//   - clause break [,;:—] after >= 40 chars buffered
//   - >= 120 chars without any break (hard cap)
//   - single newline (model greeting/ack prefix)

const CLAUSE_BREAK_RE = /[,;:—]/
const CLAUSE_MIN_LEN = 40
const HARD_CAP = 120

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
    const sentenceMatch = this.buf.match(/^(.*[.!?])\s/)
    if (sentenceMatch && sentenceMatch[1]) {
      const chunk = sentenceMatch[1].trim()
      this.buf = this.buf.slice(sentenceMatch[0].length)
      if (chunk.length > 0) this.onFlush(chunk)
      return
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
