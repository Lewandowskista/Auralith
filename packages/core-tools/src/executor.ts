import { randomUUID } from 'crypto'
import { getTool, type ToolCtx } from './registry'
import type { AuditRepo } from '@auralith/core-db'

export type ExecutorDeps = {
  auditRepo: AuditRepo
  /** Called for confirm-tier tools — resolves true if the user confirmed, false if cancelled */
  requestConfirmation: (
    invocationId: string,
    toolId: string,
    params: unknown,
    reversible: boolean,
  ) => Promise<boolean>
  /** Called for restricted-tier tools — resolves true only if user typed "CONFIRM" */
  requestRestrictedConfirmation: (
    invocationId: string,
    toolId: string,
    params: unknown,
  ) => Promise<boolean>
}

export type InvocationResult<R = unknown> =
  | { outcome: 'success'; result: R; invocationId: string; traceId: string }
  | { outcome: 'failure'; error: string; invocationId: string; traceId: string }
  | { outcome: 'cancelled'; invocationId: string; traceId: string }

export async function executeTool<R = unknown>(
  toolId: string,
  params: unknown,
  ctx: ToolCtx,
  deps: ExecutorDeps,
): Promise<InvocationResult<R>> {
  const invocationId = randomUUID()
  const tool = getTool(toolId)

  if (!tool) {
    const error = `Unknown tool: ${toolId}`
    await deps.auditRepo.write({
      kind: 'tool.unknown',
      actor: ctx.actor,
      subject: toolId,
      meta: { invocationId, error, params },
    })
    return { outcome: 'failure', error, invocationId, traceId: ctx.traceId }
  }

  // Validate params
  const parsed = tool.paramsSchema.safeParse(params)
  if (!parsed.success) {
    const error = parsed.error.message
    await deps.auditRepo.write({
      kind: 'tool.invalid_params',
      actor: ctx.actor,
      subject: toolId,
      meta: { invocationId, error, params },
    })
    return { outcome: 'failure', error, invocationId, traceId: ctx.traceId }
  }

  // Tier gate
  if (tool.tier === 'restricted') {
    // Suggestion worker cannot invoke restricted tools
    if (ctx.actor === 'suggestion' || ctx.actor === 'scheduler') {
      await deps.auditRepo.write({
        kind: 'tool.blocked',
        actor: ctx.actor,
        subject: toolId,
        meta: {
          invocationId,
          tier: 'restricted',
          reason: 'auto-invocation-blocked',
          params: parsed.data,
        },
      })
      return { outcome: 'cancelled', invocationId, traceId: ctx.traceId }
    }
    const confirmed = await deps.requestRestrictedConfirmation(invocationId, toolId, parsed.data)
    if (!confirmed) {
      await deps.auditRepo.write({
        kind: 'tool.cancelled',
        actor: ctx.actor,
        subject: toolId,
        meta: { invocationId, tier: 'restricted', params: parsed.data },
      })
      return { outcome: 'cancelled', invocationId, traceId: ctx.traceId }
    }
  } else if (tool.tier === 'confirm') {
    const confirmed = await deps.requestConfirmation(
      invocationId,
      toolId,
      parsed.data,
      tool.reversible !== undefined,
    )
    if (!confirmed) {
      await deps.auditRepo.write({
        kind: 'tool.cancelled',
        actor: ctx.actor,
        subject: toolId,
        meta: { invocationId, tier: 'confirm', params: parsed.data },
      })
      return { outcome: 'cancelled', invocationId, traceId: ctx.traceId }
    }
  }

  // Execute
  try {
    const result = await tool.execute(parsed.data, ctx)
    await deps.auditRepo.write({
      kind: 'tool.success',
      actor: ctx.actor,
      subject: toolId,
      meta: { invocationId, tier: tool.tier, traceId: ctx.traceId, params: parsed.data },
    })
    return { outcome: 'success', result: result as R, invocationId, traceId: ctx.traceId }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    await deps.auditRepo.write({
      kind: 'tool.failure',
      actor: ctx.actor,
      subject: toolId,
      meta: { invocationId, tier: tool.tier, error, params: parsed.data },
    })
    return { outcome: 'failure', error, invocationId, traceId: ctx.traceId }
  }
}
