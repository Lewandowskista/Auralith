import { eq } from 'drizzle-orm'
import type { DbClient } from '../client'
import { promptsCache } from '../schema/system'

export type PromptCacheRepo = ReturnType<typeof createPromptCacheRepo>

export function createPromptCacheRepo(db: DbClient) {
  function get(hash: string) {
    return db.select().from(promptsCache).where(eq(promptsCache.hash, hash)).get()
  }

  function set(row: {
    hash: string
    model: string
    prompt: string
    completion: string
    createdAt: Date
    ttl: number
  }): void {
    db.insert(promptsCache)
      .values(row)
      .onConflictDoUpdate({
        target: promptsCache.hash,
        set: {
          completion: row.completion,
          createdAt: row.createdAt,
          ttl: row.ttl,
        },
      })
      .run()
  }

  function evictExpired(): void {
    const now = new Date()
    // TTL is stored in ms; expires when createdAt + ttl < now.
    // Use raw comparison: created_at + ttl < now (both in ms)
    db.$client.prepare(
      `DELETE FROM prompts_cache WHERE (created_at + ttl) < ?`
    ).run(now.getTime())
  }

  return { get, set, evictExpired }
}
