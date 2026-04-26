import { describe, it, expect, vi } from 'vitest'
import { createAppContextBroker } from '../broker'
import type { AppContextProvider, AppContextRequest, AppContextProviderResult } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProvider(
  capability: AppContextProvider['capability'],
  result: Partial<AppContextProviderResult>,
): AppContextProvider {
  return {
    capability,
    canHandle: (req: AppContextRequest) => req.requestedCapabilities.includes(capability),
    getContext: vi.fn().mockResolvedValue({
      capability,
      promptText: `### ${capability}\nsome context`,
      charCount: 30,
      freshness: 'fresh',
      warnings: [],
      source: `core-${capability}`,
      ...result,
    } satisfies AppContextProviderResult),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App Context Broker', () => {
  it('returns empty snapshot when disabled', async () => {
    const broker = createAppContextBroker({
      providers: [makeProvider('weather', {})],
      config: { enabled: false },
    })
    const snapshot = await broker.buildSnapshot({ classifiedIntent: 'chat', userInput: 'hello' })
    expect(snapshot.capabilitiesIncluded).toHaveLength(0)
    expect(snapshot.promptContext).toBe('')
  })

  it('selects weather provider for weather question', async () => {
    const weatherProvider = makeProvider('weather', {})
    const newsProvider = makeProvider('news', {})
    const broker = createAppContextBroker({ providers: [weatherProvider, newsProvider] })

    await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: "What's the weather today?",
    })

    expect(weatherProvider.getContext).toHaveBeenCalled()
    expect(newsProvider.getContext).not.toHaveBeenCalled()
  })

  it('selects news provider for news question', async () => {
    const weatherProvider = makeProvider('weather', {})
    const newsProvider = makeProvider('news', {})
    const broker = createAppContextBroker({ providers: [weatherProvider, newsProvider] })

    await broker.buildSnapshot({
      classifiedIntent: 'news',
      userInput: "What's in the news?",
    })

    expect(newsProvider.getContext).toHaveBeenCalled()
    expect(weatherProvider.getContext).not.toHaveBeenCalled()
  })

  it('selects weather + news for briefing question', async () => {
    const weatherProvider = makeProvider('weather', {})
    const newsProvider = makeProvider('news', {})
    const broker = createAppContextBroker({ providers: [weatherProvider, newsProvider] })

    await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: 'Give me my morning briefing',
    })

    expect(weatherProvider.getContext).toHaveBeenCalled()
    expect(newsProvider.getContext).toHaveBeenCalled()
  })

  it('selects activity provider for work-history question', async () => {
    const activityProvider = makeProvider('activity', {})
    const broker = createAppContextBroker({ providers: [activityProvider] })

    await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: 'What was I working on earlier today?',
    })

    expect(activityProvider.getContext).toHaveBeenCalled()
  })

  it('selects knowledge provider for document question', async () => {
    const knowledgeProvider = makeProvider('knowledge', {})
    const broker = createAppContextBroker({ providers: [knowledgeProvider] })

    await broker.buildSnapshot({
      classifiedIntent: 'rag',
      userInput: 'Search my documents for architecture notes',
    })

    expect(knowledgeProvider.getContext).toHaveBeenCalled()
  })

  it('excludes capability when capabilityEnabled is false', async () => {
    const weatherProvider = makeProvider('weather', {})
    const broker = createAppContextBroker({
      providers: [weatherProvider],
      config: { capabilityEnabled: { weather: false } },
    })

    await broker.buildSnapshot({ classifiedIntent: 'chat', userInput: "What's the weather?" })

    expect(weatherProvider.getContext).not.toHaveBeenCalled()
  })

  it('excludes high-privacy capabilities in cloud mode', async () => {
    const activityProvider = makeProvider('activity', {})
    const knowledgeProvider = makeProvider('knowledge', {})
    const broker = createAppContextBroker({
      providers: [activityProvider, knowledgeProvider],
      config: { isCloudModel: true },
    })

    await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: 'What was I working on? Also search my documents.',
    })

    expect(activityProvider.getContext).not.toHaveBeenCalled()
    expect(knowledgeProvider.getContext).not.toHaveBeenCalled()
  })

  it('sets hadCloudRestrictions when cloud mode blocks capabilities', async () => {
    const activityProvider = makeProvider('activity', {})
    const broker = createAppContextBroker({
      providers: [activityProvider],
      config: { isCloudModel: true },
    })

    const snapshot = await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: 'What did I work on?',
    })

    expect(snapshot.hadCloudRestrictions).toBe(true)
  })

  it('respects maxChars budget', async () => {
    const bigProvider = makeProvider('weather', {
      promptText: 'x'.repeat(5000),
      charCount: 5000,
    })
    const broker = createAppContextBroker({
      providers: [bigProvider],
      config: { maxChars: 100 },
    })

    const snapshot = await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: "What's the weather?",
    })

    expect(snapshot.totalChars).toBeLessThanOrEqual(500) // header + truncated
  })

  it('handles stale data and includes suggestedRefreshAction', async () => {
    const staleProvider = makeProvider('weather', {
      freshness: 'stale',
      promptText: '### Weather\nold data',
      charCount: 20,
      suggestedRefreshAction: 'weather.getBriefing',
      warnings: ['Weather data may be stale (>1 hour old). Refresh recommended.'],
    })
    const broker = createAppContextBroker({ providers: [staleProvider] })

    const snapshot = await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: "What's the weather?",
    })

    expect(snapshot.freshness['weather']?.status).toBe('stale')
    expect(snapshot.suggestedRefreshActions).toContain('weather.getBriefing')
  })

  it('handles missing data gracefully', async () => {
    const missingProvider = makeProvider('news', {
      promptText: '',
      charCount: 0,
      freshness: 'missing',
      warnings: ['No news clusters available.'],
      suggestedRefreshAction: 'news.triggerFetch',
    })
    const broker = createAppContextBroker({ providers: [missingProvider] })

    const snapshot = await broker.buildSnapshot({
      classifiedIntent: 'news',
      userInput: "What's in the news?",
    })

    expect(snapshot.capabilitiesIncluded).not.toContain('news')
    expect(snapshot.suggestedRefreshActions).toContain('news.triggerFetch')
    expect(snapshot.warnings).toContain('No news clusters available.')
  })

  it('continues despite provider failure', async () => {
    const failingProvider: AppContextProvider = {
      capability: 'weather',
      canHandle: () => true,
      getContext: vi.fn().mockRejectedValue(new Error('Ollama offline')),
    }
    const broker = createAppContextBroker({ providers: [failingProvider] })

    const snapshot = await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: "What's the weather?",
    })

    // Should not throw — should return empty snapshot with warning
    expect(snapshot.capabilitiesIncluded).not.toContain('weather')
    expect(snapshot.warnings.some((w) => w.includes('Provider error'))).toBe(true)
  })

  it('overrideCapabilities forces specific providers', async () => {
    const weatherProvider = makeProvider('weather', {})
    const newsProvider = makeProvider('news', {})
    const broker = createAppContextBroker({ providers: [weatherProvider, newsProvider] })

    await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: 'hello',
      overrideCapabilities: ['weather', 'news'],
    })

    expect(weatherProvider.getContext).toHaveBeenCalled()
    expect(newsProvider.getContext).toHaveBeenCalled()
  })

  it('promptContext includes Auralith App Context header when data present', async () => {
    const broker = createAppContextBroker({ providers: [makeProvider('weather', {})] })

    const snapshot = await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: "What's the weather?",
    })

    expect(snapshot.promptContext).toContain('## Auralith App Context')
    expect(snapshot.promptContext).toContain('source of truth')
  })

  it('promptContext is empty string when no data provided', async () => {
    const broker = createAppContextBroker({ providers: [] })

    const snapshot = await broker.buildSnapshot({
      classifiedIntent: 'chat',
      userInput: 'hello',
    })

    expect(snapshot.promptContext).toBe('')
  })
})
