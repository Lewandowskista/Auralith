import { clipboard } from 'electron'
import { randomUUID } from 'crypto'
import type { ClipboardRepo } from '@auralith/core-db'

const POLL_INTERVAL_MS = 1_500
const MAX_TEXT_LENGTH = 10_000

// Built-in redaction patterns — matched before storing
const REDACT_PATTERNS: RegExp[] = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/i, // email
  /\b(?:\d[ -]?){13,16}\b/, // credit card-ish
  /\bghp_[A-Za-z0-9]{36}\b/, // GitHub PAT
  /\bsk-[A-Za-z0-9]{32,}\b/, // OpenAI-style key
  /password\s*[:=]\s*\S+/i, // password= lines
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i, // Bearer tokens
]

function shouldRedact(text: string, extraPatterns: RegExp[]): boolean {
  const patterns = [...REDACT_PATTERNS, ...extraPatterns]
  return patterns.some((p) => p.test(text))
}

export type ClipboardWatcherOptions = {
  repo: ClipboardRepo
  enabled?: boolean
  redactSensitive?: boolean
  extraRedactPatterns?: string[]
}

export class ClipboardWatcher {
  private enabled = false
  private redactSensitive = true
  private extraPatterns: RegExp[] = []
  private repo: ClipboardRepo
  private pollHandle: ReturnType<typeof setInterval> | null = null
  private lastText = ''

  constructor(opts: ClipboardWatcherOptions) {
    this.repo = opts.repo
    this.enabled = opts.enabled ?? false
    this.redactSensitive = opts.redactSensitive ?? true
    this.extraPatterns = (opts.extraRedactPatterns ?? []).map((p) => new RegExp(p, 'i'))
    if (this.enabled) {
      this.lastText = clipboard.readText()
      this.pollHandle = setInterval(() => this.poll(), POLL_INTERVAL_MS)
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (enabled && !this.pollHandle) {
      this.lastText = clipboard.readText()
      this.pollHandle = setInterval(() => this.poll(), POLL_INTERVAL_MS)
    } else if (!enabled && this.pollHandle !== null) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
  }

  setRedactSensitive(v: boolean): void {
    this.redactSensitive = v
  }

  setExtraRedactPatterns(patterns: string[]): void {
    this.extraPatterns = patterns
      .map((p) => {
        try {
          return new RegExp(p, 'i')
        } catch {
          return null
        }
      })
      .filter(Boolean) as RegExp[]
  }

  isEnabled(): boolean {
    return this.enabled
  }

  private poll(): void {
    if (!this.enabled) return
    try {
      const text = clipboard.readText()
      if (!text || text === this.lastText) return
      this.lastText = text

      const trimmed = text.slice(0, MAX_TEXT_LENGTH)
      const redacted = this.redactSensitive && shouldRedact(trimmed, this.extraPatterns)

      const entry: Parameters<typeof this.repo.insert>[0] = {
        id: randomUUID(),
        ts: Date.now(),
        kind: 'text',
        charCount: trimmed.length,
        redacted,
      }
      if (!redacted) entry.textValue = trimmed
      this.repo.insert(entry)
    } catch {
      // Clipboard can throw on some platforms when empty or locked — ignore
    }
  }

  dispose(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
  }
}
