import type { PromptCacheStore } from './runtime'

export type PromptCacheRow = {
  hash: string
  model: string
  prompt: string
  completion: string
  createdAt: Date
  ttl: number
}

export type PromptCacheDb = {
  get(hash: string): PromptCacheRow | undefined
  set(row: PromptCacheRow): void
  evictExpired(): void
}

/**
 * Creates a PromptCacheStore backed by any PromptCacheDb implementation.
 * The DB adapter is injected so core-ai stays decoupled from core-db.
 */
export function createPromptCache(db: PromptCacheDb): PromptCacheStore {
  return {
    get(hash: string): string | undefined {
      const row = db.get(hash)
      if (!row) return undefined
      const expiresAt = row.createdAt.getTime() + row.ttl
      if (Date.now() > expiresAt) return undefined
      return row.completion
    },
    set(hash: string, model: string, prompt: string, completion: string, ttlMs: number): void {
      db.set({ hash, model, prompt, completion, createdAt: new Date(), ttl: ttlMs })
    },
    evict(): void {
      db.evictExpired()
    },
  }
}
