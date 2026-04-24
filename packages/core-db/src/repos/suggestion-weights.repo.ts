import { eq } from 'drizzle-orm'
import type { DbClient } from '../client'
import { suggestionWeights } from '../schema/system'

export type SuggestionWeightRow = {
  kind: string
  weight: number
  sampleCount: number
  updatedAt: Date
}

export type SuggestionWeightsRepo = ReturnType<typeof createSuggestionWeightsRepo>

export function createSuggestionWeightsRepo(db: DbClient) {
  function getAll(): SuggestionWeightRow[] {
    return db
      .select()
      .from(suggestionWeights)
      .all()
      .map((r) => ({
        kind: r.kind,
        weight: r.weight,
        sampleCount: r.sampleCount,
        updatedAt: r.updatedAt,
      }))
  }

  function get(kind: string): SuggestionWeightRow | undefined {
    const row = db.select().from(suggestionWeights).where(eq(suggestionWeights.kind, kind)).get()
    return row
      ? {
          kind: row.kind,
          weight: row.weight,
          sampleCount: row.sampleCount,
          updatedAt: row.updatedAt,
        }
      : undefined
  }

  function upsert(kind: string, weight: number, sampleCount: number): void {
    const now = new Date()
    const existing = db
      .select({ kind: suggestionWeights.kind })
      .from(suggestionWeights)
      .where(eq(suggestionWeights.kind, kind))
      .get()
    if (existing) {
      db.update(suggestionWeights)
        .set({ weight, sampleCount, updatedAt: now })
        .where(eq(suggestionWeights.kind, kind))
        .run()
    } else {
      db.insert(suggestionWeights).values({ kind, weight, sampleCount, updatedAt: now }).run()
    }
  }

  function clear(): void {
    db.delete(suggestionWeights).run()
  }

  return { getAll, get, upsert, clear }
}
