import { eq, lt, asc } from 'drizzle-orm'
import type { DbClient } from '../client'
import { suggestionPauses } from '../schema/system'

export type SuggestionPauseRow = {
  kind: string
  pausedUntil: Date
  reason: string
}

export type SuggestionPausesRepo = ReturnType<typeof createSuggestionPausesRepo>

export function createSuggestionPausesRepo(db: DbClient) {
  function getAll(): SuggestionPauseRow[] {
    return db
      .select()
      .from(suggestionPauses)
      .all()
      .map((r) => ({
        kind: r.kind,
        pausedUntil: r.pausedUntil,
        reason: r.reason,
      }))
  }

  function isKindPaused(kind: string, now: Date): boolean {
    const row = db.select().from(suggestionPauses).where(eq(suggestionPauses.kind, kind)).get()
    if (!row) return false
    if (row.pausedUntil <= now) {
      // Expired pause — clean it up
      db.delete(suggestionPauses).where(eq(suggestionPauses.kind, kind)).run()
      return false
    }
    return true
  }

  function pause(kind: string, until: Date, reason = 'consecutive_dismissals'): void {
    const existing = db
      .select({ kind: suggestionPauses.kind })
      .from(suggestionPauses)
      .where(eq(suggestionPauses.kind, kind))
      .get()
    if (existing) {
      db.update(suggestionPauses)
        .set({ pausedUntil: until, reason })
        .where(eq(suggestionPauses.kind, kind))
        .run()
    } else {
      db.insert(suggestionPauses).values({ kind, pausedUntil: until, reason }).run()
    }
  }

  function resume(kind: string): void {
    db.delete(suggestionPauses).where(eq(suggestionPauses.kind, kind)).run()
  }

  function expireStale(now: Date): void {
    db.delete(suggestionPauses).where(lt(suggestionPauses.pausedUntil, now)).run()
  }

  function liftOldest(): void {
    // Remove the pause whose pausedUntil is earliest (i.e. was added first)
    const oldest = db
      .select({ kind: suggestionPauses.kind })
      .from(suggestionPauses)
      .orderBy(asc(suggestionPauses.pausedUntil))
      .limit(1)
      .get()
    if (oldest) {
      db.delete(suggestionPauses).where(eq(suggestionPauses.kind, oldest.kind)).run()
    }
  }

  function clear(): void {
    db.delete(suggestionPauses).run()
  }

  return { getAll, isKindPaused, pause, resume, expireStale, liftOldest, clear }
}
