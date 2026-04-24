import { desc, gte, lte, and, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DbClient } from '../client'
import { auditLog } from '../schema/system'

export type AuditEntry = {
  id: string
  ts: Date
  kind: string
  actor: string
  subject: string
  meta: Record<string, unknown>
}

export type AuditRepo = ReturnType<typeof createAuditRepo>

export function createAuditRepo(db: DbClient) {
  function write(entry: Omit<AuditEntry, 'id' | 'ts'>): void {
    db.insert(auditLog)
      .values({
        id: randomUUID(),
        ts: new Date(),
        kind: entry.kind,
        actor: entry.actor,
        subject: entry.subject,
        metaJson: JSON.stringify(entry.meta),
      })
      .run()
  }

  function query(opts: {
    after?: Date
    before?: Date
    kind?: string
    actor?: string
    limit?: number
    offset?: number
  }): AuditEntry[] {
    const conditions = []
    if (opts.after) conditions.push(gte(auditLog.ts, opts.after))
    if (opts.before) conditions.push(lte(auditLog.ts, opts.before))
    if (opts.kind) conditions.push(eq(auditLog.kind, opts.kind))
    if (opts.actor) conditions.push(eq(auditLog.actor, opts.actor))

    const rows = db
      .select()
      .from(auditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.ts))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0)
      .all()

    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      kind: r.kind,
      actor: r.actor,
      subject: r.subject,
      meta: JSON.parse(r.metaJson) as Record<string, unknown>,
    }))
  }

  function count(): number {
    const result = db.select().from(auditLog).all()
    return result.length
  }

  return { write, query, count }
}
