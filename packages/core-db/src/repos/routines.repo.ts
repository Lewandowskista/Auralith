import { desc, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DbClient } from '../client'
import { routines, routineRuns } from '../schema/routines'

export type RoutineStatus = 'success' | 'failure' | 'blocked' | 'skipped'

export type RoutineRow = {
  id: string
  name: string
  enabled: boolean
  triggerJson: string
  conditionsJson: string
  actionJson: string
  createdAt: Date
  updatedAt: Date
  lastRunAt?: Date
  lastStatus?: RoutineStatus
  runCount: number
}

export type RoutineRunRow = {
  id: string
  routineId: string
  ts: Date
  outcome: RoutineStatus
  traceId?: string
  metaJson?: string
}

export type CreateRoutineOpts = {
  name: string
  triggerJson: string
  conditionsJson?: string
  actionJson: string
}

export type UpdateRoutineOpts = {
  name?: string
  triggerJson?: string
  conditionsJson?: string
  actionJson?: string
  enabled?: boolean
}

export type RoutinesRepo = ReturnType<typeof createRoutinesRepo>

function toRow(r: typeof routines.$inferSelect): RoutineRow {
  return {
    id: r.id,
    name: r.name,
    enabled: Boolean(r.enabled),
    triggerJson: r.triggerJson,
    conditionsJson: r.conditionsJson,
    actionJson: r.actionJson,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(r.lastRunAt != null ? { lastRunAt: r.lastRunAt } : {}),
    ...(r.lastStatus != null ? { lastStatus: r.lastStatus as RoutineStatus } : {}),
    runCount: r.runCount,
  }
}

function toRunRow(r: typeof routineRuns.$inferSelect): RoutineRunRow {
  return {
    id: r.id,
    routineId: r.routineId,
    ts: r.ts,
    outcome: r.outcome as RoutineStatus,
    ...(r.traceId != null ? { traceId: r.traceId } : {}),
    ...(r.metaJson != null ? { metaJson: r.metaJson } : {}),
  }
}

export function createRoutinesRepo(db: DbClient) {
  function list(opts: { includeDisabled?: boolean } = {}): RoutineRow[] {
    const rows = opts.includeDisabled
      ? db.select().from(routines).orderBy(desc(routines.createdAt)).all()
      : db
          .select()
          .from(routines)
          .where(eq(routines.enabled, true))
          .orderBy(desc(routines.createdAt))
          .all()
    return rows.map(toRow)
  }

  function listAll(): RoutineRow[] {
    return db.select().from(routines).orderBy(desc(routines.createdAt)).all().map(toRow)
  }

  function get(id: string): RoutineRow | undefined {
    const row = db.select().from(routines).where(eq(routines.id, id)).get()
    return row ? toRow(row) : undefined
  }

  function create(opts: CreateRoutineOpts): RoutineRow {
    const id = randomUUID()
    const now = new Date()
    db.insert(routines)
      .values({
        id,
        name: opts.name,
        enabled: true,
        triggerJson: opts.triggerJson,
        conditionsJson: opts.conditionsJson ?? '[]',
        actionJson: opts.actionJson,
        createdAt: now,
        updatedAt: now,
        runCount: 0,
      })
      .run()
    const created = get(id)
    if (!created) throw new Error(`Routine ${id} not found after insert`)
    return created
  }

  function update(id: string, opts: UpdateRoutineOpts): RoutineRow {
    const now = new Date()
    const values: Partial<typeof routines.$inferInsert> = { updatedAt: now }
    if (opts.name !== undefined) values.name = opts.name
    if (opts.triggerJson !== undefined) values.triggerJson = opts.triggerJson
    if (opts.conditionsJson !== undefined) values.conditionsJson = opts.conditionsJson
    if (opts.actionJson !== undefined) values.actionJson = opts.actionJson
    if (opts.enabled !== undefined) values.enabled = opts.enabled
    db.update(routines).set(values).where(eq(routines.id, id)).run()
    const updated = get(id)
    if (!updated) throw new Error(`Routine ${id} not found after update`)
    return updated
  }

  function remove(id: string): void {
    db.delete(routines).where(eq(routines.id, id)).run()
  }

  function enable(id: string): void {
    db.update(routines)
      .set({ enabled: true, updatedAt: new Date() })
      .where(eq(routines.id, id))
      .run()
  }

  function disable(id: string): void {
    db.update(routines)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(routines.id, id))
      .run()
  }

  function recordRun(opts: {
    routineId: string
    outcome: RoutineStatus
    traceId?: string
    meta?: unknown
  }): void {
    const now = new Date()
    db.insert(routineRuns)
      .values({
        id: randomUUID(),
        routineId: opts.routineId,
        ts: now,
        outcome: opts.outcome,
        traceId: opts.traceId ?? null,
        metaJson: opts.meta !== undefined ? JSON.stringify(opts.meta) : null,
      })
      .run()
    db.update(routines)
      .set({
        lastRunAt: now,
        lastStatus: opts.outcome,
        runCount:
          (db.select().from(routines).where(eq(routines.id, opts.routineId)).get()?.runCount ?? 0) +
          1,
        updatedAt: now,
      })
      .where(eq(routines.id, opts.routineId))
      .run()
  }

  function listRuns(routineId: string, limit = 50): RoutineRunRow[] {
    return db
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.routineId, routineId))
      .orderBy(desc(routineRuns.ts))
      .limit(limit)
      .all()
      .map(toRunRow)
  }

  function countRunsInWindow(routineId: string, since: Date): number {
    const rows = db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId)).all()
    return rows.filter((r) => r.ts >= since).length
  }

  return {
    list,
    listAll,
    get,
    create,
    update,
    remove,
    enable,
    disable,
    recordRun,
    listRuns,
    countRunsInWindow,
  }
}
