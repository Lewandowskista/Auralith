import { desc, gte, lt } from 'drizzle-orm'
import type { DbClient } from '../client'
import { crashStats } from '../schema/system'
import { randomUUID } from 'crypto'

export type CrashStatLevel = 'crash' | 'error'

export type CrashStatRow = {
  id: string
  ts: Date
  level: CrashStatLevel
  module: string
  message: string
}

export type CrashStatSummary = {
  module: string
  crashCount: number
  errorCount: number
  lastTs: Date
}

export type CrashStatsRepo = ReturnType<typeof createCrashStatsRepo>

export function createCrashStatsRepo(db: DbClient) {
  return {
    record(level: CrashStatLevel, module: string, message: string): void {
      db.insert(crashStats)
        .values({
          id: randomUUID(),
          ts: new Date(),
          level,
          module,
          message: message.slice(0, 500),
        })
        .run()
    },

    // Returns per-module summary for the last 30 days, sorted by most recent
    getSummary(): CrashStatSummary[] {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const rows = db
        .select()
        .from(crashStats)
        .where(gte(crashStats.ts, since))
        .orderBy(desc(crashStats.ts))
        .all()

      const map = new Map<string, CrashStatSummary>()
      for (const row of rows) {
        let entry = map.get(row.module)
        if (!entry) {
          entry = { module: row.module, crashCount: 0, errorCount: 0, lastTs: row.ts }
          map.set(row.module, entry)
        }
        if (row.level === 'crash') entry.crashCount++
        else entry.errorCount++
        if (row.ts > entry.lastTs) entry.lastTs = row.ts
      }

      return Array.from(map.values()).sort((a, b) => b.lastTs.getTime() - a.lastTs.getTime())
    },

    getTotalCount(): { crashes: number; errors: number } {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const rows = db.select().from(crashStats).where(gte(crashStats.ts, since)).all()

      let crashes = 0
      let errors = 0
      for (const r of rows) {
        if (r.level === 'crash') crashes++
        else errors++
      }
      return { crashes, errors }
    },

    // Prune entries older than 30 days
    purgeStale(): number {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const result = db.delete(crashStats).where(lt(crashStats.ts, cutoff)).run()
      return result.changes
    },

    clear(): void {
      db.delete(crashStats).run()
    },
  }
}
