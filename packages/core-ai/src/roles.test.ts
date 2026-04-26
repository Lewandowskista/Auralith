import { describe, expect, it } from 'vitest'
import {
  AI_ROLE_REGISTRY,
  getRoleDefinition,
  getBackgroundRoles,
  getStrictJsonRoles,
  getHighSafetyRoles,
} from './roles'
import type { ModelRole } from './router'

const ALL_ROLES: ModelRole[] = [
  'classifier', 'chat', 'summarize', 'extract', 'agent', 'embed',
  'rag', 'news_synthesis', 'tool_call', 'coding',
]

// ── Registry completeness ──────────────────────────────────────────────────────

describe('AI_ROLE_REGISTRY — completeness', () => {
  it('defines all 10 roles', () => {
    for (const role of ALL_ROLES) {
      expect(AI_ROLE_REGISTRY[role], `missing role: ${role}`).toBeDefined()
    }
  })

  it('every role has a non-empty defaultModel', () => {
    for (const def of Object.values(AI_ROLE_REGISTRY)) {
      expect(def.defaultModel, `${def.role}.defaultModel`).toBeTruthy()
    }
  })

  it('every role has a non-empty promptTemplateId', () => {
    for (const def of Object.values(AI_ROLE_REGISTRY)) {
      expect(def.promptTemplateId, `${def.role}.promptTemplateId`).toBeTruthy()
    }
  })

  it('every role has a positive maxInputCharsRecommended', () => {
    for (const def of Object.values(AI_ROLE_REGISTRY)) {
      expect(def.maxInputCharsRecommended, `${def.role}.maxInputCharsRecommended`).toBeGreaterThan(0)
    }
  })
})

// ── getRoleDefinition ──────────────────────────────────────────────────────────

describe('getRoleDefinition', () => {
  it('returns the correct definition for classifier', () => {
    const def = getRoleDefinition('classifier')
    expect(def.role).toBe('classifier')
    expect(def.defaultModel).toBe('phi4-mini:3.8b')
    expect(def.strictJson).toBe(true)
    expect(def.backgroundAllowed).toBe(false)
  })

  it('returns the correct definition for chat', () => {
    const def = getRoleDefinition('chat')
    expect(def.role).toBe('chat')
    expect(def.defaultModel).toBe('qwen3:8b')
    expect(def.queuePriority).toBe('foreground')
    expect(def.strictJson).toBe(true)
  })

  it('returns the correct definition for rag', () => {
    const def = getRoleDefinition('rag')
    expect(def.role).toBe('rag')
    expect(def.defaultModel).toBe('qwen3:8b')
    expect(def.outputMode).toBe('markdown')
    expect(def.strictJson).toBe(false)
    expect(def.backgroundAllowed).toBe(false)
  })

  it('returns the correct definition for news_synthesis', () => {
    const def = getRoleDefinition('news_synthesis')
    expect(def.role).toBe('news_synthesis')
    expect(def.defaultModel).toBe('qwen3:8b')
    expect(def.strictJson).toBe(true)
    expect(def.backgroundAllowed).toBe(true)
    expect(def.queuePriority).toBe('background')
  })

  it('returns the correct definition for tool_call', () => {
    const def = getRoleDefinition('tool_call')
    expect(def.role).toBe('tool_call')
    expect(def.defaultModel).toBe('qwen3:8b')
    expect(def.safetyLevel).toBe('high')
    expect(def.strictJson).toBe(true)
    expect(def.backgroundAllowed).toBe(false)
  })

  it('returns the correct definition for coding', () => {
    const def = getRoleDefinition('coding')
    expect(def.role).toBe('coding')
    expect(def.defaultModel).toBe('qwen2.5-coder:7b')
    expect(def.outputMode).toBe('markdown')
    expect(def.strictJson).toBe(false)
    expect(def.queuePriority).toBe('foreground')
  })

  it('returns the correct definition for embed', () => {
    const def = getRoleDefinition('embed')
    expect(def.role).toBe('embed')
    expect(def.outputMode).toBe('embedding')
    expect(def.contextFormat).toBe('plain')
    expect(def.strictJson).toBe(false)
    expect(def.backgroundAllowed).toBe(true)
  })
})

// ── Safety level constraints ───────────────────────────────────────────────────

describe('role safety levels', () => {
  it('agent has high safety level', () => {
    expect(getRoleDefinition('agent').safetyLevel).toBe('high')
  })

  it('tool_call has high safety level', () => {
    expect(getRoleDefinition('tool_call').safetyLevel).toBe('high')
  })

  it('chat has medium safety level', () => {
    expect(getRoleDefinition('chat').safetyLevel).toBe('medium')
  })

  it('classifier has low safety level', () => {
    expect(getRoleDefinition('classifier').safetyLevel).toBe('low')
  })

  it('embed has low safety level', () => {
    expect(getRoleDefinition('embed').safetyLevel).toBe('low')
  })

  it('getHighSafetyRoles returns agent and tool_call', () => {
    const highRoles = getHighSafetyRoles().map((r) => r.role)
    expect(highRoles).toContain('agent')
    expect(highRoles).toContain('tool_call')
    expect(highRoles).not.toContain('classifier')
    expect(highRoles).not.toContain('embed')
  })
})

// ── Queue priority ─────────────────────────────────────────────────────────────

describe('role queue priorities', () => {
  it('foreground roles include chat, agent, tool_call, classifier, rag, coding', () => {
    const foreground = Object.values(AI_ROLE_REGISTRY)
      .filter((r) => r.queuePriority === 'foreground')
      .map((r) => r.role)
    expect(foreground).toContain('chat')
    expect(foreground).toContain('agent')
    expect(foreground).toContain('tool_call')
    expect(foreground).toContain('classifier')
    expect(foreground).toContain('rag')
    expect(foreground).toContain('coding')
  })

  it('background roles include summarize, extract, news_synthesis, embed', () => {
    const background = Object.values(AI_ROLE_REGISTRY)
      .filter((r) => r.queuePriority === 'background')
      .map((r) => r.role)
    expect(background).toContain('summarize')
    expect(background).toContain('extract')
    expect(background).toContain('news_synthesis')
    expect(background).toContain('embed')
  })
})

// ── getBackgroundRoles ─────────────────────────────────────────────────────────

describe('getBackgroundRoles', () => {
  it('returns only roles where backgroundAllowed is true', () => {
    const bg = getBackgroundRoles()
    for (const def of bg) {
      expect(def.backgroundAllowed).toBe(true)
    }
  })

  it('includes summarize, extract, news_synthesis, embed', () => {
    const bgRoles = getBackgroundRoles().map((r) => r.role)
    expect(bgRoles).toContain('summarize')
    expect(bgRoles).toContain('extract')
    expect(bgRoles).toContain('news_synthesis')
    expect(bgRoles).toContain('embed')
  })

  it('excludes chat, agent, tool_call, rag, coding', () => {
    const bgRoles = getBackgroundRoles().map((r) => r.role)
    expect(bgRoles).not.toContain('chat')
    expect(bgRoles).not.toContain('agent')
    expect(bgRoles).not.toContain('tool_call')
    expect(bgRoles).not.toContain('rag')
    expect(bgRoles).not.toContain('coding')
  })
})

// ── getStrictJsonRoles ─────────────────────────────────────────────────────────

describe('getStrictJsonRoles', () => {
  it('returns only roles where strictJson is true', () => {
    const strict = getStrictJsonRoles()
    for (const def of strict) {
      expect(def.strictJson).toBe(true)
    }
  })

  it('includes classifier, chat, agent, tool_call, summarize, extract, news_synthesis', () => {
    const strictRoles = getStrictJsonRoles().map((r) => r.role)
    expect(strictRoles).toContain('classifier')
    expect(strictRoles).toContain('chat')
    expect(strictRoles).toContain('agent')
    expect(strictRoles).toContain('tool_call')
    expect(strictRoles).toContain('summarize')
    expect(strictRoles).toContain('extract')
    expect(strictRoles).toContain('news_synthesis')
  })

  it('excludes rag, coding, embed (non-JSON output)', () => {
    const strictRoles = getStrictJsonRoles().map((r) => r.role)
    expect(strictRoles).not.toContain('rag')
    expect(strictRoles).not.toContain('coding')
    expect(strictRoles).not.toContain('embed')
  })
})

// ── Context format ─────────────────────────────────────────────────────────────

describe('role context formats', () => {
  it('embed uses plain context format', () => {
    expect(getRoleDefinition('embed').contextFormat).toBe('plain')
  })

  it('agent uses toon context format for compact tool catalog', () => {
    expect(getRoleDefinition('agent').contextFormat).toBe('toon')
  })

  it('tool_call uses toon context format', () => {
    expect(getRoleDefinition('tool_call').contextFormat).toBe('toon')
  })

  it('news_synthesis uses toon context format for compact article list', () => {
    expect(getRoleDefinition('news_synthesis').contextFormat).toBe('toon')
  })

  it('extract uses xml context format for untrusted input', () => {
    expect(getRoleDefinition('extract').contextFormat).toBe('xml')
  })

  it('coding uses markdown context format', () => {
    expect(getRoleDefinition('coding').contextFormat).toBe('markdown')
  })

  it('rag uses auto context format (mixed short/long chunks)', () => {
    expect(getRoleDefinition('rag').contextFormat).toBe('auto')
  })
})
