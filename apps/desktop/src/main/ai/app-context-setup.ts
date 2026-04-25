/**
 * App Context Broker Setup
 *
 * Instantiates and wires all AppContextProviders for the desktop process.
 * Each provider delegates to the existing IPC-level service functions
 * (the same data sources already used by IPC handlers) so there is no
 * duplication of fetch logic.
 *
 * Call initAppContextBroker() once after all service deps are initialized,
 * then call getAppContextBroker() from the assistant handler.
 */

import { z } from 'zod'
import {
  createAppContextBroker,
  createWeatherContextProvider,
  createNewsContextProvider,
  createActivityContextProvider,
  createKnowledgeContextProvider,
  createSuggestionsContextProvider,
  createRoutinesContextProvider,
  createSettingsContextProvider,
  type AppContextBroker,
} from '@auralith/core-ai'
import {
  createSettingsRepo,
  createEventsRepo,
  createSuggestionsRepo,
  createRoutinesRepo,
  type DbBundle,
} from '@auralith/core-db'
import { fetchWeather, buildWeatherBriefing } from '@auralith/core-weather'
import { createNewsRepo } from '@auralith/core-news'
import { hybridSearch } from '@auralith/core-retrieval'
import type Database from 'better-sqlite3'
import type { OllamaClient } from '@auralith/core-ai'

type BrokerSetupDeps = {
  bundle: DbBundle
  sqlite: Database.Database
  embedClient: OllamaClient
  embedModel: string
}

let _broker: AppContextBroker | null = null

export function initAppContextBroker(deps: BrokerSetupDeps): AppContextBroker {
  const { bundle, sqlite, embedClient, embedModel } = deps
  const settings = createSettingsRepo(bundle.db)

  // ── Weather provider ───────────────────────────────────────────────────────
  const weatherProvider = createWeatherContextProvider({
    getBriefing: async () => {
      const lat = Number(settings.get('weather.lat', z.union([z.number(), z.string()])))
      const lon = Number(settings.get('weather.lon', z.union([z.number(), z.string()])))
      if (!lat || !lon) throw new Error('No location configured')
      const payload = await fetchWeather(lat, lon)
      return buildWeatherBriefing(payload)
    },
    getCurrent: async () => {
      const lat = Number(settings.get('weather.lat', z.union([z.number(), z.string()])))
      const lon = Number(settings.get('weather.lon', z.union([z.number(), z.string()])))
      if (!lat || !lon) throw new Error('No location configured')
      const payload = await fetchWeather(lat, lon)
      const c = payload.current
      return {
        temperature_2m: c.temp,
        apparent_temperature: c.feelsLike,
        weather_code: c.weatherCode,
        wind_speed_10m: c.windSpeed,
        relative_humidity_2m: c.humidity,
        is_day: 1,
        time: new Date().toISOString(),
      }
    },
    getForecast: async (days = 3) => {
      const lat = Number(settings.get('weather.lat', z.union([z.number(), z.string()])))
      const lon = Number(settings.get('weather.lon', z.union([z.number(), z.string()])))
      if (!lat || !lon) throw new Error('No location configured')
      const payload = await fetchWeather(lat, lon)
      return {
        daily: payload.daily.slice(0, days).map((d) => ({
          date: d.date,
          weather_code: d.weatherCode,
          temperature_2m_max: d.tempMax,
          temperature_2m_min: d.tempMin,
          precipitation_probability_max: d.precipSum,
        })),
        fetchedAt: payload.fetchedAt,
      }
    },
    getLocationLabel: () =>
      settings.get('weather.label', z.string()) ??
      settings.get('weather.city', z.string()) ??
      undefined,
  })

  // ── News provider ──────────────────────────────────────────────────────────
  const newsProvider = createNewsContextProvider({
    listTopics: async () => {
      const repo = createNewsRepo(bundle.db)
      return repo.listTopics()
    },
    listClusters: async (opts) => {
      const repo = createNewsRepo(bundle.db)
      const topics = repo.listTopics()
      const clusters = repo.listClusters({ limit: opts?.limit ?? 6 })
      // Build a topic name lookup
      const topicNameById = new Map(topics.map((t) => [t.id, t.name]))
      // Enrich clusters with item counts and topic names
      return clusters.map((c) => ({
        id: c.id,
        topicName: topicNameById.get(c.topicId) ?? c.topicId,
        label: c.summary.slice(0, 60),
        summary: c.summary,
        itemCount: repo.getClusterItemCount(c.id),
        latestAt: c.createdAt instanceof Date ? c.createdAt.getTime() : (c.createdAt as number),
      }))
    },
    getUnreadCount: async () => {
      const repo = createNewsRepo(bundle.db)
      return repo.countItems({ unreadOnly: true })
    },
    listArticles: async ({ limit }) => {
      const repo = createNewsRepo(bundle.db)
      const feeds = repo.listFeeds()
      const feedTitleById = new Map(feeds.map((f) => [f.id, f.title]))
      const items = repo.listItems({ limit })
      return items.map((item) => ({
        id: item.id,
        title: item.title,
        source: feedTitleById.get(item.feedId) ?? item.feedId,
        publishedAt:
          item.publishedAt instanceof Date
            ? item.publishedAt.getTime()
            : ((item.publishedAt as number | null | undefined) ?? null),
        summary: item.summary ?? null,
        clusterId: item.clusterId ?? null,
      }))
    },
  })

  // ── Activity provider ──────────────────────────────────────────────────────
  const activityProvider = createActivityContextProvider({
    queryEvents: async ({ fromTs, limit }) => {
      const eventsRepo = createEventsRepo(bundle.db)
      const rows = eventsRepo.queryEvents({ after: new Date(fromTs), limit })
      return rows.map((r) => ({
        id: r.id,
        ts: r.ts,
        kind: r.kind,
        ...(r.path != null ? { path: r.path } : {}),
        ...(r.prevPath != null ? { prevPath: r.prevPath } : {}),
        ...(r.actor != null ? { actor: r.actor } : {}),
      }))
    },
    listSessions: async ({ limit }) => {
      const eventsRepo = createEventsRepo(bundle.db)
      return eventsRepo.listSessions({ limit })
    },
    sanitizePath: (path) => {
      return path
        .replace(/^[A-Z]:\\Users\\[^\\]+\\/i, '~/')
        .replace(/^\/home\/[^/]+\//, '~/')
        .replace(/^\/Users\/[^/]+\//, '~/')
    },
  })

  // ── Knowledge provider ─────────────────────────────────────────────────────
  const knowledgeProvider = createKnowledgeContextProvider({
    search: async ({ query, spaceId, topK }) => {
      const hits = await hybridSearch(
        { query, ...(spaceId ? { spaceId } : {}), topK, mode: 'hybrid' },
        bundle.db,
        sqlite,
        bundle.vec,
        embedClient,
        embedModel,
      )
      return hits.map((h) => ({
        chunkId: h.chunkId,
        docId: h.docId,
        docPath: h.docPath,
        ...(h.docTitle != null ? { docTitle: h.docTitle } : {}),
        ...(h.headingPath != null ? { headingPath: h.headingPath } : {}),
        charStart: h.charStart,
        charEnd: h.charEnd,
        ...(h.page != null ? { page: h.page } : {}),
        text: h.text,
        score: h.score,
      }))
    },
    listSpaces: async () => {
      type SpaceRow = { id: string; name: string; slug: string }
      const spaceRows = sqlite
        .prepare('SELECT id, name, slug FROM spaces ORDER BY name ASC')
        .all() as SpaceRow[]
      return spaceRows
    },
  })

  // ── Suggestions provider ───────────────────────────────────────────────────
  const suggestionsProvider = createSuggestionsContextProvider({
    listOpen: async () => {
      const repo = createSuggestionsRepo(bundle.db)
      const rows = repo.list({ status: 'open' })
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.rationale,
        status: r.status,
        createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : (r.createdAt as number),
      }))
    },
  })

  // ── Routines provider ──────────────────────────────────────────────────────
  const routinesProvider = createRoutinesContextProvider({
    list: async () => {
      const repo = createRoutinesRepo(bundle.db)
      return repo.list({ includeDisabled: true }).map((r) => {
        let triggerKind = 'unknown'
        try {
          const trigger = JSON.parse(r.triggerJson)
          triggerKind = trigger?.kind ?? trigger?.type ?? 'unknown'
        } catch {
          /* malformed trigger JSON */
        }

        const lastRunAt =
          r.lastRunAt instanceof Date ? r.lastRunAt.getTime() : (r.lastRunAt as number | undefined)
        return {
          id: r.id,
          name: r.name,
          triggerKind,
          enabled: r.enabled,
          createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : (r.createdAt as number),
          ...(lastRunAt != null ? { lastRunAt } : {}),
          ...(r.lastStatus != null ? { lastRunStatus: r.lastStatus } : {}),
        }
      })
    },
  })

  // ── Settings provider ──────────────────────────────────────────────────────
  const settingsProvider = createSettingsContextProvider({
    getAppSettings: async () => {
      const weatherLocationLabel =
        settings.get('weather.label', z.string()) ??
        settings.get('weather.city', z.string()) ??
        null
      const personaOverride = settings.get('assistant.personaOverride', z.string()) ?? null
      return {
        ...(weatherLocationLabel != null ? { weatherLocationLabel } : {}),
        weatherEnabled: settings.get('weather.enabled', z.boolean()) ?? true,
        newsEnabled: settings.get('news.enabled', z.boolean()) ?? true,
        activityEnabled: settings.get('activity.enabled', z.boolean()) ?? true,
        clipboardEnabled: settings.get('clipboard.enabled', z.boolean()) ?? false,
        voiceEnabled: settings.get('voice.enabled', z.boolean()) ?? false,
        briefingEnabled: settings.get('briefing.enabled', z.boolean()) ?? true,
        leisureMode: settings.get('briefing.leisureMode', z.string()) ?? 'auto',
        ...(personaOverride != null ? { personaOverride } : {}),
        appContextEnabled: settings.get('appContext.enabled', z.boolean()) ?? true,
        appContextMaxChars: settings.get('appContext.maxChars', z.number()) ?? 4000,
      }
    },
  })

  // ── Assemble broker ────────────────────────────────────────────────────────
  const isCloudModel = settings.get('ollama.useCloudModel', z.boolean()) ?? false
  const appContextEnabled = settings.get('appContext.enabled', z.boolean()) ?? true
  const appContextMaxChars = settings.get('appContext.maxChars', z.number()) ?? 4000

  _broker = createAppContextBroker({
    providers: [
      weatherProvider,
      newsProvider,
      activityProvider,
      knowledgeProvider,
      suggestionsProvider,
      routinesProvider,
      settingsProvider,
    ],
    config: {
      enabled: appContextEnabled,
      maxChars: appContextMaxChars,
      isCloudModel,
    },
  })

  return _broker
}

export function getAppContextBroker(): AppContextBroker | null {
  return _broker
}
