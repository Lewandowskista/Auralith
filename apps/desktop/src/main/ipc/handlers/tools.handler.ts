import { registerHandler } from '../router'
import { listToolsForModel, executeTool } from '@auralith/core-tools'
import { makeExecutorDeps } from '../../tools/confirmation'
import { createAuditRepo, createSettingsRepo, type DbBundle } from '@auralith/core-db'
import { getSandboxRoots, initSandboxRoots, getDefaultSandboxRoots } from '../../tools/sandbox'
import { z } from 'zod'
import { randomUUID } from 'crypto'

let _bundle: DbBundle | null = null

export function initToolsDeps(bundle: DbBundle): void {
  _bundle = bundle
}

function getBundle(): DbBundle {
  if (!_bundle) throw new Error('Tools deps not initialized')
  return _bundle
}

export function registerToolsHandlers(): void {
  registerHandler('tools.list', async () => {
    return { tools: listToolsForModel() }
  })

  registerHandler('tools.invoke', async (params, ctx) => {
    const { toolId, params: toolParams } = z
      .object({
        toolId: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(params)

    const { db } = getBundle()
    const auditRepo = createAuditRepo(db)
    const deps = makeExecutorDeps(auditRepo)

    const result = await executeTool(
      toolId,
      toolParams ?? {},
      { actor: 'user', traceId: ctx?.traceId ?? randomUUID() },
      deps,
    )

    return {
      outcome: result.outcome,
      invocationId: result.invocationId,
      ...(result.outcome === 'success' ? { result: result.result } : {}),
      ...(result.outcome === 'failure' ? { error: result.error } : {}),
    }
  })

  // ── Sandbox roots management ───────────────────────────────────────────────

  registerHandler('tools.getSandboxRoots', async () => {
    const defaults = getDefaultSandboxRoots()
    const all = getSandboxRoots()
    // Extra = roots beyond the three defaults
    const extras = all.filter((r) => !defaults.includes(r))
    return { roots: all, defaults, extras }
  })

  registerHandler('tools.addSandboxRoot', async (params) => {
    const { path } = z.object({ path: z.string().min(1) }).parse(params)
    const { db } = getBundle()
    const settings = createSettingsRepo(db)
    const current = settings.get('tools.extraSandboxRoots', z.array(z.string())) ?? []
    if (!current.includes(path)) {
      const updated = [...current, path]
      settings.set('tools.extraSandboxRoots', updated)
      // Reinit sandbox with updated roots
      initSandboxRoots([...getDefaultSandboxRoots(), ...updated])
    }
    return { roots: getSandboxRoots() }
  })

  registerHandler('tools.removeSandboxRoot', async (params) => {
    const { path } = z.object({ path: z.string().min(1) }).parse(params)
    const { db } = getBundle()
    const settings = createSettingsRepo(db)
    const current = settings.get('tools.extraSandboxRoots', z.array(z.string())) ?? []
    const updated = current.filter((r) => r !== path)
    settings.set('tools.extraSandboxRoots', updated)
    // Reinit sandbox without removed root
    initSandboxRoots([...getDefaultSandboxRoots(), ...updated])
    return { roots: getSandboxRoots() }
  })
}
