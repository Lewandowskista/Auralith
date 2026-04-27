import { randomUUID } from 'crypto'
import { z } from 'zod'
import type { OllamaClient } from './client'
import type { ToolManifestEntry } from './turn-runner'
import { formatToon } from './prompt-format'
import { resolveModelConfig } from './model-resolver'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentStep = {
  id: string
  toolId: string
  params: Record<string, unknown>
  description?: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  result?: unknown
  error?: string
  startedAt?: number
  endedAt?: number
}

export type AgentPlan = {
  goal: string
  steps: AgentStep[]
  reasoning?: string
}

export type AgentRunState = {
  runId: string
  sessionId: string
  goal: string
  plan: AgentPlan | null
  currentStepIndex: number
  status: 'planning' | 'running' | 'reflecting' | 'completed' | 'failed' | 'cancelled'
  finalAnswer?: string
  error?: string
}

export type AgentLoopDeps = {
  chatClient: OllamaClient
  chatModel: string
  /** AI role used to resolve the correct num_ctx. Defaults to 'agent'. */
  chatRole?: string
  tools: ToolManifestEntry[]
  /** Max total steps across all planning iterations */
  maxSteps?: number
  /** Wall-clock timeout for the whole run (ms) */
  timeoutMs?: number
  /** Called after each plan or step update */
  onStateUpdate: (state: AgentRunState) => void
  /** Execute a single tool call */
  executeTool: (
    toolId: string,
    params: unknown,
  ) => Promise<{
    outcome: 'success' | 'failure' | 'cancelled'
    result?: unknown
    error?: string
    invocationId?: string
  }>
  /** Check if cancelled from outside */
  isCancelled: () => boolean
}

const PLAN_STEP_LIMIT = 15

// ── Planner ───────────────────────────────────────────────────────────────────

const PLANNER_SYSTEM = `You are an autonomous AI agent planner. Given a goal and a list of available tools, produce a JSON plan.
Output ONLY a JSON object — no prose, no markdown, no code fences.
Format: {"goal":"...","reasoning":"...","steps":[{"toolId":"...","params":{...},"description":"..."}]}`

function buildPlannerUserMessage(goal: string, tools: ToolManifestEntry[]): string {
  // TOON-like compact record table — saves tokens vs prose list for large tool catalogs.
  // Output must remain strict JSON; TOON is only for this input context.
  const toolTable = formatToon(
    tools.map((t) => ({ id: t.id, tier: t.tier, description: t.description })),
    ['id', 'tier', 'description'],
    'tools',
  )
  return `Goal: ${goal}

Available tools (use ONLY these IDs — max ${PLAN_STEP_LIMIT} steps):
${toolTable}

Produce the JSON plan now.`
}

// ── Reflector ─────────────────────────────────────────────────────────────────

const REFLECTOR_SYSTEM = `You are an autonomous AI agent reflecting on task progress.
Output ONLY a JSON object — no prose, no markdown, no code fences.
Format: {"decision":"continue"|"done","answer":"<final answer if done, else omit>","revisedRemainingSteps":null|[{"toolId":"...","params":{...},"description":"..."}]}`

function buildReflectionUserMessage(
  goal: string,
  completedSteps: AgentStep[],
  remainingSteps: AgentStep[],
  tools: ToolManifestEntry[],
): string {
  // Truncate results to avoid context explosion on long runs
  const doneStr = completedSteps
    .map(
      (s, i) =>
        `Step ${i + 1} [${s.toolId}]: ${s.status}${
          s.status === 'done'
            ? ` — ${JSON.stringify(s.result).slice(0, 120)}`
            : s.error
              ? ` — error: ${s.error.slice(0, 80)}`
              : ''
        }`,
    )
    .join('\n')

  const remainStr =
    remainingSteps.length > 0
      ? remainingSteps.map((s) => `- ${s.toolId}: ${s.description ?? ''}`).join('\n')
      : '(none — all planned steps done)'

  // Compact TOON id-only list for the reflector — just needs valid IDs, not full descriptions.
  const toolIds = tools.map((t) => t.id).join(', ')

  return `Goal: ${goal}

Completed steps:
${doneStr || '(none)'}

Remaining planned steps:
${remainStr}

Available tool IDs (only these are valid if you revise steps): ${toolIds}

Decide: are you done, or should you continue / revise the remaining steps?`
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  // Strip markdown code fences first
  const cleaned = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  // Try direct parse first
  try {
    return JSON.parse(cleaned)
  } catch {
    // Fall back to first balanced JSON object in the text
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON object found in response')
    return JSON.parse(match[0])
  }
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const PlanSchema = z.object({
  goal: z.string(),
  reasoning: z.string().optional(),
  steps: z
    .array(
      z.object({
        toolId: z.string(),
        params: z.record(z.string(), z.unknown()),
        description: z.string().optional(),
      }),
    )
    .max(PLAN_STEP_LIMIT),
})

const ReflectionSchema = z.object({
  decision: z.enum(['continue', 'done']),
  answer: z.string().optional(),
  revisedRemainingSteps: z
    .array(
      z.object({
        toolId: z.string(),
        params: z.record(z.string(), z.unknown()),
        description: z.string().optional(),
      }),
    )
    .nullable()
    .optional(),
})

function makeStep(s: {
  toolId: string
  params: Record<string, unknown>
  description?: string | undefined
}): AgentStep {
  const step: AgentStep = {
    id: randomUUID(),
    toolId: s.toolId,
    params: s.params,
    status: 'pending',
  }
  if (s.description !== undefined) step.description = s.description
  return step
}

// ── Main agent loop ───────────────────────────────────────────────────────────

export async function runAgentLoop(
  runId: string,
  sessionId: string,
  goal: string,
  deps: AgentLoopDeps,
): Promise<AgentRunState> {
  const maxSteps = deps.maxSteps ?? PLAN_STEP_LIMIT
  const timeoutMs = deps.timeoutMs ?? 3 * 60 * 1000
  const deadline = Date.now() + timeoutMs
  const { num_ctx } = resolveModelConfig(deps.chatRole ?? 'agent', { model: deps.chatModel })

  const state: AgentRunState = {
    runId,
    sessionId,
    goal,
    plan: null,
    currentStepIndex: 0,
    status: 'planning',
  }

  deps.onStateUpdate({ ...state })

  // ── 1. Planning ──────────────────────────────────────────────────────────────
  // Use generate (non-streaming) for structured JSON — streaming adds latency
  // and doesn't help for small JSON payloads. The system message gives the model
  // clear role context, which is important for smaller models (phi4-mini, qwen3).
  let planRaw: unknown
  try {
    if (Date.now() > deadline || deps.isCancelled()) {
      state.status = 'cancelled'
      deps.onStateUpdate({ ...state })
      return state
    }

    const planText = await deps.chatClient.generate({
      model: deps.chatModel,
      messages: [
        { role: 'system', content: PLANNER_SYSTEM },
        { role: 'user', content: buildPlannerUserMessage(goal, deps.tools) },
      ],
      format: 'json',
      maxTokens: 1024,
      temperature: 0.1,
      num_ctx,
    })
    planRaw = extractJson(planText)
  } catch (err) {
    state.status = 'failed'
    state.error = `Planning failed: ${err instanceof Error ? err.message : String(err)}`
    deps.onStateUpdate({ ...state })
    return state
  }

  let parsed: z.infer<typeof PlanSchema>
  try {
    parsed = PlanSchema.parse(planRaw)
  } catch (err) {
    state.status = 'failed'
    state.error = `Invalid plan format: ${err instanceof Error ? err.message : String(err)}`
    deps.onStateUpdate({ ...state })
    return state
  }

  // Validate that all planned tool IDs exist in the registered tool list
  const knownToolIds = new Set(deps.tools.map((t) => t.id))
  const unknownTools = parsed.steps.filter((s) => !knownToolIds.has(s.toolId))
  if (unknownTools.length > 0) {
    state.status = 'failed'
    state.error = `Plan references unknown tools: ${unknownTools.map((s) => s.toolId).join(', ')}`
    deps.onStateUpdate({ ...state })
    return state
  }

  const plan: AgentPlan = {
    goal: parsed.goal,
    steps: parsed.steps.map(makeStep),
    ...(parsed.reasoning !== undefined ? { reasoning: parsed.reasoning } : {}),
  }

  state.plan = plan
  state.status = 'running'
  deps.onStateUpdate({ ...state })

  // ── 2. Execution loop ────────────────────────────────────────────────────────
  let totalStepsRun = 0
  let lastStepFailed = false
  let consecutiveReflectionFailures = 0
  const MAX_CONSECUTIVE_REFLECTION_FAILURES = 3

  while (state.currentStepIndex < plan.steps.length && totalStepsRun < maxSteps) {
    if (Date.now() > deadline) {
      state.status = 'failed'
      state.error = 'Agent timed out'
      deps.onStateUpdate({ ...state })
      return state
    }
    if (deps.isCancelled()) {
      state.status = 'cancelled'
      deps.onStateUpdate({ ...state })
      return state
    }

    const step = plan.steps[state.currentStepIndex]
    if (!step) break
    step.status = 'running'
    step.startedAt = Date.now()
    deps.onStateUpdate({ ...state })

    const toolResult = await deps.executeTool(step.toolId, step.params)

    step.endedAt = Date.now()
    totalStepsRun++

    if (toolResult.outcome === 'cancelled') {
      step.status = 'skipped'
      state.status = 'cancelled'
      deps.onStateUpdate({ ...state })
      return state
    } else if (toolResult.outcome === 'success') {
      step.status = 'done'
      step.result = toolResult.result
      lastStepFailed = false
    } else {
      step.status = 'failed'
      step.error = toolResult.error ?? 'tool failed'
      lastStepFailed = true
    }

    state.currentStepIndex++
    deps.onStateUpdate({ ...state })

    // ── 3. Reflection checkpoint ───────────────────────────────────────────────
    // Reflect only when: a step failed, at every 5th step from step 5, or at plan end.
    // This avoids ~66% of reflection calls vs the old every-3 approach.
    const atPlanEnd = state.currentStepIndex >= plan.steps.length
    const shouldReflect =
      lastStepFailed || atPlanEnd || (totalStepsRun >= 5 && totalStepsRun % 5 === 0)
    if (shouldReflect) {
      state.status = 'reflecting'
      deps.onStateUpdate({ ...state })

      const completedSteps = plan.steps.slice(0, state.currentStepIndex)
      const remainingSteps = plan.steps.slice(state.currentStepIndex)

      try {
        const reflText = await deps.chatClient.generate({
          model: deps.chatModel,
          messages: [
            { role: 'system', content: REFLECTOR_SYSTEM },
            {
              role: 'user',
              content: buildReflectionUserMessage(goal, completedSteps, remainingSteps, deps.tools),
            },
          ],
          format: 'json',
          maxTokens: 512,
          temperature: 0.1,
          num_ctx,
        })

        const reflRaw = extractJson(reflText)
        const refl = ReflectionSchema.parse(reflRaw)

        if (refl.decision === 'done') {
          state.status = 'completed'
          state.finalAnswer = refl.answer ?? 'Task completed.'
          deps.onStateUpdate({ ...state })
          return state
        }

        // Optionally revise remaining steps; validate tool IDs before applying
        if (refl.revisedRemainingSteps) {
          const badIds = refl.revisedRemainingSteps.filter((s) => !knownToolIds.has(s.toolId))
          if (badIds.length === 0) {
            const newSteps = refl.revisedRemainingSteps.map(makeStep)
            plan.steps.splice(
              state.currentStepIndex,
              plan.steps.length - state.currentStepIndex,
              ...newSteps,
            )
          }
        }

        consecutiveReflectionFailures = 0
      } catch (err) {
        consecutiveReflectionFailures++
        console.warn(
          `[agent-loop] reflection failed (${consecutiveReflectionFailures}/${MAX_CONSECUTIVE_REFLECTION_FAILURES}):`,
          err instanceof Error ? err.message : String(err),
        )
        if (consecutiveReflectionFailures >= MAX_CONSECUTIVE_REFLECTION_FAILURES) {
          state.status = 'failed'
          state.error = `Reflector failed ${MAX_CONSECUTIVE_REFLECTION_FAILURES} times consecutively`
          deps.onStateUpdate({ ...state })
          return state
        }
      }

      state.status = 'running'
      deps.onStateUpdate({ ...state })
    }
  }

  // All steps executed without a done decision from the reflector
  state.status = 'completed'
  if (!state.finalAnswer) {
    const lastDone = plan.steps.filter((s) => s.status === 'done').at(-1)
    state.finalAnswer = lastDone?.result
      ? `Completed ${plan.steps.length} steps. Last result: ${JSON.stringify(lastDone.result).slice(0, 300)}`
      : `Completed ${totalStepsRun} step(s).`
  }
  deps.onStateUpdate({ ...state })
  return state
}
