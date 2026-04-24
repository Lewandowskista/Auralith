import { randomUUID } from 'crypto'
import { z } from 'zod'
import { registerHandler } from '../router'
import type { DbBundle } from '@auralith/core-db'
import type { SuggestionStatus } from '@auralith/core-db'
import { createSuggestionsRepo, createAuditRepo, createSettingsRepo } from '@auralith/core-db'
import {
  SuggestListParamsSchema,
  SuggestAcceptParamsSchema,
  SuggestDismissParamsSchema,
  SuggestSnoozeParamsSchema,
} from '@auralith/core-domain'
import { executeTool } from '@auralith/core-tools'
import { makeExecutorDeps } from '../../tools/confirmation'

let _bundle: DbBundle | null = null

export function initSuggestDeps(bundle: DbBundle): void {
  _bundle = bundle
}

function getBundle(): DbBundle {
  if (!_bundle) throw new Error('Suggest deps not initialized')
  return _bundle
}

export async function acceptSuggestionById(
  id: string,
  traceId: string = randomUUID(),
): Promise<{
  accepted: boolean
  invocationId?: string
}> {
  const { db } = getBundle()
  const repo = createSuggestionsRepo(db)
  const suggestion = repo.get(id)
  if (!suggestion) {
    throw Object.assign(new Error('Suggestion not found'), { code: 'NOT_FOUND' })
  }
  if (suggestion.status !== 'open') {
    return { accepted: false }
  }

  repo.accept(id)

  let invocationId: string | undefined
  try {
    const action = JSON.parse(suggestion.proposedActionJson) as {
      toolId: string
      params: Record<string, unknown>
    }
    const auditRepo = createAuditRepo(db)
    const settings = createSettingsRepo(db)
    const autoApprove = settings.get('assistant.autoApproveConfirmTier', z.boolean()) ?? false
    const deps = makeExecutorDeps(auditRepo)
    const execDeps =
      autoApprove && suggestion.tier === 'confirm'
        ? { ...deps, requestConfirmation: async () => true as const }
        : deps

    const result = await executeTool(
      action.toolId,
      action.params,
      { actor: 'suggestion', traceId },
      execDeps,
    )

    invocationId = result.invocationId
  } catch (err) {
    console.error('[suggest] accept execution error:', err)
  }

  return {
    accepted: true,
    ...(invocationId !== undefined ? { invocationId } : {}),
  }
}

export function registerSuggestHandlers(): void {
  registerHandler('suggest.list', async (params) => {
    const opts = SuggestListParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createSuggestionsRepo(db)
    const listOpts: { status?: SuggestionStatus; limit?: number } = { limit: opts.limit }
    if (opts.status !== undefined) listOpts.status = opts.status
    const rows = repo.list(listOpts)
    return {
      suggestions: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        rationale: r.rationale,
        proposedActionJson: r.proposedActionJson,
        tier: r.tier,
        status: r.status,
        createdAt: r.createdAt.getTime(),
        decidedAt: r.decidedAt?.getTime(),
        expiresAt: r.expiresAt?.getTime(),
      })),
    }
  })

  registerHandler('suggest.accept', async (params, ctx) => {
    const { id } = SuggestAcceptParamsSchema.parse(params)
    return acceptSuggestionById(id, ctx?.traceId ?? randomUUID())
  })

  registerHandler('suggest.dismiss', async (params) => {
    const { id } = SuggestDismissParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createSuggestionsRepo(db)
    const suggestion = repo.get(id)
    if (!suggestion) throw Object.assign(new Error('Suggestion not found'), { code: 'NOT_FOUND' })
    repo.dismiss(id)
    return { dismissed: true }
  })

  registerHandler('suggest.snooze', async (params) => {
    const { id, until } = SuggestSnoozeParamsSchema.parse(params)
    const { db } = getBundle()
    const repo = createSuggestionsRepo(db)
    const suggestion = repo.get(id)
    if (!suggestion) throw Object.assign(new Error('Suggestion not found'), { code: 'NOT_FOUND' })
    repo.snooze(id, new Date(until))
    return { snoozed: true }
  })

  registerHandler('assistant.invokeTool', async (params, ctx) => {
    const { toolId, toolParams } = z
      .object({
        toolId: z.string(),
        toolParams: z.record(z.unknown()).optional(),
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
}
