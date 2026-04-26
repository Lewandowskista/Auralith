import { desc, eq, and, lt, isNotNull } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DbClient } from '../client'
import { suggestions } from '../schema/system'

export type SuggestionStatus = 'open' | 'accepted' | 'dismissed' | 'snoozed' | 'expired'
export type PermissionTier = 'safe' | 'confirm' | 'restricted'

export type SuggestionRow = {
  id: string
  kind: string
  title: string
  rationale: string
  proposedActionJson: string
  tier: PermissionTier
  status: SuggestionStatus
  createdAt: Date
  decidedAt?: Date
  expiresAt?: Date
}

export type CreateSuggestionOpts = {
  kind: string
  title: string
  rationale: string
  proposedActionJson: string
  tier: PermissionTier
  expiresAt?: Date
}

export type SuggestionsRepo = ReturnType<typeof createSuggestionsRepo>

function toRow(r: typeof suggestions.$inferSelect): SuggestionRow {
  const row: SuggestionRow = {
    id: r.id,
    kind: r.kind,
    title: r.title,
    rationale: r.rationale,
    proposedActionJson: r.proposedActionJson,
    tier: r.tier as PermissionTier,
    status: r.status as SuggestionStatus,
    createdAt: r.createdAt,
  }
  if (r.decidedAt !== null) row.decidedAt = r.decidedAt
  if (r.expiresAt !== null) row.expiresAt = r.expiresAt
  return row
}

export function createSuggestionsRepo(db: DbClient) {
  function create(opts: CreateSuggestionOpts): SuggestionRow {
    const id = randomUUID()
    const now = new Date()
    const values: typeof suggestions.$inferInsert = {
      id,
      kind: opts.kind,
      title: opts.title,
      rationale: opts.rationale,
      proposedActionJson: opts.proposedActionJson,
      tier: opts.tier,
      status: 'open',
      createdAt: now,
    }
    if (opts.expiresAt !== undefined) values.expiresAt = opts.expiresAt
    db.insert(suggestions).values(values).run()
    const created = get(id)
    if (!created) throw new Error(`Suggestion ${id} not found after insert`)
    return created
  }

  function get(id: string): SuggestionRow | undefined {
    const row = db.select().from(suggestions).where(eq(suggestions.id, id)).get()
    return row ? toRow(row) : undefined
  }

  function list(opts: { status?: SuggestionStatus; limit?: number } = {}): SuggestionRow[] {
    const conds = []
    if (opts.status !== undefined) conds.push(eq(suggestions.status, opts.status))
    const rows = db
      .select()
      .from(suggestions)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(suggestions.createdAt))
      .limit(opts.limit ?? 50)
      .all()
    return rows.map(toRow)
  }

  function listOpen(limit = 20): SuggestionRow[] {
    return list({ status: 'open', limit })
  }

  function countByKind(kind: string, since: Date): number {
    const rows = db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.kind, kind), eq(suggestions.status, 'open')))
      .all()
    return rows.filter((r) => r.createdAt >= since).length
  }

  function hasOpenOfKind(kind: string): boolean {
    const row = db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.kind, kind), eq(suggestions.status, 'open')))
      .get()
    return row !== undefined
  }

  function setStatus(id: string, status: SuggestionStatus, snoozedUntil?: Date): void {
    const now = new Date()
    const updates: Partial<typeof suggestions.$inferInsert> = {
      status,
      decidedAt: now,
    }
    if (snoozedUntil !== undefined) updates.expiresAt = snoozedUntil
    db.update(suggestions).set(updates).where(eq(suggestions.id, id)).run()
  }

  function accept(id: string): void {
    setStatus(id, 'accepted')
  }

  function dismiss(id: string): void {
    setStatus(id, 'dismissed')
  }

  function snooze(id: string, until: Date): void {
    setStatus(id, 'snoozed', until)
  }

  function expireStale(): number {
    const now = new Date()
    // Single bulk UPDATE for open suggestions whose expiresAt has passed
    const expireResult = db
      .update(suggestions)
      .set({ status: 'expired', decidedAt: now })
      .where(and(eq(suggestions.status, 'open'), isNotNull(suggestions.expiresAt), lt(suggestions.expiresAt, now)))
      .run()
    // Single bulk UPDATE to wake snoozed suggestions whose snooze has expired
    db.update(suggestions)
      .set({ status: 'open', decidedAt: null, expiresAt: null })
      .where(and(eq(suggestions.status, 'snoozed'), isNotNull(suggestions.expiresAt), lt(suggestions.expiresAt, now)))
      .run()
    return expireResult.changes
  }

  return {
    create,
    get,
    list,
    listOpen,
    countByKind,
    hasOpenOfKind,
    accept,
    dismiss,
    snooze,
    expireStale,
  }
}
