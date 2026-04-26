import { describe, it, expect, vi } from 'vitest'
import { createWeatherContextProvider } from '../providers/weather-context-provider'
import { createNewsContextProvider } from '../providers/news-context-provider'
import { createActivityContextProvider } from '../providers/activity-context-provider'
import { createKnowledgeContextProvider } from '../providers/knowledge-context-provider'
import { createSuggestionsContextProvider } from '../providers/suggestions-context-provider'
import { createRoutinesContextProvider } from '../providers/routines-context-provider'
import type { AppContextRequest } from '../types'

const baseRequest = (caps: string[]): AppContextRequest => ({
  intent: 'chat',
  userInput: 'test',
  requestedCapabilities: caps as never,
  maxChars: 4000,
  isCloudModel: false,
})

// ── Weather Provider ───────────────────────────────────────────────────────────

describe('Weather Context Provider', () => {
  it('returns fresh weather context', async () => {
    const provider = createWeatherContextProvider({
      getBriefing: vi.fn().mockResolvedValue({
        summary: 'Mild day with light clouds.',
        alertLevel: 'none',
        temp: 18,
        description: 'Partly cloudy',
      }),
      getCurrent: vi.fn().mockResolvedValue({
        temperature_2m: 18,
        apparent_temperature: 16,
        weather_code: 3,
        wind_speed_10m: 12,
        relative_humidity_2m: 65,
        is_day: 1,
        time: '2026-04-25T10:00',
      }),
      getForecast: vi.fn().mockResolvedValue({
        daily: [
          {
            date: '2026-04-25',
            weather_code: 3,
            temperature_2m_max: 20,
            temperature_2m_min: 12,
            precipitation_probability_max: 10,
          },
        ],
        fetchedAt: Date.now(),
      }),
      getLocationLabel: () => 'Bucharest',
    })

    const result = await provider.getContext(baseRequest(['weather']))
    expect(result.freshness).toBe('fresh')
    expect(result.promptText).toContain('### Weather')
    expect(result.promptText).toContain('Bucharest')
    expect(result.promptText).toContain('Mild day with light clouds.')
    expect(result.charCount).toBeGreaterThan(0)
  })

  it('returns missing status when no location set', async () => {
    const provider = createWeatherContextProvider({
      getBriefing: vi.fn().mockRejectedValue(new Error('No location configured')),
      getCurrent: vi.fn().mockRejectedValue(new Error('No location')),
      getForecast: vi.fn().mockRejectedValue(new Error('No location')),
    })

    const result = await provider.getContext(baseRequest(['weather']))
    expect(result.freshness).toBe('missing')
    expect(result.promptText).toBe('')
    expect(result.suggestedRefreshAction).toBe('weather.getBriefing')
  })

  it('excludes context in cloud model mode', async () => {
    const provider = createWeatherContextProvider({
      getBriefing: vi.fn(),
      getCurrent: vi.fn(),
      getForecast: vi.fn(),
    })

    const cloudRequest: AppContextRequest = { ...baseRequest(['weather']), isCloudModel: true }
    const result = await provider.getContext(cloudRequest)
    expect(result.freshness).toBe('missing')
    expect(result.warnings.some((w) => w.includes('cloud model'))).toBe(true)
  })

  it('marks stale when fetchedAt is older than 1 hour', async () => {
    const provider = createWeatherContextProvider({
      getBriefing: vi.fn().mockResolvedValue({
        summary: 'Old weather.',
        alertLevel: 'none',
        temp: 15,
      }),
      getCurrent: vi.fn().mockRejectedValue(new Error('skip')),
      getForecast: vi.fn().mockResolvedValue({
        daily: [],
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      }),
    })

    const result = await provider.getContext(baseRequest(['weather']))
    expect(result.freshness).toBe('stale')
    expect(result.warnings.some((w) => w.includes('stale'))).toBe(true)
  })
})

// ── News Provider ──────────────────────────────────────────────────────────────

describe('News Context Provider', () => {
  it('returns news clusters in TOON format', async () => {
    const provider = createNewsContextProvider({
      listTopics: vi.fn().mockResolvedValue([{ id: 't1', name: 'Technology', slug: 'tech' }]),
      listClusters: vi.fn().mockResolvedValue([
        {
          id: 'c1',
          topicName: 'Technology',
          label: 'AI regulation update',
          summary: 'Governments debate new AI rules.',
          itemCount: 5,
          importance: 'high',
          latestAt: Date.now(),
        },
      ]),
      getUnreadCount: vi.fn().mockResolvedValue(1),
    })

    const result = await provider.getContext(baseRequest(['news']))
    expect(result.freshness).toBe('fresh')
    expect(result.promptText).toContain('### News')
    expect(result.promptText).toContain('Technology')
    expect(result.promptText).toContain('AI regulation update')
    expect(result.charCount).toBeGreaterThan(0)
  })

  it('returns missing status with refresh suggestion when no clusters', async () => {
    const provider = createNewsContextProvider({
      listTopics: vi.fn().mockResolvedValue([]),
      listClusters: vi.fn().mockResolvedValue([]),
      getUnreadCount: vi.fn().mockResolvedValue(0),
    })

    const result = await provider.getContext(baseRequest(['news']))
    expect(result.freshness).toBe('missing')
    expect(result.suggestedRefreshAction).toBe('news.triggerFetch')
  })

  it('excludes in cloud mode', async () => {
    const provider = createNewsContextProvider({
      listTopics: vi.fn(),
      listClusters: vi.fn(),
    })

    const result = await provider.getContext({ ...baseRequest(['news']), isCloudModel: true })
    expect(result.freshness).toBe('missing')
    expect(result.warnings.some((w) => w.includes('cloud model'))).toBe(true)
  })

  it('includes context contract instruction when articles are present', async () => {
    const provider = createNewsContextProvider({
      listTopics: vi.fn().mockResolvedValue([{ id: 't1', name: 'Technology', slug: 'tech' }]),
      listClusters: vi.fn().mockResolvedValue([
        {
          id: 'c1',
          topicName: 'Technology',
          label: 'AI regulation update',
          summary: 'Governments debate new AI rules.',
          itemCount: 3,
          importance: 'high',
          latestAt: Date.now(),
        },
      ]),
      listArticles: vi.fn().mockResolvedValue([
        {
          id: 'a1',
          title: 'EU Parliament votes on landmark AI safety regulation',
          source: 'Reuters',
          publishedAt: Date.now() - 2 * 60 * 60 * 1000,
          clusterId: 'c1',
        },
      ]),
    })

    const result = await provider.getContext(baseRequest(['news']))
    expect(result.promptText).toContain('INSTRUCTION:')
    expect(result.promptText).toContain('news_items titles')
    expect(result.promptText).toContain('EU Parliament votes on landmark AI safety regulation')
  })

  it('filters articles missing title, source, or timestamp', async () => {
    const provider = createNewsContextProvider({
      listTopics: vi.fn().mockResolvedValue([]),
      listClusters: vi.fn().mockResolvedValue([
        {
          id: 'c1',
          topicName: 'Tech',
          label: 'Some cluster',
          summary: 'A summary.',
          itemCount: 2,
          importance: 'medium',
          latestAt: Date.now(),
        },
      ]),
      listArticles: vi.fn().mockResolvedValue([
        // valid
        {
          id: 'a1',
          title: 'Valid Article Title Here',
          source: 'BBC',
          publishedAt: Date.now() - 60000,
          clusterId: 'c1',
        },
        // invalid — no title
        {
          id: 'a2',
          title: '',
          source: 'Reuters',
          publishedAt: Date.now() - 120000,
          clusterId: 'c1',
        },
        // invalid — no source
        {
          id: 'a3',
          title: 'Another Valid Title',
          source: '',
          publishedAt: Date.now() - 180000,
          clusterId: 'c1',
        },
        // invalid — no timestamp
        { id: 'a4', title: 'Yet Another Title', source: 'AP', publishedAt: null, clusterId: 'c1' },
      ]),
    })

    const result = await provider.getContext(baseRequest(['news']))
    expect(result.promptText).toContain('Valid Article Title Here')
    expect(result.promptText).not.toContain('Another Valid Title')
    expect(result.promptText).not.toContain('Yet Another Title')
    expect(result.warnings.some((w) => w.includes('filtered'))).toBe(true)
  })

  it('includes articles sorted by importance (high-importance clusters come first in TOON)', async () => {
    const now = Date.now()
    const provider = createNewsContextProvider({
      listTopics: vi.fn().mockResolvedValue([{ id: 't1', name: 'Tech', slug: 'tech' }]),
      listClusters: vi.fn().mockResolvedValue([
        {
          id: 'c1',
          topicName: 'Tech',
          label: 'High importance story',
          summary: 'Major event.',
          itemCount: 2,
          importance: 'high',
          latestAt: now,
        },
        {
          id: 'c2',
          topicName: 'Tech',
          label: 'Low importance story',
          summary: 'Minor event.',
          itemCount: 1,
          importance: 'low',
          latestAt: now - 3600000,
        },
      ]),
      listArticles: vi.fn().mockResolvedValue([
        {
          id: 'a1',
          title: 'High Priority Breaking News',
          source: 'Reuters',
          publishedAt: now,
          clusterId: 'c1',
        },
        {
          id: 'a2',
          title: 'Low Priority Story Today',
          source: 'AP',
          publishedAt: now - 3600000,
          clusterId: 'c2',
        },
      ]),
    })

    const result = await provider.getContext(baseRequest(['news']))
    // Both titles should appear in context
    expect(result.promptText).toContain('High Priority Breaking News')
    expect(result.promptText).toContain('Low Priority Story Today')
    // high importance cluster should appear before low
    expect(result.promptText.indexOf('high')).toBeLessThan(result.promptText.indexOf('low'))
  })

  it('omits contract instruction and news_items block when no valid articles exist', async () => {
    const provider = createNewsContextProvider({
      listTopics: vi.fn().mockResolvedValue([]),
      listClusters: vi
        .fn()
        .mockResolvedValue([
          {
            id: 'c1',
            topicName: 'Tech',
            label: 'Some cluster',
            summary: 'A summary.',
            itemCount: 1,
            importance: 'medium',
            latestAt: Date.now(),
          },
        ]),
      listArticles: vi.fn().mockResolvedValue([]),
    })

    const result = await provider.getContext(baseRequest(['news']))
    expect(result.promptText).not.toContain('INSTRUCTION:')
    expect(result.promptText).not.toContain('news_items')
  })
})

// ── Activity Provider ──────────────────────────────────────────────────────────

describe('Activity Context Provider', () => {
  it('sanitizes file paths', async () => {
    const provider = createActivityContextProvider({
      queryEvents: vi.fn().mockResolvedValue([
        {
          id: 'e1',
          ts: Date.now(),
          kind: 'file.edit',
          path: 'C:\\Users\\Stefan\\Documents\\project\\README.md',
        },
      ]),
      listSessions: vi.fn().mockResolvedValue([]),
    })

    const result = await provider.getContext(baseRequest(['activity']))
    expect(result.promptText).not.toContain('Stefan')
    expect(result.promptText).toContain('~/Documents')
  })

  it('uses custom sanitizer when provided', async () => {
    const provider = createActivityContextProvider({
      queryEvents: vi
        .fn()
        .mockResolvedValue([
          { id: 'e1', ts: Date.now(), kind: 'file.edit', path: '/home/user/secret/file.ts' },
        ]),
      listSessions: vi.fn().mockResolvedValue([]),
      sanitizePath: (p) => p.replace('/home/user/secret', '[REDACTED]'),
    })

    const result = await provider.getContext(baseRequest(['activity']))
    expect(result.promptText).toContain('[REDACTED]')
    expect(result.promptText).not.toContain('/home/user/secret')
  })

  it('returns missing status when no events', async () => {
    const provider = createActivityContextProvider({
      queryEvents: vi.fn().mockResolvedValue([]),
      listSessions: vi.fn().mockResolvedValue([]),
    })

    const result = await provider.getContext(baseRequest(['activity']))
    expect(result.freshness).toBe('missing')
  })

  it('excludes in cloud mode', async () => {
    const provider = createActivityContextProvider({
      queryEvents: vi.fn(),
      listSessions: vi.fn(),
    })

    const result = await provider.getContext({ ...baseRequest(['activity']), isCloudModel: true })
    expect(result.freshness).toBe('missing')
    expect(result.warnings.some((w) => w.includes('cloud model'))).toBe(true)
  })
})

// ── Knowledge Provider ─────────────────────────────────────────────────────────

describe('Knowledge Context Provider', () => {
  it('wraps long chunks in XML blocks', async () => {
    const provider = createKnowledgeContextProvider({
      search: vi.fn().mockResolvedValue([
        {
          chunkId: 'ch1',
          docId: 'd1',
          docPath: '/notes/design.md',
          docTitle: 'Design Notes',
          headingPath: 'Architecture',
          charStart: 0,
          charEnd: 300,
          text: 'A'.repeat(300),
          score: 0.85,
        },
      ]),
      listSpaces: vi.fn().mockResolvedValue([{ id: 's1', name: 'Personal', slug: 'personal' }]),
    })

    const result = await provider.getContext(baseRequest(['knowledge']))
    expect(result.promptText).toContain('<chunk')
    expect(result.promptText).toContain('[^n] citation numbers')
  })

  it('uses inline format for short chunks', async () => {
    const provider = createKnowledgeContextProvider({
      search: vi.fn().mockResolvedValue([
        {
          chunkId: 'ch1',
          docId: 'd1',
          docPath: '/notes/short.md',
          docTitle: 'Short',
          charStart: 0,
          charEnd: 50,
          text: 'Brief note.',
          score: 0.9,
        },
      ]),
      listSpaces: vi.fn().mockResolvedValue([{ id: 's1', name: 'Personal', slug: 'personal' }]),
    })

    const result = await provider.getContext(baseRequest(['knowledge']))
    expect(result.promptText).toContain('[^1]')
    expect(result.promptText).toContain('Brief note.')
  })

  it('excludes in cloud mode', async () => {
    const provider = createKnowledgeContextProvider({
      search: vi.fn(),
      listSpaces: vi.fn(),
    })

    const result = await provider.getContext({ ...baseRequest(['knowledge']), isCloudModel: true })
    expect(result.freshness).toBe('missing')
  })

  it('returns missing when no hits', async () => {
    const provider = createKnowledgeContextProvider({
      search: vi.fn().mockResolvedValue([]),
      listSpaces: vi.fn().mockResolvedValue([{ id: 's1', name: 'Personal', slug: 'personal' }]),
    })

    const result = await provider.getContext(baseRequest(['knowledge']))
    expect(result.charCount).toBe(0)
  })
})

// ── Suggestions Provider ───────────────────────────────────────────────────────

describe('Suggestions Context Provider', () => {
  it('lists open suggestions', async () => {
    const provider = createSuggestionsContextProvider({
      listOpen: vi.fn().mockResolvedValue([
        {
          id: 'sug-001',
          kind: 'morning_brief',
          title: 'Morning Briefing Ready',
          body: 'Your daily briefing is ready.',
          status: 'open',
          createdAt: Date.now(),
        },
      ]),
    })

    const result = await provider.getContext(baseRequest(['suggestions']))
    expect(result.promptText).toContain('Morning Brief')
    expect(result.freshness).toBe('fresh')
  })

  it('returns empty when no open suggestions', async () => {
    const provider = createSuggestionsContextProvider({
      listOpen: vi.fn().mockResolvedValue([]),
    })

    const result = await provider.getContext(baseRequest(['suggestions']))
    expect(result.charCount).toBe(0)
    expect(result.freshness).toBe('fresh')
  })
})

// ── Routines Provider ──────────────────────────────────────────────────────────

describe('Routines Context Provider', () => {
  it('lists routines with status', async () => {
    const provider = createRoutinesContextProvider({
      list: vi.fn().mockResolvedValue([
        {
          id: 'rtn-001',
          name: 'Archive Downloads',
          description: 'Move old downloads to archive.',
          triggerKind: 'schedule',
          enabled: true,
          createdAt: Date.now() - 86400000,
          lastRunAt: Date.now() - 3600000,
          lastRunStatus: 'success',
        },
      ]),
    })

    const result = await provider.getContext(baseRequest(['routines']))
    expect(result.promptText).toContain('Archive Downloads')
    expect(result.promptText).toContain('enabled')
    expect(result.warnings.some((w) => w.includes('confirmation'))).toBe(true)
  })

  it('returns empty when no routines', async () => {
    const provider = createRoutinesContextProvider({
      list: vi.fn().mockResolvedValue([]),
    })

    const result = await provider.getContext(baseRequest(['routines']))
    expect(result.charCount).toBe(0)
  })
})
