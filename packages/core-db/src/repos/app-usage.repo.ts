import type { DbClient } from '../client'
import { appUsageSessions } from '../schema'
import { desc, lte, gte, and, eq } from 'drizzle-orm'

export type AppUsageBucket = 'ide' | 'browser' | 'explorer' | 'media' | 'productivity' | 'other'

export type AppUsageRow = {
  id: string
  startedAt: number
  endedAt?: number
  bucket: AppUsageBucket
  processName: string
  durationMs?: number
}

export type AppUsageRepo = ReturnType<typeof createAppUsageRepo>

export function createAppUsageRepo(db: DbClient) {
  function insert(row: Omit<AppUsageRow, 'durationMs'>): void {
    db.insert(appUsageSessions)
      .values({
        id: row.id,
        startedAt: new Date(row.startedAt),
        endedAt: row.endedAt ? new Date(row.endedAt) : null,
        bucket: row.bucket,
        processName: row.processName,
        durationMs: null,
      })
      .run()
  }

  function close(id: string, endedAt: Date): void {
    const row = db.select().from(appUsageSessions).where(eq(appUsageSessions.id, id)).get()
    if (!row) return
    const durationMs = endedAt.getTime() - row.startedAt.getTime()
    db.update(appUsageSessions)
      .set({ endedAt, durationMs })
      .where(eq(appUsageSessions.id, id))
      .run()
  }

  function list(
    opts: { after?: Date; before?: Date; limit?: number; offset?: number } = {},
  ): AppUsageRow[] {
    const conditions = []
    if (opts.after) conditions.push(gte(appUsageSessions.startedAt, opts.after))
    if (opts.before) conditions.push(lte(appUsageSessions.startedAt, opts.before))
    return db
      .select()
      .from(appUsageSessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(appUsageSessions.startedAt))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0)
      .all()
      .map(toRow)
  }

  function deleteOlderThan(before: Date): number {
    const result = db.delete(appUsageSessions).where(lte(appUsageSessions.startedAt, before)).run()
    return result.changes
  }

  return { insert, close, list, deleteOlderThan }
}

function toRow(r: typeof appUsageSessions.$inferSelect): AppUsageRow {
  const row: AppUsageRow = {
    id: r.id,
    startedAt: r.startedAt.getTime(),
    bucket: r.bucket,
    processName: r.processName,
  }
  if (r.endedAt !== null) row.endedAt = r.endedAt.getTime()
  if (r.durationMs !== null) row.durationMs = r.durationMs
  return row
}
