import { eq, gte, and, lte } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DbClient } from '../client'
import { calendarEvents } from '../schema/system'

export type CalendarEventRow = {
  id: string
  startAt: Date
  endAt: Date
  title: string
  location?: string
  description?: string
}

export type CalendarEventsRepo = ReturnType<typeof createCalendarEventsRepo>

function toRow(r: typeof calendarEvents.$inferSelect): CalendarEventRow {
  const row: CalendarEventRow = {
    id: r.id,
    startAt: r.startAt,
    endAt: r.endAt,
    title: r.title,
  }
  if (r.location !== null && r.location !== undefined) row.location = r.location
  if (r.description !== null && r.description !== undefined) row.description = r.description
  return row
}

export function createCalendarEventsRepo(db: DbClient) {
  function upsert(events: Omit<CalendarEventRow, 'id'>[]): number {
    let inserted = 0
    const now = new Date()
    for (const ev of events) {
      const id = randomUUID()
      void now
      db.insert(calendarEvents)
        .values({
          id,
          startAt: ev.startAt,
          endAt: ev.endAt,
          title: ev.title,
          location: ev.location ?? null,
          description: ev.description ?? null,
        })
        .run()
      inserted++
    }
    return inserted
  }

  function listUpcoming(from: Date, to: Date): CalendarEventRow[] {
    return db
      .select()
      .from(calendarEvents)
      .where(and(gte(calendarEvents.startAt, from), lte(calendarEvents.startAt, to)))
      .all()
      .map(toRow)
  }

  function getNextEvent(after: Date): CalendarEventRow | undefined {
    const rows = db.select().from(calendarEvents).where(gte(calendarEvents.startAt, after)).all()
    const sorted = rows.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    const first = sorted[0]
    return first ? toRow(first) : undefined
  }

  function clear(): void {
    db.delete(calendarEvents).run()
  }

  function deleteById(id: string): void {
    db.delete(calendarEvents).where(eq(calendarEvents.id, id)).run()
  }

  return { upsert, listUpcoming, getNextEvent, clear, deleteById }
}
