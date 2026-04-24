import { randomUUID } from 'crypto'
import type { EventsRepo } from '@auralith/core-db'

const IDLE_GAP_MS = 20 * 60 * 1000 // 20 min idle gap starts a new session
const RUN_INTERVAL_MS = 5 * 60 * 1000 // run every 5 min
const LOOKBACK_MS = 30 * 60 * 1000 // look back 30 min for unassigned events

export class SessionJob {
  private eventsRepo: EventsRepo
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(eventsRepo: EventsRepo) {
    this.eventsRepo = eventsRepo
  }

  start(): void {
    if (this.timer) return
    this.run()
    this.timer = setInterval(() => this.run(), RUN_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private run(): void {
    try {
      this.clusterUnassigned()
    } catch (err) {
      console.error('[session-job] error:', err)
    }
  }

  private clusterUnassigned(): void {
    const since = new Date(Date.now() - LOOKBACK_MS)
    const unassigned = this.eventsRepo.getUnassignedSince(since)
    if (unassigned.length === 0) return

    // Sort by ts ascending (should already be, but ensure)
    unassigned.sort((a, b) => a.ts - b.ts)

    // Group into sessions by idle gap
    type Group = { events: typeof unassigned; start: number; end: number }
    const groups: Group[] = []
    let current: Group | null = null

    for (const ev of unassigned) {
      if (!current) {
        current = { events: [ev], start: ev.ts, end: ev.ts }
      } else if (ev.ts - current.end > IDLE_GAP_MS) {
        groups.push(current)
        current = { events: [ev], start: ev.ts, end: ev.ts }
      } else {
        current.events.push(ev)
        current.end = ev.ts
      }
    }
    if (current) groups.push(current)

    for (const group of groups) {
      const sessionId = this.findOrCreateSession(group.start, group.end)
      const ids = group.events.map((e) => e.id)
      this.eventsRepo.assignSessionBatch(ids, sessionId)
    }
  }

  private findOrCreateSession(startTs: number, endTs: number): string {
    // Check for an open session that overlaps or is close to this group
    const open = this.eventsRepo.getOpenSession()
    if (open) {
      const openEndMs = open.startedAt.getTime() + 24 * 60 * 60 * 1000
      if (startTs <= openEndMs) {
        // Extend the open session
        this.eventsRepo.closeSession(open.id, new Date(endTs))
        return open.id
      } else {
        // Close the stale open session
        this.eventsRepo.closeSession(open.id, new Date(startTs - 1))
      }
    }
    const id = randomUUID()
    this.eventsRepo.createSession(id, new Date(startTs))
    this.eventsRepo.closeSession(id, new Date(endTs))
    return id
  }
}
