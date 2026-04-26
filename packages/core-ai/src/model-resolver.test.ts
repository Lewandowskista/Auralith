import { describe, expect, it } from 'vitest'
import { resolveModelConfig } from './model-resolver'

describe('resolveModelConfig', () => {
  it('classifier → phi4-mini:3.8b + ctx 1024', () => {
    const cfg = resolveModelConfig('classifier')
    expect(cfg.model).toBe('phi4-mini:3.8b')
    expect(cfg.num_ctx).toBe(1024)
  })

  it('news_synthesis → qwen3:8b + ctx 4096', () => {
    const cfg = resolveModelConfig('news_synthesis')
    expect(cfg.model).toBe('qwen3:8b')
    expect(cfg.num_ctx).toBe(4096)
  })

  it('rag → qwen3:8b + ctx 6144', () => {
    const cfg = resolveModelConfig('rag')
    expect(cfg.model).toBe('qwen3:8b')
    expect(cfg.num_ctx).toBe(6144)
  })

  it('unknown role → fallback qwen3:8b + ctx 4096', () => {
    const cfg = resolveModelConfig('nonexistent_role')
    expect(cfg.model).toBe('qwen3:8b')
    expect(cfg.num_ctx).toBe(4096)
  })

  it('override num_ctx takes priority over default', () => {
    const cfg = resolveModelConfig('news_synthesis', { num_ctx: 6144 })
    expect(cfg.num_ctx).toBe(6144)
    expect(cfg.model).toBe('qwen3:8b')
  })

  it('override model takes priority over default', () => {
    const cfg = resolveModelConfig('classifier', { model: 'qwen3:8b' })
    expect(cfg.model).toBe('qwen3:8b')
    expect(cfg.num_ctx).toBe(1024)
  })

  it('clamp prevents values below MIN_CTX (512)', () => {
    const cfg = resolveModelConfig('classifier', { num_ctx: 64 })
    expect(cfg.num_ctx).toBe(512)
  })

  it('clamp prevents values above MAX_CTX (8192)', () => {
    const cfg = resolveModelConfig('rag', { num_ctx: 99999 })
    expect(cfg.num_ctx).toBe(8192)
  })
})
