import { describe, it, expect } from 'vitest'
import { resolveContextCapabilities, getRequiredCapabilities } from '../intent-router'

describe('Intent to Context Router', () => {
  describe('resolveContextCapabilities', () => {
    it('"What\'s the weather?" selects weather capability', () => {
      const { capabilities } = resolveContextCapabilities('chat', "What's the weather?")
      expect(capabilities).toContain('weather')
    })

    it('"Do I need an umbrella?" selects weather capability', () => {
      const { capabilities } = resolveContextCapabilities('chat', 'Do I need an umbrella today?')
      expect(capabilities).toContain('weather')
    })

    it('"What\'s new in my news?" selects news capability', () => {
      const { capabilities } = resolveContextCapabilities('news', "What's new in my news?")
      expect(capabilities).toContain('news')
    })

    it('"Give me a morning briefing" selects weather + news', () => {
      const { capabilities } = resolveContextCapabilities('chat', 'Give me a morning briefing')
      expect(capabilities).toContain('weather')
      expect(capabilities).toContain('news')
    })

    it('"What was I working on earlier?" selects activity capability', () => {
      const { capabilities } = resolveContextCapabilities('chat', 'What was I working on earlier?')
      expect(capabilities).toContain('activity')
    })

    it('"Summarize my saved articles" selects news capability', () => {
      const { capabilities } = resolveContextCapabilities('news', 'Summarize my saved articles')
      expect(capabilities).toContain('news')
    })

    it('"Search my documents for X" selects knowledge capability', () => {
      const { capabilities } = resolveContextCapabilities(
        'rag',
        'Search my documents for design patterns',
      )
      expect(capabilities).toContain('knowledge')
    })

    it('rag intent always selects knowledge', () => {
      const { capabilities } = resolveContextCapabilities('rag', 'some query')
      expect(capabilities).toContain('knowledge')
    })

    it('routine intent selects routines', () => {
      const { capabilities } = resolveContextCapabilities('routine', 'show me my automations')
      expect(capabilities).toContain('routines')
    })

    it('settings intent selects settings', () => {
      const { capabilities } = resolveContextCapabilities(
        'settings',
        'what are my current settings',
      )
      expect(capabilities).toContain('settings')
    })

    it('generic chat with no domain keywords returns suggestions only', () => {
      const { capabilities } = resolveContextCapabilities('chat', 'hello how are you')
      expect(capabilities).not.toContain('weather')
      expect(capabilities).not.toContain('news')
      expect(capabilities).not.toContain('activity')
      expect(capabilities).not.toContain('knowledge')
    })

    it('weather keyword overrides generic chat intent', () => {
      const { resolvedIntent } = resolveContextCapabilities('chat', 'will it rain today?')
      expect(resolvedIntent).toBe('weather')
    })

    it('briefing keyword overrides news intent', () => {
      const { resolvedIntent } = resolveContextCapabilities('news', 'give me a morning briefing')
      expect(resolvedIntent).toBe('briefing')
    })

    it('does not override specific domain intents with keywords', () => {
      // If intent is already 'rag', keyword matching for chat stays as rag
      const { resolvedIntent } = resolveContextCapabilities('rag', 'what is the weather')
      expect(resolvedIntent).toBe('rag')
    })

    it('returns deduplicated capabilities', () => {
      const { capabilities } = resolveContextCapabilities('chat', 'morning briefing')
      const unique = new Set(capabilities)
      expect(capabilities.length).toBe(unique.size)
    })
  })

  describe('getRequiredCapabilities', () => {
    it('weather intent requires weather', () => {
      expect(getRequiredCapabilities('weather')).toContain('weather')
    })

    it('news intent requires news', () => {
      expect(getRequiredCapabilities('news')).toContain('news')
    })

    it('briefing intent requires weather and news', () => {
      const req = getRequiredCapabilities('briefing')
      expect(req).toContain('weather')
      expect(req).toContain('news')
    })

    it('rag intent requires knowledge', () => {
      expect(getRequiredCapabilities('rag')).toContain('knowledge')
    })

    it('activity intent requires activity', () => {
      expect(getRequiredCapabilities('activity')).toContain('activity')
    })

    it('unknown intent returns empty required', () => {
      expect(getRequiredCapabilities('unknown')).toHaveLength(0)
    })
  })
})
