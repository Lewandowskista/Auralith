import type { ModelRole } from './router'
import { ROLE_CTX_CONFIG } from './config/model-config'

export type ResolvedModelConfig = {
  model: string
  num_ctx: number
}

export type ModelConfigOverrides = {
  model?: string
  num_ctx?: number
}

// Safety clamp — prevents extreme VRAM pressure or uselessly tiny contexts.
const MIN_CTX = 512
const MAX_CTX = 8192

function clampCtx(value: number): number {
  return Math.min(MAX_CTX, Math.max(MIN_CTX, value))
}

const FALLBACK: ResolvedModelConfig = { model: 'qwen3:8b', num_ctx: 4096 }

/**
 * Returns the model + num_ctx to use for a given AI role.
 * The returned model is the role's default — callers that use ModelRouter
 * should pass `router.modelFor(role)` as an override to respect user preset selection.
 *
 * @param role  - AI role key (e.g. 'classifier', 'rag', 'chat')
 * @param overrides - Optional per-request overrides; take priority over defaults
 */
export function resolveModelConfig(
  role: string,
  overrides?: ModelConfigOverrides,
): ResolvedModelConfig {
  const base = ROLE_CTX_CONFIG[role as ModelRole] ?? null

  const model = overrides?.model ?? base?.defaultModel ?? FALLBACK.model
  const rawCtx = overrides?.num_ctx ?? base?.num_ctx ?? FALLBACK.num_ctx
  const num_ctx = clampCtx(rawCtx)

  if (process.env['NODE_ENV'] !== 'production') {
    console.warn(`[AI] role=${role} model=${model} ctx=${num_ctx}`)
  }

  return { model, num_ctx }
}
