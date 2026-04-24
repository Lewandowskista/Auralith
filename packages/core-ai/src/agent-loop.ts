import { randomUUID } from 'crypto'
import { z } from 'zod'
import type { OllamaClient } from './client'
import type { ToolManifestEntry } from './turn-runner'

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

// ── Planning prompt ───────────────────────────────────────────────────────────

function buildPlannerPrompt(goal: string, tools: ToolManifestEntry[]): string {
  const toolList = tools.map((t) => `- ${t.id} (${t.tier}): ${t.description}`).join('\n')

  return `You are an autonomous AI agent planner. Given a goal, produce a JSON plan listing the steps needed to accomplish it.

Available tools:
${toolList}

Rules:
- Max ${PLAN_STEP_LIMIT} steps
- Only use tool IDs listed above
- Each step must have: toolId (string), params (object), description (string)
- Output ONLY a JSON object, no prose

Output format:
{"goal":"<goal>","reasoning":"<why these steps>","steps":[{"toolId":"...","params":{...},"description":"..."}]}`
}

function buildReflectionPrompt(
  goal: string,
  completedSteps: AgentStep[],
  remainingSteps: AgentStep[],
): string {
  const doneStr = completedSteps
    .map(
      (s, i) =>
        `Step ${i + 1} (${s.toolId}): ${s.status} — ${s.status === 'done' ? JSON.stringify(s.result).slice(0, 200) : s.error}`,
    )
    .join('\n')

  const remainStr = remainingSteps.map((s) => `- ${s.toolId}: ${s.description}`).join('\n')

  return `Goal: ${goal}

Completed steps:
${doneStr || '(none)'}

Remaining planned steps:
${remainStr || '(none)'}

Based on what has happened, should you continue with the remaining steps or are you done?

Reply with JSON only:
{"decision":"continue"|"done","answer":"<final answer if done, else empty>","revisedRemainingSteps":<null or revised array with same format as before>}`
}

// ── JSON extraction helper ─────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found in response')
  return JSON.parse(match[0])
}

// ── Plan schema ───────────────────────────────────────────────────────────────

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
  let planRaw: unknown
  try {
    const plannerMsg = buildPlannerPrompt(goal, deps.tools)
    let planText = ''
    for await (const token of deps.chatClient.stream({
      model: deps.chatModel,
      messages: [{ role: 'user', content: plannerMsg }],
      format: 'json',
    })) {
      planText += token
      if (Date.now() > deadline || deps.isCancelled()) {
        state.status = 'cancelled'
        deps.onStateUpdate({ ...state })
        return state
      }
    }
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
  const REFLECT_EVERY = 3

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
    } else {
      step.status = 'failed'
      step.error = toolResult.error ?? 'tool failed'
    }

    state.currentStepIndex++
    deps.onStateUpdate({ ...state })

    // ── 3. Reflection checkpoint ───────────────────────────────────────────────
    const shouldReflect =
      totalStepsRun % REFLECT_EVERY === 0 || state.currentStepIndex >= plan.steps.length
    if (shouldReflect) {
      state.status = 'reflecting'
      deps.onStateUpdate({ ...state })

      const completedSteps = plan.steps.slice(0, state.currentStepIndex)
      const remainingSteps = plan.steps.slice(state.currentStepIndex)

      try {
        const reflectionMsg = buildReflectionPrompt(goal, completedSteps, remainingSteps)
        let reflText = ''
        for await (const token of deps.chatClient.stream({
          model: deps.chatModel,
          messages: [{ role: 'user', content: reflectionMsg }],
          format: 'json',
        })) {
          reflText += token
        }

        const reflRaw = extractJson(reflText)
        const refl = ReflectionSchema.parse(reflRaw)

        if (refl.decision === 'done') {
          state.status = 'completed'
          state.finalAnswer = refl.answer ?? 'Task completed.'
          deps.onStateUpdate({ ...state })
          return state
        }

        // Optionally revise remaining steps
        if (refl.revisedRemainingSteps) {
          const newSteps = refl.revisedRemainingSteps.map(makeStep)
          plan.steps.splice(
            state.currentStepIndex,
            plan.steps.length - state.currentStepIndex,
            ...newSteps,
          )
        }
      } catch {
        // Reflection failed — continue with original plan
      }

      state.status = 'running'
      deps.onStateUpdate({ ...state })
    }
  }

  // All steps executed
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
