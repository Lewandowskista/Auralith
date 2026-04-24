import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { DbClient } from '../client'
import { settings } from '../schema/system'

export type SettingsRepo = ReturnType<typeof createSettingsRepo>

export function createSettingsRepo(db: DbClient) {
  function get<T>(key: string, schema: z.ZodType<T>): T | undefined {
    const row = db.select().from(settings).where(eq(settings.key, key)).get()
    if (!row) return undefined
    const parsed = schema.safeParse(JSON.parse(row.valueJson))
    return parsed.success ? parsed.data : undefined
  }

  function getOrDefault<T>(key: string, schema: z.ZodType<T>, defaultValue: T): T {
    return get(key, schema) ?? defaultValue
  }

  function set<T>(key: string, value: T): void {
    const now = Date.now()
    db.insert(settings)
      .values({ key, valueJson: JSON.stringify(value), updatedAt: new Date(now) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { valueJson: JSON.stringify(value), updatedAt: new Date(now) },
      })
      .run()
  }

  function getAll(): Record<string, unknown> {
    const rows = db.select().from(settings).all()
    return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.valueJson)]))
  }

  return { get, getOrDefault, set, getAll }
}
