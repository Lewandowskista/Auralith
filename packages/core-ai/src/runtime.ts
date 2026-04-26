import { createHash } from 'crypto'
import type { z } from 'zod'
import type { OllamaClient, ChatMessage } from './client'
import type { ModelRole } from './router'
import { resolveModelConfig } from './model-resolver'

export type PromptContract<TOut> = {
  id: string
  role: ModelRole
  system: string
  userTemplate: (ctx: Record<string, string>) => string
  outputSchema: z.ZodType<TOut>
  maxTokens: number
  temperature: number
  /** When set and temperature is 0, successful results are cached for this many ms. */
  cacheTtlMs?: number
}

export type PromptCacheStore = {
  get(hash: string): string | undefined
  set(hash: string, model: string, prompt: string, completion: string, ttlMs: number): void
  evict(): void
}

export type RunResult<TOut> =
  | { ok: true; data: TOut; raw: string }
  | { ok: false; error: string; raw: string }

// ── JSON reliability tracking ──────────────────────────────────────────────────
// Tracks parse/validation failures per model+role without storing prompt content.

export type JsonReliabilityStat = {
  model: string
  role: ModelRole
  promptTemplateId: string
  attempts: number
  parseFailures: number
  validationFailures: number
  /** Calls where the first attempt failed but the retry succeeded. */
  repairedJson: number
  successes: number
}

// In-process store; keyed by `${model}::${role}::${promptTemplateId}`
const _reliabilityStats = new Map<string, JsonReliabilityStat>()

function statKey(model: string, role: ModelRole, promptTemplateId: string): string {
  return `${model}::${role}::${promptTemplateId}`
}

const STATS_MAP_MAX = 1_000

function getOrCreateStat(
  model: string,
  role: ModelRole,
  promptTemplateId: string,
): JsonReliabilityStat {
  const key = statKey(model, role, promptTemplateId)
  let stat = _reliabilityStats.get(key)
  if (!stat) {
    if (_reliabilityStats.size >= STATS_MAP_MAX) {
      // Evict the oldest entry to keep the map bounded
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      _reliabilityStats.delete(_reliabilityStats.keys().next().value!)
    }
    stat = {
      model,
      role,
      promptTemplateId,
      attempts: 0,
      parseFailures: 0,
      validationFailures: 0,
      repairedJson: 0,
      successes: 0,
    }
    _reliabilityStats.set(key, stat)
  }
  return stat
}

/** Returns a snapshot of all reliability stats. Does not include prompt content. */
export function getJsonReliabilityStats(): JsonReliabilityStat[] {
  return Array.from(_reliabilityStats.values()).map((s) => ({ ...s }))
}

/** Resets all in-process stats (useful for testing). */
export function resetJsonReliabilityStats(): void {
  _reliabilityStats.clear()
}

export type ReliabilityFlusher = {
  upsertReliability(row: {
    model: string
    role: string
    promptId: string
    hourBucket: number
    attempts: number
    parseFailures: number
    validationFailures: number
    repaired: number
    successes: number
  }): void
}

/**
 * Starts a recurring flush of in-memory reliability stats into the provided repo.
 * Resets in-memory counters after each flush. Returns a cancel function.
 */
export function flushReliabilityToRepo(repo: ReliabilityFlusher, intervalMs = 60_000): () => void {
  const flush = (): void => {
    const now = Date.now()
    const hourBucket = Math.floor(now / (60 * 60 * 1000))
    for (const stat of _reliabilityStats.values()) {
      if (stat.attempts === 0) continue
      repo.upsertReliability({
        model: stat.model,
        role: stat.role,
        promptId: stat.promptTemplateId,
        hourBucket,
        attempts: stat.attempts,
        parseFailures: stat.parseFailures,
        validationFailures: stat.validationFailures,
        repaired: stat.repairedJson,
        successes: stat.successes,
      })
      // Reset counters so next flush only captures delta
      stat.attempts = 0
      stat.parseFailures = 0
      stat.validationFailures = 0
      stat.repairedJson = 0
      stat.successes = 0
    }
  }

  const timer = setInterval(flush, intervalMs)
  return () => clearInterval(timer)
}

// ── runPrompt ─────────────────────────────────────────────────────────────────

export async function runPrompt<TOut>(
  contract: PromptContract<TOut>,
  ctx: Record<string, string>,
  client: OllamaClient,
  model: string,
  cache?: PromptCacheStore,
): Promise<RunResult<TOut>> {
  const stat = getOrCreateStat(model, contract.role, contract.id)
  stat.attempts++

  // Resolve context size for this role; pass model as override so the
  // user's ModelRouter preset is respected while still getting the right ctx.
  const { num_ctx } = resolveModelConfig(contract.role, { model })

  const userMessage = contract.userTemplate(ctx)
  const messages: ChatMessage[] = [
    { role: 'system', content: contract.system },
    { role: 'user', content: userMessage },
  ]

  // Cache lookup — only for deterministic prompts (temperature=0, cacheTtlMs set)
  const cacheKey =
    cache && contract.cacheTtlMs && contract.temperature === 0
      ? createHash('sha256').update(`${contract.id}::${model}::${userMessage}`).digest('hex')
      : null

  if (cacheKey && cache) {
    const cached = cache.get(cacheKey)
    if (cached !== undefined) {
      const parsed = contract.outputSchema.safeParse(JSON.parse(cached))
      if (parsed.success) {
        stat.successes++
        return { ok: true, data: parsed.data, raw: cached }
      }
    }
  }

  const attempt = async (extraSuffix?: string): Promise<RunResult<TOut>> => {
    const finalMessages = extraSuffix
      ? [
          ...messages,
          { role: 'assistant' as const, content: '' },
          { role: 'user' as const, content: extraSuffix },
        ]
      : messages

    let raw = ''
    try {
      raw = await client.generate({
        model,
        messages: finalMessages,
        format: 'json',
        maxTokens: contract.maxTokens,
        temperature: contract.temperature,
        num_ctx,
      })
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Ollama request failed',
        raw: '',
      }
    }

    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      stat.parseFailures++
      return { ok: false, error: 'Response was not valid JSON', raw }
    }

    const validated = contract.outputSchema.safeParse(parsed)
    if (validated.success) {
      stat.successes++
      return { ok: true, data: validated.data, raw }
    }
    stat.validationFailures++
    return { ok: false, error: validated.error.message, raw }
  }

  // First attempt
  const first = await attempt()
  if (first.ok) {
    if (cacheKey && cache && contract.cacheTtlMs) {
      cache.set(cacheKey, model, userMessage, first.raw, contract.cacheTtlMs)
    }
    return first
  }

  // Build a concrete hint by introspecting the Zod shape so the model gets
  // something actionable rather than the useless string "object".
  let schemaHint: string
  try {
    const schemaDef = (contract.outputSchema as unknown as Record<string, unknown>)['_def']
    const shape =
      schemaDef !== null && typeof schemaDef === 'object' && 'shape' in (schemaDef as object)
        ? (schemaDef as { shape: unknown }).shape
        : null
    schemaHint =
      shape !== null && typeof shape === 'object'
        ? JSON.stringify(
            Object.fromEntries(
              Object.entries(shape as Record<string, { _def?: { typeName?: string } }>).map(
                ([k, v]) => [k, v?._def?.typeName ?? 'unknown'],
              ),
            ),
          )
        : contract.id
  } catch {
    schemaHint = contract.id
  }

  const retry = await attempt(
    `Your previous reply was invalid. Reply with ONLY valid JSON — no prose, no markdown. Expected shape: ${schemaHint}`,
  )
  if (retry.ok) {
    // First attempt failed but retry succeeded — count as a repaired call.
    stat.repairedJson++
  }
  return retry
}
