import type { DbClient } from '../client'
import { events, sessions } from '../schema'
import { eq, and, gte, lte, desc, count, isNull } from 'drizzle-orm'
import type { ActivityEvent } from '@auralith/core-events'

export type EventRow = {
  id: string
  ts: number
  kind: string
  source: string
  path: string
  prevPath?: string
  spaceId?: string
  actor: string
  payloadJson: string
  sessionId?: string
}

export type SessionRow = {
  id: string
  startedAt: number
  endedAt?: number
  summary?: string
  eventCount: number
}

export type QueryEventsOpts = {
  after?: Date
  before?: Date
  kind?: string
  spaceId?: string
  path?: string
  sessionId?: string
  limit?: number
  offset?: number
}

export type ListSessionsOpts = {
  after?: Date
  before?: Date
  limit?: number
  offset?: number
}

export type EventsRepo = ReturnType<typeof createEventsRepo>

export function createEventsRepo(db: DbClient) {
  function writeEvent(ev: ActivityEvent): void {
    db.insert(events)
      .values({
        id: ev.id,
        ts: ev.ts,
        kind: ev.kind,
        source: ev.source,
        path: ev.path,
        prevPath: ev.prevPath ?? null,
        spaceId: ev.spaceId ?? null,
        actor: ev.actor,
        payloadJson: ev.payloadJson,
        sessionId: ev.sessionId ?? null,
      })
      .run()
  }

  function queryEvents(opts: QueryEventsOpts = {}): EventRow[] {
    const conditions = []
    if (opts.after) conditions.push(gte(events.ts, opts.after))
    if (opts.before) conditions.push(lte(events.ts, opts.before))
    if (opts.kind) conditions.push(eq(events.kind, opts.kind as typeof events.kind._.data))
    if (opts.spaceId) conditions.push(eq(events.spaceId, opts.spaceId))
    if (opts.sessionId) conditions.push(eq(events.sessionId, opts.sessionId))

    const rows = db
      .select()
      .from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(events.ts))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0)
      .all()

    return rows.map(toEventRow)
  }

  function countEvents(opts: QueryEventsOpts = {}): number {
    const conditions = []
    if (opts.after) conditions.push(gte(events.ts, opts.after))
    if (opts.before) conditions.push(lte(events.ts, opts.before))
    if (opts.kind) conditions.push(eq(events.kind, opts.kind as typeof events.kind._.data))
    if (opts.spaceId) conditions.push(eq(events.spaceId, opts.spaceId))
    if (opts.sessionId) conditions.push(eq(events.sessionId, opts.sessionId))

    const [row] = db
      .select({ n: count() })
      .from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .all()
    return row?.n ?? 0
  }

  function assignSession(eventId: string, sessionId: string): void {
    db.update(events).set({ sessionId }).where(eq(events.id, eventId)).run()
  }

  function getUnassignedSince(since: Date): EventRow[] {
    return db
      .select()
      .from(events)
      .where(and(isNull(events.sessionId), gte(events.ts, since)))
      .orderBy(events.ts)
      .all()
      .map(toEventRow)
  }

  function deleteOlderThan(before: Date): number {
    const result = db.delete(events).where(lte(events.ts, before)).run()
    return result.changes
  }

  // Sessions
  function createSession(id: string, startedAt: Date): void {
    db.insert(sessions).values({ id, startedAt, endedAt: null, summary: null }).run()
  }

  function closeSession(id: string, endedAt: Date, summary?: string): void {
    db.update(sessions)
      .set({ endedAt, ...(summary !== undefined ? { summary } : {}) })
      .where(eq(sessions.id, id))
      .run()
  }

  function getSession(id: string): SessionRow | undefined {
    const row = db.select().from(sessions).where(eq(sessions.id, id)).get()
    if (!row) return undefined
    const [cnt] = db.select({ n: count() }).from(events).where(eq(events.sessionId, id)).all()
    return toSessionRow(row, cnt?.n ?? 0)
  }

  function listSessions(opts: ListSessionsOpts = {}): SessionRow[] {
    const conditions = []
    if (opts.after) conditions.push(gte(sessions.startedAt, opts.after))
    if (opts.before) conditions.push(lte(sessions.startedAt, opts.before))

    const rows = db
      .select()
      .from(sessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sessions.startedAt))
      .limit(opts.limit ?? 20)
      .offset(opts.offset ?? 0)
      .all()

    return rows.map((r) => {
      const [cnt] = db.select({ n: count() }).from(events).where(eq(events.sessionId, r.id)).all()
      return toSessionRow(r, cnt?.n ?? 0)
    })
  }

  function countSessions(opts: ListSessionsOpts = {}): number {
    const conditions = []
    if (opts.after) conditions.push(gte(sessions.startedAt, opts.after))
    if (opts.before) conditions.push(lte(sessions.startedAt, opts.before))
    const [row] = db
      .select({ n: count() })
      .from(sessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .all()
    return row?.n ?? 0
  }

  function getLatestSession(): SessionRow | undefined {
    const row = db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(1).get()
    if (!row) return undefined
    const [cnt] = db.select({ n: count() }).from(events).where(eq(events.sessionId, row.id)).all()
    return toSessionRow(row, cnt?.n ?? 0)
  }

  function getLastEventTs(): Date | undefined {
    const row = db.select({ ts: events.ts }).from(events).orderBy(desc(events.ts)).limit(1).get()
    return row?.ts ?? undefined
  }

  function getOpenSession(): { id: string; startedAt: Date } | undefined {
    const row = db
      .select()
      .from(sessions)
      .where(isNull(sessions.endedAt))
      .orderBy(desc(sessions.startedAt))
      .limit(1)
      .get()
    if (!row) return undefined
    return { id: row.id, startedAt: row.startedAt }
  }

  // Count events without a session that are newer than a threshold
  function countUnassignedAfter(after: Date): number {
    const [row] = db
      .select({ n: count() })
      .from(events)
      .where(and(isNull(events.sessionId), gte(events.ts, after)))
      .all()
    return row?.n ?? 0
  }

  function assignSessionBatch(eventIds: string[], sessionId: string): void {
    if (eventIds.length === 0) return
    // Drizzle doesn't have IN update directly — use raw SQL
    for (const id of eventIds) {
      db.update(events).set({ sessionId }).where(eq(events.id, id)).run()
    }
  }

  // Cleanup orphan sessions (ended > N days ago, or never ended but > 24h old)
  function deleteOrphanSessions(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    db.delete(sessions)
      .where(and(isNull(sessions.endedAt), lte(sessions.startedAt, cutoff)))
      .run()
  }

  return {
    writeEvent,
    queryEvents,
    countEvents,
    assignSession,
    getUnassignedSince,
    deleteOlderThan,
    createSession,
    closeSession,
    getSession,
    listSessions,
    countSessions,
    getLatestSession,
    getLastEventTs,
    getOpenSession,
    countUnassignedAfter,
    assignSessionBatch,
    deleteOrphanSessions,
  }
}

function toEventRow(r: typeof events.$inferSelect): EventRow {
  const row: EventRow = {
    id: r.id,
    ts: r.ts.getTime(),
    kind: r.kind,
    source: r.source,
    path: r.path,
    actor: r.actor,
    payloadJson: r.payloadJson,
  }
  if (r.prevPath !== null) row.prevPath = r.prevPath
  if (r.spaceId !== null) row.spaceId = r.spaceId
  if (r.sessionId !== null) row.sessionId = r.sessionId
  return row
}

function toSessionRow(r: typeof sessions.$inferSelect, eventCount: number): SessionRow {
  const row: SessionRow = {
    id: r.id,
    startedAt: r.startedAt.getTime(),
    eventCount,
  }
  if (r.endedAt !== null) row.endedAt = r.endedAt.getTime()
  if (r.summary !== null) row.summary = r.summary
  return row
}
