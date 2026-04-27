import { describe, expect, it, beforeEach } from 'vitest'
import { z } from 'zod'
import { runPrompt, getJsonReliabilityStats, resetJsonReliabilityStats } from './runtime'
import type { OllamaClient, GenerateOpts } from './client'
import type { PromptContract } from './runtime'

function fakeClient(responses: string[]): OllamaClient {
  let i = 0
  return {
    generate: async (_opts: GenerateOpts) => responses[i++] ?? '{}',
  } as OllamaClient
}

const contract: PromptContract<{ label: string }> = {
  id: 'test.label',
  role: 'classifier',
  system: 'You label things.',
  userTemplate: (ctx) => `Label: ${ctx['input']}`,
  outputSchema: z.object({ label: z.string() }),
  maxTokens: 64,
  temperature: 0,
}

describe('runPrompt — JSON reliability tracking', () => {
  beforeEach(() => resetJsonReliabilityStats())

  it('increments successes on a valid response', async () => {
    const result = await runPrompt(
      contract,
      { input: 'apple' },
      fakeClient(['{"label":"fruit"}']),
      'phi4-mini:3.8b',
    )
    expect(result.ok).toBe(true)
    const stats = getJsonReliabilityStats()
    const stat = stats.find((s) => s.model === 'phi4-mini:3.8b' && s.role === 'classifier')
    expect(stat?.successes).toBe(1)
    expect(stat?.parseFailures).toBe(0)
    expect(stat?.validationFailures).toBe(0)
  })

  it('increments parseFailures when JSON is malformed (both attempts)', async () => {
    await runPrompt(
      contract,
      { input: 'x' },
      fakeClient(['not-json', 'also-not-json']),
      'test-model:3b',
    )
    const stats = getJsonReliabilityStats()
    const stat = stats.find((s) => s.model === 'test-model:3b')
    expect(stat).toBeDefined()
    // First attempt → parseFailure, retry attempt → parseFailure
    if (!stat) throw new Error('stat not found')
    expect(stat.parseFailures).toBeGreaterThanOrEqual(1)
  })

  it('increments validationFailures when JSON parses but schema fails', async () => {
    await runPrompt(
      contract,
      { input: 'x' },
      fakeClient(['{"wrong_key":123}', '{"also_wrong":true}']),
      'test-model:3b',
    )
    const stats = getJsonReliabilityStats()
    const stat = stats.find((s) => s.model === 'test-model:3b')
    expect(stat?.validationFailures).toBeGreaterThanOrEqual(1)
  })

  it('accumulates stats across multiple calls to the same model+role', async () => {
    await runPrompt(contract, { input: 'a' }, fakeClient(['{"label":"x"}']), 'phi4-mini:3.8b')
    await runPrompt(contract, { input: 'b' }, fakeClient(['{"label":"y"}']), 'phi4-mini:3.8b')
    const stats = getJsonReliabilityStats()
    const stat = stats.find((s) => s.model === 'phi4-mini:3.8b')
    expect(stat?.successes).toBe(2)
    expect(stat?.attempts).toBe(2)
  })

  it('resetJsonReliabilityStats clears all entries', async () => {
    await runPrompt(contract, { input: 'a' }, fakeClient(['{"label":"x"}']), 'phi4-mini:3.8b')
    resetJsonReliabilityStats()
    expect(getJsonReliabilityStats()).toHaveLength(0)
  })
})

describe('runPrompt — retry / repair path', () => {
  beforeEach(() => resetJsonReliabilityStats())

  it('succeeds on retry when first attempt returns invalid JSON', async () => {
    const result = await runPrompt(
      contract,
      { input: 'retry-test' },
      fakeClient(['not-json', '{"label":"repaired"}']),
      'repair-model:3b',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.label).toBe('repaired')
  })

  it('increments repairedJson when retry succeeds after first failure', async () => {
    await runPrompt(
      contract,
      { input: 'retry-test' },
      fakeClient(['not-json', '{"label":"repaired"}']),
      'repair-model:3b',
    )
    const stats = getJsonReliabilityStats()
    const stat = stats.find((s) => s.model === 'repair-model:3b')
    expect(stat?.repairedJson).toBe(1)
  })

  it('does not increment repairedJson when first attempt succeeds', async () => {
    await runPrompt(
      contract,
      { input: 'ok-test' },
      fakeClient(['{"label":"ok"}']),
      'repair-model:3b',
    )
    const stats = getJsonReliabilityStats()
    const stat = stats.find((s) => s.model === 'repair-model:3b')
    expect(stat?.repairedJson).toBe(0)
  })

  it('returns ok:false when both attempts fail', async () => {
    const result = await runPrompt(
      contract,
      { input: 'fail-test' },
      fakeClient(['not-json', 'also-not-json']),
      'repair-model:3b',
    )
    expect(result.ok).toBe(false)
    const stats = getJsonReliabilityStats()
    const stat = stats.find((s) => s.model === 'repair-model:3b')
    expect(stat?.repairedJson).toBe(0)
  })

  it('succeeds on retry when first attempt passes but schema validation fails', async () => {
    const result = await runPrompt(
      contract,
      { input: 'schema-retry' },
      fakeClient(['{"wrong_key":1}', '{"label":"fixed"}']),
      'repair-model:3b',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.label).toBe('fixed')
    const stat = getJsonReliabilityStats().find((s) => s.model === 'repair-model:3b')
    expect(stat?.repairedJson).toBe(1)
  })
})
