import { describe, expect, it } from 'vitest'
import { checkModelHealth, formatMissingModelHints } from './model-health'
import type { OllamaClient } from './client'
import type { ModelConfig } from './router'

function fakeClientWithModels(models: string[]): OllamaClient {
  return {
    listModels: async () => models,
  } as unknown as OllamaClient
}

function unreachableClient(): OllamaClient {
  return {
    listModels: async () => {
      throw new Error('ECONNREFUSED')
    },
  } as unknown as OllamaClient
}

const balancedConfig: ModelConfig = {
  classifier: 'phi4-mini:3.8b',
  summarize: 'phi4-mini:3.8b',
  extract: 'phi4-mini:3.8b',
  chat: 'qwen3:8b',
  agent: 'qwen3:8b',
  rag: 'qwen3:8b',
  news_synthesis: 'qwen3:8b',
  tool_call: 'qwen3:8b',
  coding: 'qwen2.5-coder:7b',
  embed: 'nomic-embed-text',
}

describe('checkModelHealth', () => {
  it('reports all models installed when Ollama has them', async () => {
    const client = fakeClientWithModels([
      'phi4-mini:3.8b',
      'qwen3:8b',
      'qwen2.5-coder:7b',
      'nomic-embed-text',
    ])
    const report = await checkModelHealth(client, balancedConfig)
    expect(report.ollamaReachable).toBe(true)
    expect(report.missing).toHaveLength(0)
    expect(report.installed).toContain('phi4-mini:3.8b')
    expect(report.installed).toContain('qwen3:8b')
  })

  it('reports missing models and generates pull commands', async () => {
    const client = fakeClientWithModels(['phi4-mini:3.8b']) // qwen3:8b and nomic missing
    const report = await checkModelHealth(client, balancedConfig)
    expect(report.missing).toContain('qwen3:8b')
    expect(report.missing).toContain('nomic-embed-text')
    expect(report.pullCommands).toContain('ollama pull qwen3:8b')
    expect(report.pullCommands).toContain('ollama pull nomic-embed-text')
  })

  it('returns ollamaReachable: false when Ollama is down', async () => {
    const report = await checkModelHealth(unreachableClient(), balancedConfig)
    expect(report.ollamaReachable).toBe(false)
    expect(report.missing).toHaveLength(0)
    expect(report.pullCommands).toHaveLength(0)
  })

  it('handles Ollama returning tag-suffixed names (e.g. nomic-embed-text:latest)', async () => {
    const client = fakeClientWithModels([
      'phi4-mini:3.8b',
      'qwen3:8b',
      'qwen2.5-coder:7b',
      'nomic-embed-text:latest',
    ])
    const report = await checkModelHealth(client, balancedConfig)
    expect(report.missing).toHaveLength(0)
  })
})

describe('formatMissingModelHints', () => {
  it('returns a "start ollama" message when unreachable', () => {
    const hints = formatMissingModelHints({
      ollamaReachable: false,
      installed: [],
      missing: [],
      pullCommands: [],
    })
    expect(hints).toContain('ollama serve')
  })

  it('returns "all installed" when nothing is missing', () => {
    const hints = formatMissingModelHints({
      ollamaReachable: true,
      installed: ['phi4-mini:3.8b'],
      missing: [],
      pullCommands: [],
    })
    expect(hints).toContain('All required models are installed')
  })

  it('includes pull commands and VRAM warning when models are missing', () => {
    const hints = formatMissingModelHints({
      ollamaReachable: true,
      installed: [],
      missing: ['qwen3:8b'],
      pullCommands: ['ollama pull qwen3:8b'],
    })
    expect(hints).toContain('ollama pull qwen3:8b')
    expect(hints).toContain('8 GB VRAM')
  })
})
