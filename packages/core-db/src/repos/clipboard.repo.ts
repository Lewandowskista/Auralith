import type { DbClient } from '../client'
import { clipboardHistory } from '../schema'
import { desc, lte, eq } from 'drizzle-orm'

export type ClipboardRow = {
  id: string
  ts: number
  kind: 'text' | 'image' | 'file'
  textValue?: string
  charCount?: number
  redacted: boolean
  sessionId?: string
}

export type ClipboardRepo = ReturnType<typeof createClipboardRepo>

export function createClipboardRepo(db: DbClient) {
  function insert(row: ClipboardRow): void {
    db.insert(clipboardHistory)
      .values({
        id: row.id,
        ts: new Date(row.ts),
        kind: row.kind,
        textValue: row.textValue ?? null,
        charCount: row.charCount ?? null,
        redacted: row.redacted,
        sessionId: row.sessionId ?? null,
      })
      .run()
  }

  function list(limit = 100, offset = 0): ClipboardRow[] {
    return db
      .select()
      .from(clipboardHistory)
      .orderBy(desc(clipboardHistory.ts))
      .limit(limit)
      .offset(offset)
      .all()
      .map(toRow)
  }

  function count(): number {
    const [row] = db.select({ n: clipboardHistory.id }).from(clipboardHistory).all()
    return row ? 1 : 0
  }

  function deleteById(id: string): void {
    db.delete(clipboardHistory).where(eq(clipboardHistory.id, id)).run()
  }

  function deleteOlderThan(before: Date): number {
    const result = db.delete(clipboardHistory).where(lte(clipboardHistory.ts, before)).run()
    return result.changes
  }

  function clear(): number {
    const result = db.delete(clipboardHistory).run()
    return result.changes
  }

  return { insert, list, count, deleteById, deleteOlderThan, clear }
}

function toRow(r: typeof clipboardHistory.$inferSelect): ClipboardRow {
  const row: ClipboardRow = {
    id: r.id,
    ts: r.ts.getTime(),
    kind: r.kind,
    redacted: Boolean(r.redacted),
  }
  if (r.textValue !== null) row.textValue = r.textValue
  if (r.charCount !== null) row.charCount = r.charCount
  if (r.sessionId !== null) row.sessionId = r.sessionId
  return row
}
