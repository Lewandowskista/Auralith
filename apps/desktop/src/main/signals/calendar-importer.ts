import { readFileSync } from 'fs'
import type { CalendarEventsRepo } from '@auralith/core-db'

type CalendarEvent = {
  title: string
  startAt: Date
  endAt: Date
  location?: string
  description?: string
}

// Minimal ICS parser — handles VEVENT blocks with DTSTART, DTEND, SUMMARY, LOCATION, DESCRIPTION
// Does not handle recurrence (RRULE) — single-instance events only for now
export function parseIcs(content: string): CalendarEvent[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const events: CalendarEvent[] = []

  let inEvent = false
  let current: Partial<CalendarEvent & { rawStart?: string; rawEnd?: string }> = {}

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      current = {}
      continue
    }

    if (line === 'END:VEVENT') {
      inEvent = false
      if (current.rawStart && current.rawEnd && current.title) {
        const startAt = parseIcsDate(current.rawStart)
        const endAt = parseIcsDate(current.rawEnd)
        if (startAt && endAt) {
          const ev: CalendarEvent = { title: current.title, startAt, endAt }
          if (current.location) ev.location = current.location
          if (current.description) ev.description = current.description
          events.push(ev)
        }
      }
      continue
    }

    if (!inEvent) continue

    // Handle folded lines (continuation lines begin with space/tab)
    const [key, ...rest] = line.split(':')
    if (!key) continue
    const value = rest.join(':').trim()

    const prop = key.split(';')[0]?.toUpperCase()

    switch (prop) {
      case 'SUMMARY':
        current.title = unescapeIcs(value)
        break
      case 'DTSTART':
        current.rawStart = value
        break
      case 'DTEND':
        current.rawEnd = value
        break
      case 'LOCATION':
        current.location = unescapeIcs(value)
        break
      case 'DESCRIPTION':
        current.description = unescapeIcs(value)
        break
    }
  }

  return events
}

function parseIcsDate(raw: string): Date | null {
  // Formats: 20240415T090000Z (UTC), 20240415T090000 (local), 20240415 (date only)
  const cleaned = raw.replace(/TZID=[^:]+:/, '')
  const d = cleaned.replace(/[^\dTZ]/g, '')

  if (d.length === 8) {
    // Date-only: YYYYMMDD — treat as midnight local
    const y = d.slice(0, 4)
    const m = d.slice(4, 6)
    const day = d.slice(6, 8)
    return new Date(`${y}-${m}-${day}T00:00:00`)
  }

  if (d.length >= 15) {
    // DateTime: YYYYMMDDTHHmmss[Z]
    const y = d.slice(0, 4)
    const mo = d.slice(4, 6)
    const dy = d.slice(6, 8)
    const h = d.slice(9, 11)
    const mn = d.slice(11, 13)
    const sec = d.slice(13, 15)
    const utc = d.endsWith('Z') ? 'Z' : ''
    return new Date(`${y}-${mo}-${dy}T${h}:${mn}:${sec}${utc}`)
  }

  return null
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

export class CalendarIcsImporter {
  private filePath: string | null = null
  private pollHandle: ReturnType<typeof setInterval> | null = null
  private readonly repo: CalendarEventsRepo

  constructor(repo: CalendarEventsRepo) {
    this.repo = repo
  }

  setFilePath(path: string): void {
    this.filePath = path
  }

  getFilePath(): string | null {
    return this.filePath
  }

  // Returns number of events imported (after clearing old ones)
  importNow(): number {
    if (!this.filePath) return 0
    try {
      const content = readFileSync(this.filePath, 'utf8')
      const events = parseIcs(content)

      // Replace all calendar events — simple full-replace on import
      this.repo.clear()
      if (events.length > 0) {
        this.repo.upsert(events)
      }
      return events.length
    } catch (err) {
      console.error('[calendar-importer] import error:', err)
      return 0
    }
  }

  startPolling(intervalMs = 15 * 60 * 1000): void {
    this.stopPolling()
    this.pollHandle = setInterval(() => {
      this.importNow()
    }, intervalMs)
  }

  stopPolling(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
  }

  // Provider function for the suggestion engine
  getNextEvent(withinMs: number): { title: string; startAt: Date; location?: string } | null {
    const now = new Date()
    const horizon = new Date(now.getTime() + withinMs)
    const event = this.repo.getNextEvent(now)
    if (!event) return null
    if (event.startAt > horizon) return null
    if (event.startAt < now) return null // event already started
    const result: { title: string; startAt: Date; location?: string } = {
      title: event.title,
      startAt: event.startAt,
    }
    if (event.location !== undefined) result.location = event.location
    return result
  }
}
