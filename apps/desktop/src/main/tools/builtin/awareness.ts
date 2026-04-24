import { z } from 'zod'
import {
  buildWeatherBriefing,
  fetchWeather as fetchOpenMeteo,
  type WeatherPayload,
} from '@auralith/core-weather'
import {
  createAppUsageRepo,
  createClipboardRepo,
  createRoutinesRepo,
  createSettingsRepo,
  createSuggestionsRepo,
  type DbBundle,
  type SuggestionStatus,
} from '@auralith/core-db'
import { createNewsRepo } from '@auralith/core-news'
import { registerTool } from '@auralith/core-tools'

type WeatherLocation = { lat: number; lon: number; label?: string }

type NewsSummary = {
  topics: Array<{ id: string; name: string; slug: string }>
  clusters: Array<{
    id: string
    topicId: string
    summary: string
    itemCount: number
    createdAt: number
  }>
  items: Array<{
    id: string
    title: string
    url: string
    summary?: string
    publishedAt?: number
    saved: boolean
    read: boolean
  }>
  totalItems: number
}

type RoutineSummary = {
  id: string
  name: string
  enabled: boolean
  trigger: unknown
  action: unknown
  runCount: number
  lastRunAt?: number
  lastStatus?: string
}

type RoutineRunSummary = {
  id: string
  routineId: string
  ts: number
  outcome: string
  traceId?: string
}

type SuggestionSummary = {
  id: string
  kind: string
  title: string
  rationale: string
  tier: string
  status: string
  createdAt: number
}

type ClipboardSummary = {
  enabled: boolean
  items: Array<{
    id: string
    ts: number
    kind: string
    textPreview?: string
    charCount?: number
    redacted: boolean
  }>
}

type AppUsageSummary = Array<{
  id: string
  startedAt: number
  endedAt?: number
  bucket: string
  processName: string
  durationMs?: number
}>

type SettingsSummary = {
  areas: Array<{
    area: string
    enabled?: boolean
    configured?: boolean
    value?: string | number | boolean
  }>
}

export type AwarenessToolDeps = {
  namespace?: string
  getWeatherLocation: () => WeatherLocation | undefined
  fetchWeather: (lat: number, lon: number) => Promise<WeatherPayload>
  getNewsSummary: (opts: {
    topicId?: string
    unreadOnly?: boolean
    savedOnly?: boolean
    limit: number
  }) => NewsSummary
  getRoutines: (opts: { includeDisabled: boolean; limit: number }) => RoutineSummary[]
  getRoutineHistory: (opts: { routineId: string; limit: number }) => RoutineRunSummary[]
  getSuggestions: (opts: { status?: string; limit: number }) => SuggestionSummary[]
  getClipboardItems: (opts: { limit: number }) => ClipboardSummary
  getAppUsage: (opts: { after?: number; before?: number; limit: number }) => AppUsageSummary
  getSettingsSummary: () => SettingsSummary
}

function id(namespace: string | undefined, toolId: string): string {
  return namespace ? `${namespace}.${toolId}` : toolId
}

function resolveLocation(
  params: { lat?: number | undefined; lon?: number | undefined },
  deps: AwarenessToolDeps,
): WeatherLocation | undefined {
  if (params.lat !== undefined && params.lon !== undefined) {
    return { lat: params.lat, lon: params.lon }
  }
  return deps.getWeatherLocation()
}

function noWeatherLocation() {
  return {
    configured: false,
    message:
      'No weather location is set. Open the Weather screen and save a location before asking for local weather.',
  }
}

export function registerAwarenessTools(deps: AwarenessToolDeps): void {
  registerTool({
    id: id(deps.namespace, 'weather.getCurrent'),
    tier: 'safe',
    paramsSchema: z.object({ lat: z.number().optional(), lon: z.number().optional() }),
    resultSchema: z.unknown(),
    describeForModel:
      'Get current local weather from Auralith. Use this before answering temperature, feels-like, condition, humidity, or wind questions. If configured=false, tell the user to set a Weather location.',
    execute: async (params) => {
      const location = resolveLocation(params, deps)
      if (!location) return noWeatherLocation()
      const payload = await deps.fetchWeather(location.lat, location.lon)
      return {
        configured: true,
        location: location.label ?? `${location.lat},${location.lon}`,
        fetchedAt: payload.fetchedAt,
        current: payload.current,
      }
    },
  })

  registerTool({
    id: id(deps.namespace, 'weather.getForecast'),
    tier: 'safe',
    paramsSchema: z.object({
      lat: z.number().optional(),
      lon: z.number().optional(),
      days: z.number().int().min(1).max(7).default(7),
    }),
    resultSchema: z.unknown(),
    describeForModel:
      'Get Auralith local weather forecast for up to 7 days. Use for forecast, rain, high/low, sunrise, sunset, or planning questions.',
    execute: async (params) => {
      const location = resolveLocation(params, deps)
      if (!location) return noWeatherLocation()
      const payload = await deps.fetchWeather(location.lat, location.lon)
      return {
        configured: true,
        location: location.label ?? `${location.lat},${location.lon}`,
        fetchedAt: payload.fetchedAt,
        daily: payload.daily.slice(0, params.days ?? 7),
        hourly: payload.hourly,
      }
    },
  })

  registerTool({
    id: id(deps.namespace, 'weather.getBriefing'),
    tier: 'safe',
    paramsSchema: z.object({ lat: z.number().optional(), lon: z.number().optional() }),
    resultSchema: z.unknown(),
    describeForModel:
      'Get a concise Auralith weather briefing with alert level. Use for "weather today" and quick planning questions.',
    execute: async (params) => {
      const location = resolveLocation(params, deps)
      if (!location) return noWeatherLocation()
      const payload = await deps.fetchWeather(location.lat, location.lon)
      return {
        configured: true,
        location: location.label ?? `${location.lat},${location.lon}`,
        fetchedAt: payload.fetchedAt,
        ...buildWeatherBriefing(payload),
      }
    },
  })

  registerTool({
    id: id(deps.namespace, 'news.query'),
    tier: 'safe',
    paramsSchema: z.object({
      topicId: z.string().optional(),
      unreadOnly: z.boolean().optional(),
      savedOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(20).default(8),
    }),
    resultSchema: z.unknown(),
    describeForModel:
      'Query Auralith news topics, clusters, and recent items. Use for questions like "any news?", "what is unread?", or "what did my feeds find?".',
    execute: async (params) =>
      deps.getNewsSummary({
        ...(params.topicId !== undefined ? { topicId: params.topicId } : {}),
        unreadOnly: params.unreadOnly ?? false,
        savedOnly: params.savedOnly ?? false,
        limit: params.limit ?? 8,
      }),
  })

  registerTool({
    id: id(deps.namespace, 'routines.list'),
    tier: 'safe',
    paramsSchema: z.object({
      includeDisabled: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    resultSchema: z.unknown(),
    describeForModel:
      'List Auralith routines and summarize their triggers/actions. Use when the user asks what automations exist or what routines can do.',
    execute: async (params) =>
      deps.getRoutines({
        includeDisabled: params.includeDisabled ?? true,
        limit: params.limit ?? 20,
      }),
  })

  registerTool({
    id: id(deps.namespace, 'routines.history'),
    tier: 'safe',
    paramsSchema: z.object({
      routineId: z.string(),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    resultSchema: z.unknown(),
    describeForModel:
      'Read recent run history for an Auralith routine. Use for questions about whether an automation ran or failed.',
    execute: async (params) =>
      deps.getRoutineHistory({ routineId: params.routineId, limit: params.limit ?? 20 }),
  })

  registerTool({
    id: id(deps.namespace, 'suggestions.list'),
    tier: 'safe',
    paramsSchema: z.object({
      status: z.enum(['open', 'accepted', 'dismissed', 'snoozed', 'expired']).optional(),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    resultSchema: z.unknown(),
    describeForModel:
      'List Auralith proactive suggestions with rationale and tier. Use for questions about pending suggestions or what the assistant recommends.',
    execute: async (params) =>
      deps.getSuggestions({
        ...(params.status ? { status: params.status } : {}),
        limit: params.limit ?? 10,
      }),
  })

  registerTool({
    id: id(deps.namespace, 'clipboard.recent'),
    tier: 'safe',
    paramsSchema: z.object({ limit: z.number().int().min(1).max(25).default(5) }),
    resultSchema: z.unknown(),
    describeForModel:
      'Read recent opt-in clipboard history previews from Auralith. If disabled, tell the user clipboard history must be enabled first.',
    execute: async (params) => deps.getClipboardItems({ limit: params.limit ?? 5 }),
  })

  registerTool({
    id: id(deps.namespace, 'appUsage.query'),
    tier: 'safe',
    paramsSchema: z.object({
      after: z.number().int().optional(),
      before: z.number().int().optional(),
      limit: z.number().int().min(1).max(100).default(25),
    }),
    resultSchema: z.unknown(),
    describeForModel:
      'Query privacy-bucketed Auralith app usage sessions. Use for questions about how time was spent across apps or work categories.',
    execute: async (params) =>
      deps.getAppUsage({
        ...(params.after !== undefined ? { after: params.after } : {}),
        ...(params.before !== undefined ? { before: params.before } : {}),
        limit: params.limit ?? 25,
      }),
  })

  registerTool({
    id: id(deps.namespace, 'settings.summary'),
    tier: 'safe',
    paramsSchema: z.object({}),
    resultSchema: z.unknown(),
    describeForModel:
      'Return a safe user-facing summary of Auralith settings and feature status. Use for configuration questions without exposing secrets or raw sensitive values.',
    execute: async () => deps.getSettingsSummary(),
  })
}

export function makeAwarenessToolDeps(bundle: DbBundle): AwarenessToolDeps {
  const settings = createSettingsRepo(bundle.db)

  return {
    getWeatherLocation: () => {
      const lat = settings.get('weather.lat', z.union([z.number(), z.string()]))
      const lon = settings.get('weather.lon', z.union([z.number(), z.string()]))
      const label = settings.get('weather.label', z.string())
      if (lat === undefined || lon === undefined) return undefined
      return { lat: Number(lat), lon: Number(lon), ...(label ? { label } : {}) }
    },
    fetchWeather: fetchOpenMeteo,
    getNewsSummary: (opts) => {
      const repo = createNewsRepo(bundle.db)
      const topics = repo
        .listTopics()
        .map((topic) => ({ id: topic.id, name: topic.name, slug: topic.slug }))
      const clusters = repo
        .listClusters({ ...(opts.topicId ? { topicId: opts.topicId } : {}), limit: opts.limit })
        .map((cluster) => ({
          id: cluster.id,
          topicId: cluster.topicId,
          summary: cluster.summary,
          itemCount: repo.getClusterItemCount(cluster.id),
          createdAt: cluster.createdAt.getTime(),
        }))
      const itemOpts: Parameters<typeof repo.listItems>[0] = { limit: opts.limit }
      if (opts.unreadOnly !== undefined) itemOpts.unreadOnly = opts.unreadOnly
      if (opts.savedOnly !== undefined) itemOpts.savedOnly = opts.savedOnly
      const items = repo.listItems(itemOpts)
      const countOpts: Parameters<typeof repo.countItems>[0] = {}
      if (opts.unreadOnly !== undefined) countOpts.unreadOnly = opts.unreadOnly
      return {
        topics,
        clusters,
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          url: item.url,
          ...(item.summary ? { summary: item.summary } : {}),
          ...(item.publishedAt ? { publishedAt: item.publishedAt.getTime() } : {}),
          saved: item.saved,
          read: item.readAt !== null,
        })),
        totalItems: repo.countItems(countOpts),
      }
    },
    getRoutines: (opts) => {
      const repo = createRoutinesRepo(bundle.db)
      const rows = opts.includeDisabled ? repo.listAll() : repo.list({ includeDisabled: false })
      return rows.slice(0, opts.limit).map((routine) => ({
        id: routine.id,
        name: routine.name,
        enabled: routine.enabled,
        trigger: JSON.parse(routine.triggerJson) as unknown,
        action: JSON.parse(routine.actionJson) as unknown,
        runCount: routine.runCount,
        ...(routine.lastRunAt ? { lastRunAt: routine.lastRunAt.getTime() } : {}),
        ...(routine.lastStatus ? { lastStatus: routine.lastStatus } : {}),
      }))
    },
    getRoutineHistory: (opts) => {
      const repo = createRoutinesRepo(bundle.db)
      return repo.listRuns(opts.routineId, opts.limit).map((run) => ({
        id: run.id,
        routineId: run.routineId,
        ts: run.ts.getTime(),
        outcome: run.outcome,
        ...(run.traceId ? { traceId: run.traceId } : {}),
      }))
    },
    getSuggestions: (opts) => {
      const repo = createSuggestionsRepo(bundle.db)
      const status = opts.status as SuggestionStatus | undefined
      return repo.list({ ...(status ? { status } : {}), limit: opts.limit }).map((suggestion) => ({
        id: suggestion.id,
        kind: suggestion.kind,
        title: suggestion.title,
        rationale: suggestion.rationale,
        tier: suggestion.tier,
        status: suggestion.status,
        createdAt: suggestion.createdAt.getTime(),
      }))
    },
    getClipboardItems: (opts) => {
      const enabled = settings.getOrDefault('activity.clipboardEnabled', z.boolean(), false)
      if (!enabled) return { enabled: false, items: [] }
      const repo = createClipboardRepo(bundle.db)
      return {
        enabled: true,
        items: repo.list(opts.limit, 0).map((item) => ({
          id: item.id,
          ts: item.ts,
          kind: item.kind,
          ...(item.textValue
            ? { textPreview: item.redacted ? '[redacted]' : item.textValue.slice(0, 240) }
            : {}),
          ...(item.charCount !== undefined ? { charCount: item.charCount } : {}),
          redacted: item.redacted,
        })),
      }
    },
    getAppUsage: (opts) => {
      const repo = createAppUsageRepo(bundle.db)
      return repo.list({
        ...(opts.after !== undefined ? { after: new Date(opts.after) } : {}),
        ...(opts.before !== undefined ? { before: new Date(opts.before) } : {}),
        limit: opts.limit,
      })
    },
    getSettingsSummary: () => {
      const all = settings.getAll()
      return {
        areas: [
          {
            area: 'Weather',
            configured: all['weather.lat'] !== undefined && all['weather.lon'] !== undefined,
            value: typeof all['weather.label'] === 'string' ? all['weather.label'] : undefined,
          },
          { area: 'Clipboard history', enabled: Boolean(all['activity.clipboardEnabled']) },
          { area: 'App usage tracking', enabled: Boolean(all['activity.appUsageEnabled']) },
          { area: 'Focus app tracking', enabled: Boolean(all['activity.focusAppTrackingEnabled']) },
          { area: 'Voice', enabled: Boolean(all['voice.enabled']) },
          {
            area: 'Assistant persona override',
            configured:
              typeof all['assistant.personaOverride'] === 'string' &&
              all['assistant.personaOverride'].trim().length > 0,
          },
          {
            area: 'Ollama URL',
            configured:
              typeof all['ollama.url'] === 'string' && all['ollama.url'].trim().length > 0,
          },
        ].map((area) => {
          const clean = Object.fromEntries(
            Object.entries(area).filter(([, value]) => value !== undefined),
          )
          return clean as SettingsSummary['areas'][number]
        }),
      }
    },
  }
}
