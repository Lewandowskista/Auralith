import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { registerHandler } from '../router'
import {
  createRoutinesRepo,
  createAuditRepo,
  createEventsRepo,
  type DbBundle,
} from '@auralith/core-db'
import { RoutineEngine, runDryRun } from '@auralith/core-routines'
import { makeExecutorDeps } from '../../tools/confirmation'
import {
  RoutinesListParamsSchema,
  RoutinesGetParamsSchema,
  RoutinesCreateParamsSchema,
  RoutinesUpdateParamsSchema,
  RoutinesDeleteParamsSchema,
  RoutinesEnableParamsSchema,
  RoutinesDisableParamsSchema,
  RoutinesDryRunParamsSchema,
  RoutinesRunParamsSchema,
  RoutinesHistoryParamsSchema,
  type Routine,
  type RoutineRun,
} from '@auralith/core-domain'
import type Database from 'better-sqlite3'

let _bundle: DbBundle | null = null
let _engine: RoutineEngine | null = null
let _sqlite: Database.Database | null = null

export function initRoutinesDeps(bundle: DbBundle, sqlite?: Database.Database): void {
  _bundle = bundle
  if (sqlite) _sqlite = sqlite
}

export function getRoutineEngine(): RoutineEngine | null {
  return _engine
}

function getBundle(): DbBundle {
  if (!_bundle) throw new Error('Routines deps not initialized')
  return _bundle
}

function rowToRoutine(r: ReturnType<ReturnType<typeof createRoutinesRepo>['get']>): Routine {
  if (!r) throw new Error('Routine not found')
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    trigger: JSON.parse(r.triggerJson) as Routine['trigger'],
    conditions: JSON.parse(r.conditionsJson) as Routine['conditions'],
    action: JSON.parse(r.actionJson) as Routine['action'],
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
    runCount: r.runCount,
    ...(r.lastRunAt !== undefined ? { lastRunAt: r.lastRunAt.getTime() } : {}),
    ...(r.lastStatus !== undefined ? { lastStatus: r.lastStatus } : {}),
  }
}

function runToDto(
  r: ReturnType<ReturnType<typeof createRoutinesRepo>['listRuns']>[number],
): RoutineRun {
  return {
    id: r.id,
    routineId: r.routineId,
    ts: r.ts.getTime(),
    outcome: r.outcome,
    ...(r.traceId !== undefined ? { traceId: r.traceId } : {}),
    ...(r.metaJson !== undefined
      ? { meta: JSON.parse(r.metaJson) as Record<string, unknown> }
      : {}),
  }
}

export function setupRoutineEngine(bundle: DbBundle): RoutineEngine {
  const routinesRepo = createRoutinesRepo(bundle.db)
  const auditRepo = createAuditRepo(bundle.db)
  const executorDeps = makeExecutorDeps(auditRepo)

  _engine = new RoutineEngine({ routinesRepo, auditRepo, executorDeps })
  _engine.start()
  return _engine
}

export function registerRoutinesHandlers(): void {
  registerHandler('routines.list', async (params) => {
    const { includeDisabled } = RoutinesListParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createRoutinesRepo(db)
    const rows = includeDisabled ? repo.listAll() : repo.list({ includeDisabled: false })
    return { routines: rows.map(rowToRoutine) }
  })

  registerHandler('routines.get', async (params) => {
    const { id } = RoutinesGetParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createRoutinesRepo(db)
    const row = repo.get(id)
    if (!row) throw Object.assign(new Error('Routine not found'), { code: 'NOT_FOUND' })
    return { routine: rowToRoutine(row) }
  })

  registerHandler('routines.create', async (params) => {
    const p = RoutinesCreateParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createRoutinesRepo(db)
    const row = repo.create({
      name: p.name,
      triggerJson: JSON.stringify(p.trigger),
      conditionsJson: JSON.stringify(p.conditions),
      actionJson: JSON.stringify(p.action),
    })
    return { routine: rowToRoutine(row) }
  })

  registerHandler('routines.update', async (params) => {
    const { id, ...rest } = RoutinesUpdateParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createRoutinesRepo(db)
    if (!repo.get(id)) throw Object.assign(new Error('Routine not found'), { code: 'NOT_FOUND' })
    const updateOpts: Parameters<typeof repo.update>[1] = {}
    if (rest.name !== undefined) updateOpts.name = rest.name
    if (rest.trigger !== undefined) updateOpts.triggerJson = JSON.stringify(rest.trigger)
    if (rest.conditions !== undefined) updateOpts.conditionsJson = JSON.stringify(rest.conditions)
    if (rest.action !== undefined) updateOpts.actionJson = JSON.stringify(rest.action)
    const row = repo.update(id, updateOpts)
    return { routine: rowToRoutine(row) }
  })

  registerHandler('routines.delete', async (params) => {
    const { id } = RoutinesDeleteParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createRoutinesRepo(db)
    repo.remove(id)
    return { ok: true }
  })

  registerHandler('routines.enable', async (params) => {
    const { id } = RoutinesEnableParamsSchema.parse(params)
    const { db } = getBundle()
    createRoutinesRepo(db).enable(id)
    return { ok: true }
  })

  registerHandler('routines.disable', async (params) => {
    const { id } = RoutinesDisableParamsSchema.parse(params)
    const { db } = getBundle()
    createRoutinesRepo(db).disable(id)
    return { ok: true }
  })

  registerHandler('routines.dryRun', async (params) => {
    const { id, lookbackHours } = RoutinesDryRunParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createRoutinesRepo(db)
    const routine = repo.get(id)
    if (!routine) throw Object.assign(new Error('Routine not found'), { code: 'NOT_FOUND' })

    const eventsRepo = createEventsRepo(db)
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)
    const events = eventsRepo.queryEvents({ after: since, limit: 5000 })
    const history = events.map((e) => ({ ts: new Date(e.ts), kind: e.kind ?? 'unknown' }))

    const result = runDryRun(routine, history, lookbackHours)
    return result
  })

  registerHandler('routines.run', async (params) => {
    const { id } = RoutinesRunParamsSchema.parse(params)
    const engine = _engine
    if (!engine) throw new Error('Routine engine not initialized')
    const result = await engine.forceRun(id)
    return result
  })

  registerHandler('routines.history', async (params) => {
    const { id, limit } = RoutinesHistoryParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createRoutinesRepo(db)
    const runs = repo.listRuns(id, limit)
    return { runs: runs.map(runToDto) }
  })

  registerHandler('routines.listExamples', async () => {
    const resourcesPath = app.isPackaged
      ? join(process.resourcesPath, 'routines', 'examples', 'marketplace.json')
      : join(app.getAppPath(), 'resources/routines/examples/marketplace.json')

    if (!existsSync(resourcesPath)) return { examples: [] }

    try {
      const raw = readFileSync(resourcesPath, 'utf8')
      const examples = JSON.parse(raw) as unknown[]
      return { examples }
    } catch {
      return { examples: [] }
    }
  })

  registerHandler('routines.installExample', async (params) => {
    const { exampleId } = params as { exampleId: string }
    if (typeof exampleId !== 'string') throw new Error('exampleId required')

    const resourcesPath = app.isPackaged
      ? join(process.resourcesPath, 'routines', 'examples', 'marketplace.json')
      : join(app.getAppPath(), 'resources/routines/examples/marketplace.json')

    if (!existsSync(resourcesPath)) throw new Error('Marketplace file not found')

    const raw = readFileSync(resourcesPath, 'utf8')
    type ExampleRoutine = {
      id: string
      name: string
      trigger: unknown
      conditions: unknown[]
      actions: unknown[]
    }
    const examples = JSON.parse(raw) as ExampleRoutine[]
    const ex = examples.find((e) => e.id === exampleId)
    if (!ex) throw new Error(`Example ${exampleId} not found`)

    const { db } = getBundle()
    const repo = createRoutinesRepo(db)

    const actionsJson = JSON.stringify(ex.actions)
    // Use first action as legacy actionJson for compat
    const firstAction = (ex.actions[0] ?? { toolId: 'shell.run', params: {} }) as {
      toolId: string
      params: Record<string, unknown>
    }

    const row = repo.create({
      name: ex.name,
      triggerJson: JSON.stringify(ex.trigger),
      conditionsJson: JSON.stringify(ex.conditions),
      actionJson: JSON.stringify({ toolId: firstAction.toolId, params: firstAction.params }),
    })

    // Store full actions array via raw sqlite
    try {
      _sqlite?.prepare(`UPDATE routines SET actions_json = ? WHERE id = ?`).run(actionsJson, row.id)
    } catch {
      /* non-fatal */
    }

    return { routine: rowToRoutine(row) }
  })
}
