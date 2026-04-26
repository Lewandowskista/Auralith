import { describe, expect, it } from 'vitest'
import { ModelRouter, MODEL_PRESETS, type ModelPresetName } from './router'
import type { OllamaClient } from './client'

const fakeClient = {} as OllamaClient

// ── Preset resolution ──────────────────────────────────────────────────────────

describe('ModelRouter — presets', () => {
  it('defaults to the balanced preset', () => {
    const router = new ModelRouter(fakeClient)
    expect(router.getActivePreset()).toBe('balanced')
    expect(router.modelFor('chat')).toBe('qwen3:8b')
    expect(router.modelFor('classifier')).toBe('phi4-mini:3.8b')
  })

  it('applies the fast preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('fast')
    expect(router.getActivePreset()).toBe('fast')
    expect(router.modelFor('chat')).toBe('phi4-mini:3.8b')
    expect(router.modelFor('agent')).toBe('qwen3:8b')
  })

  it('applies the quality preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('quality')
    expect(router.getActivePreset()).toBe('quality')
    expect(router.modelFor('summarize')).toBe('qwen3:8b')
    expect(router.modelFor('classifier')).toBe('phi4-mini:3.8b')
  })

  it('detects "custom" when an individual role is overridden after a preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('balanced')
    router.updateConfig({ chat: 'some-other-model:7b' })
    expect(router.getActivePreset()).toBe('custom')
  })

  it('applyPreset with overrides reports custom when override does not match any preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('fast', { chat: 'custom-chat:13b' })
    expect(router.getActivePreset()).toBe('custom')
  })

  it('returns all three preset definitions from getPresets()', () => {
    const router = new ModelRouter(fakeClient)
    const names = router.getPresets().map((p) => p.name)
    expect(names).toContain('fast')
    expect(names).toContain('balanced')
    expect(names).toContain('quality')
  })

  it('MODEL_PRESETS export has correct balanced config for original roles', () => {
    const balanced = MODEL_PRESETS.balanced.config
    expect(balanced.classifier).toBe('phi4-mini:3.8b')
    expect(balanced.chat).toBe('qwen3:8b')
    expect(balanced.agent).toBe('qwen3:8b')
    expect(balanced.embed).toBe('nomic-embed-text')
  })
})

// ── New role routing — balanced preset ────────────────────────────────────────

describe('ModelRouter — balanced preset new roles', () => {
  it('routes rag to qwen3:8b', () => {
    const router = new ModelRouter(fakeClient)
    expect(router.modelFor('rag')).toBe('qwen3:8b')
  })

  it('routes news_synthesis to qwen3:8b', () => {
    const router = new ModelRouter(fakeClient)
    expect(router.modelFor('news_synthesis')).toBe('qwen3:8b')
  })

  it('routes tool_call to qwen3:8b', () => {
    const router = new ModelRouter(fakeClient)
    expect(router.modelFor('tool_call')).toBe('qwen3:8b')
  })

  it('routes coding to qwen2.5-coder:7b', () => {
    const router = new ModelRouter(fakeClient)
    expect(router.modelFor('coding')).toBe('qwen2.5-coder:7b')
  })
})

// ── New role routing — fast preset ────────────────────────────────────────────

describe('ModelRouter — fast preset new roles', () => {
  it('routes rag to phi4-mini:3.8b in fast preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('fast')
    expect(router.modelFor('rag')).toBe('phi4-mini:3.8b')
  })

  it('routes news_synthesis to qwen3:8b even in fast preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('fast')
    expect(router.modelFor('news_synthesis')).toBe('qwen3:8b')
  })

  it('routes tool_call to qwen3:8b in fast preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('fast')
    expect(router.modelFor('tool_call')).toBe('qwen3:8b')
  })

  it('routes coding to qwen2.5-coder:7b in fast preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('fast')
    expect(router.modelFor('coding')).toBe('qwen2.5-coder:7b')
  })
})

// ── New role routing — quality preset ─────────────────────────────────────────

describe('ModelRouter — quality preset new roles', () => {
  it('routes rag to qwen3:8b in quality preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('quality')
    expect(router.modelFor('rag')).toBe('qwen3:8b')
  })

  it('routes news_synthesis to qwen3:8b in quality preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('quality')
    expect(router.modelFor('news_synthesis')).toBe('qwen3:8b')
  })

  it('routes tool_call to qwen3:8b in quality preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('quality')
    expect(router.modelFor('tool_call')).toBe('qwen3:8b')
  })

  it('routes coding to qwen2.5-coder:7b in quality preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('quality')
    expect(router.modelFor('coding')).toBe('qwen2.5-coder:7b')
  })
})

// ── Per-role override behavior ─────────────────────────────────────────────────

describe('ModelRouter — per-role overrides', () => {
  it('constructor overrides win over preset defaults', () => {
    const router = new ModelRouter(fakeClient, { chat: 'custom-chat:13b' })
    expect(router.modelFor('chat')).toBe('custom-chat:13b')
    expect(router.modelFor('classifier')).toBe('phi4-mini:3.8b')
  })

  it('updateConfig updates only the specified roles', () => {
    const router = new ModelRouter(fakeClient)
    router.updateConfig({ agent: 'qwen2.5-coder:7b' })
    expect(router.modelFor('agent')).toBe('qwen2.5-coder:7b')
    expect(router.modelFor('chat')).toBe('qwen3:8b')
  })

  it('can override a new role (coding) independently', () => {
    const router = new ModelRouter(fakeClient)
    router.updateConfig({ coding: 'qwen3:8b' })
    expect(router.modelFor('coding')).toBe('qwen3:8b')
    expect(router.modelFor('chat')).toBe('qwen3:8b')
    expect(router.getActivePreset()).toBe('custom')
  })

  it('can override rag role independently', () => {
    const router = new ModelRouter(fakeClient)
    router.updateConfig({ rag: 'phi4-mini:3.8b' })
    expect(router.modelFor('rag')).toBe('phi4-mini:3.8b')
    expect(router.getActivePreset()).toBe('custom')
  })

  it('can override tool_call role independently', () => {
    const router = new ModelRouter(fakeClient)
    router.updateConfig({ tool_call: 'phi4-mini:3.8b' })
    expect(router.modelFor('tool_call')).toBe('phi4-mini:3.8b')
    expect(router.getActivePreset()).toBe('custom')
  })

  it('getConfig returns a copy, not the internal reference', () => {
    const router = new ModelRouter(fakeClient)
    const cfg = router.getConfig()
    cfg.chat = 'mutated'
    expect(router.modelFor('chat')).toBe('qwen3:8b')
  })

  it('applyPreset with new-role override produces custom preset', () => {
    const router = new ModelRouter(fakeClient)
    router.applyPreset('balanced', { coding: 'qwen3:8b' })
    expect(router.modelFor('coding')).toBe('qwen3:8b')
    expect(router.getActivePreset()).toBe('custom')
  })
})

// ── Legacy model migration ─────────────────────────────────────────────────────

describe('ModelRouter — legacy model migration', () => {
  const legacyCases: Array<[string, string, ModelPresetName | 'custom']> = [
    ['llama3.2:3b', 'phi4-mini:3.8b', 'custom'],
    ['phi3:3.8b', 'phi4-mini:3.8b', 'balanced'],
    ['qwen2.5:7b-instruct', 'qwen3:8b', 'balanced'],
  ]

  it('migrates llama3.2:3b classifier to phi4-mini:3.8b', () => {
    const router = new ModelRouter(fakeClient, { classifier: 'llama3.2:3b' })
    expect(router.modelFor('classifier')).toBe('phi4-mini:3.8b')
  })

  it('migrates phi3:3.8b summarize to phi4-mini:3.8b', () => {
    const router = new ModelRouter(fakeClient, { summarize: 'phi3:3.8b' })
    expect(router.modelFor('summarize')).toBe('phi4-mini:3.8b')
  })

  it('migrates qwen2.5:7b-instruct chat to qwen3:8b and detects balanced preset', () => {
    const router = new ModelRouter(fakeClient, { chat: 'qwen2.5:7b-instruct' })
    expect(router.modelFor('chat')).toBe('qwen3:8b')
    expect(router.getActivePreset()).toBe('balanced')
  })

  void legacyCases
})

// ── Preset completeness — all 10 roles must be defined in every preset ─────────

describe('ModelRouter — preset completeness', () => {
  const ALL_ROLES = [
    'classifier',
    'chat',
    'summarize',
    'extract',
    'agent',
    'embed',
    'rag',
    'news_synthesis',
    'tool_call',
    'coding',
  ] as const

  for (const presetName of ['fast', 'balanced', 'quality'] as ModelPresetName[]) {
    it(`${presetName} preset defines all 10 roles`, () => {
      const router = new ModelRouter(fakeClient)
      router.applyPreset(presetName)
      for (const role of ALL_ROLES) {
        expect(router.modelFor(role), `${presetName}.${role}`).toBeTruthy()
      }
    })
  }

  it('default balanced config contains all 10 roles', () => {
    const router = new ModelRouter(fakeClient)
    const cfg = router.getConfig()
    expect(Object.keys(cfg)).toHaveLength(10)
  })
})
