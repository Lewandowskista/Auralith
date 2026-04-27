import { describe, expect, it } from 'vitest'
import { runAgentLoop } from './agent-loop'
import type { AgentLoopDeps } from './agent-loop'
import type { ToolManifestEntry } from './turn-runner'
import type { OllamaClient, GenerateOpts } from './client'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAFE_TOOL: ToolManifestEntry = {
  id: 'files.list',
  tier: 'safe',
  description: 'List files in a directory',
  paramsSchema: { type: 'object', properties: { path: { type: 'string' } } },
}

/** Build a fake OllamaClient that cycles through provided JSON response strings. */
function fakeClient(responses: string[]): OllamaClient {
  let i = 0
  return {
    generate: async (_opts: GenerateOpts) => responses[i++] ?? '{}',
  } as OllamaClient
}

function baseDeps(
  client: OllamaClient,
  tools: ToolManifestEntry[] = [SAFE_TOOL],
  overrides: Partial<AgentLoopDeps> = {},
): AgentLoopDeps {
  return {
    chatClient: client,
    chatModel: 'test-model:3b',
    tools,
    maxSteps: 5,
    timeoutMs: 10_000,
    onStateUpdate: () => undefined,
    executeTool: async () => ({ outcome: 'success', result: { ok: true } }),
    isCancelled: () => false,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runAgentLoop — tool ID validation', () => {
  it('fails immediately when the plan references an unknown tool ID', async () => {
    const plan = JSON.stringify({
      goal: 'do something',
      reasoning: 'test',
      steps: [{ toolId: 'nonexistent.tool', params: {}, description: 'ghost step' }],
    })

    // Reflector response (should not be reached)
    const client = fakeClient([plan, '{"decision":"done","answer":"done"}'])
    const state = await runAgentLoop('run-1', 'sess-1', 'do something', baseDeps(client))

    expect(state.status).toBe('failed')
    expect(state.error).toMatch(/unknown tools/)
  })

  it('fails when plan JSON is malformed', async () => {
    const client = fakeClient(['not-valid-json'])
    const state = await runAgentLoop('run-2', 'sess-2', 'bad plan', baseDeps(client))

    expect(state.status).toBe('failed')
  })

  it('fails when planner produces wrong schema (missing steps array)', async () => {
    const client = fakeClient([JSON.stringify({ goal: 'test' })])
    const state = await runAgentLoop('run-3', 'sess-3', 'bad schema', baseDeps(client))

    expect(state.status).toBe('failed')
  })
})

describe('runAgentLoop — successful execution', () => {
  it('completes when reflector decides done after all steps', async () => {
    const plan = JSON.stringify({
      goal: 'list files',
      reasoning: 'simple',
      steps: [{ toolId: 'files.list', params: { path: '/' }, description: 'list root' }],
    })
    const reflection = JSON.stringify({ decision: 'done', answer: 'Files listed.' })

    const client = fakeClient([plan, reflection])
    const state = await runAgentLoop('run-4', 'sess-4', 'list files', baseDeps(client))

    expect(state.status).toBe('completed')
  })

  it('completes without a reflector response if all steps succeed and reflector is skipped', async () => {
    // Reflection fires at plan-end; give it a done response.
    const plan = JSON.stringify({
      goal: 'list files',
      steps: [{ toolId: 'files.list', params: {} }],
    })
    const reflection = JSON.stringify({ decision: 'done', answer: 'All done.' })
    const client = fakeClient([plan, reflection])

    const states: string[] = []
    const deps = baseDeps(client, [SAFE_TOOL], {
      onStateUpdate: (s) => states.push(s.status),
    })
    const state = await runAgentLoop('run-5', 'sess-5', 'list files', deps)

    expect(state.status).toBe('completed')
    expect(states).toContain('running')
  })
})

describe('runAgentLoop — cancellation', () => {
  it('returns cancelled when isCancelled is true before planning', async () => {
    const client = fakeClient([])
    const state = await runAgentLoop(
      'run-6',
      'sess-6',
      'goal',
      baseDeps(client, [SAFE_TOOL], { isCancelled: () => true }),
    )

    expect(state.status).toBe('cancelled')
  })

  it('returns cancelled when isCancelled becomes true during execution', async () => {
    const plan = JSON.stringify({
      goal: 'multi step',
      steps: [
        { toolId: 'files.list', params: {} },
        { toolId: 'files.list', params: {} },
      ],
    })

    let callCount = 0
    const client = fakeClient([plan, '{"decision":"continue"}'])

    // Cancel after first tool execution
    const state = await runAgentLoop(
      'run-7',
      'sess-7',
      'multi step',
      baseDeps(client, [SAFE_TOOL], {
        isCancelled: () => callCount >= 1,
        executeTool: async () => {
          callCount++
          return { outcome: 'cancelled' }
        },
      }),
    )

    expect(state.status).toBe('cancelled')
  })
})

describe('runAgentLoop — revised steps validation', () => {
  it('ignores revised steps that reference unknown tool IDs', async () => {
    const plan = JSON.stringify({
      goal: 'test revision',
      steps: [{ toolId: 'files.list', params: {} }],
    })
    // Reflector tries to inject an unknown tool in revised steps
    const reflection = JSON.stringify({
      decision: 'continue',
      revisedRemainingSteps: [{ toolId: 'evil.unknown', params: {} }],
    })
    const finalReflection = JSON.stringify({ decision: 'done', answer: 'Done.' })
    const client = fakeClient([plan, reflection, finalReflection])

    const state = await runAgentLoop('run-8', 'sess-8', 'test revision', baseDeps(client))

    // Should complete — the bad revised steps are silently discarded
    expect(state.status).toBe('completed')
    // Verify evil tool was never executed
    const executedTools: string[] = []
    const deps = baseDeps(fakeClient([plan, reflection, finalReflection]), [SAFE_TOOL], {
      executeTool: async (toolId) => {
        executedTools.push(toolId)
        return { outcome: 'success' }
      },
    })
    await runAgentLoop('run-9', 'sess-9', 'test revision', deps)
    expect(executedTools).not.toContain('evil.unknown')
  })
})
