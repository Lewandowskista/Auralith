import { BrowserWindow } from 'electron'
import type { DbBundle } from '@auralith/core-db'
import { createSettingsRepo } from '@auralith/core-db'
import { createNewsRepo } from '@auralith/core-news'
import { runFullPipeline } from '@auralith/core-news'
import { fetchWeather, buildWeatherBriefing } from '@auralith/core-weather'
import { getScheduler } from '@auralith/core-scheduler'
import type { OllamaClient } from '@auralith/core-ai'
import { z } from 'zod'

type BriefingDeps = {
  bundle: DbBundle
  ollamaClient: OllamaClient
  classifierModel: string
}

export type BriefingPayload = {
  tone?: 'default' | 'leisure'
  weather?: {
    summary: string
    alertLevel: string
    temp?: number
    description?: string
  }
  newsClusters: Array<{ topicName: string; summary: string; itemCount: number }>
  generatedAt: number
}

let _deps: BriefingDeps | null = null

export function initBriefingDeps(deps: BriefingDeps): void {
  _deps = deps
}

export function setupBriefingScheduler(): void {
  const scheduler = getScheduler()

  scheduler.register({
    name: 'morning-brief',
    cronHour: 7,
    cronMinute: 0,
    jitterMs: 2 * 60 * 1000, // up to 2 min jitter
    quietStart: 22,
    quietEnd: 6,
    run: async () => {
      if (!_deps) return
      const { bundle, ollamaClient, classifierModel } = _deps
      const settings = createSettingsRepo(bundle.db)

      const briefingEnabled = settings.get('briefing.morningEnabled', z.boolean()) ?? true
      if (!briefingEnabled) return

      const repo = createNewsRepo(bundle.db)

      // Refresh news first
      await runFullPipeline({
        repo,
        ollamaClient,
        classifierModel,
      })

      const now = new Date()
      const isWeekend = [0, 6].includes(now.getDay())
      const weekendMode =
        settings.get('leisure.weekendMode', z.enum(['auto', 'always', 'off'])) ?? 'auto'
      const leisureActive = weekendMode === 'always' || (weekendMode === 'auto' && isWeekend)
      const briefing = await buildBriefing(bundle, ollamaClient)
      if (leisureActive) briefing.tone = 'leisure'
      broadcastBriefing(briefing)
    },
  })

  scheduler.start()
}

export async function buildBriefing(
  bundle: DbBundle,
  _ollamaClient: OllamaClient,
): Promise<BriefingPayload> {
  const settings = createSettingsRepo(bundle.db)
  const repo = createNewsRepo(bundle.db)
  const now = Date.now()

  // Weather
  let weatherPayload: BriefingPayload['weather']
  const lat = settings.get('weather.lat', z.union([z.number(), z.string()]))
  const lon = settings.get('weather.lon', z.union([z.number(), z.string()]))
  if (lat !== undefined && lon !== undefined) {
    try {
      const weather = await fetchWeather(Number(lat), Number(lon))
      const briefing = buildWeatherBriefing(weather)
      weatherPayload = {
        summary: briefing.summary,
        alertLevel: briefing.alertLevel,
        temp: weather.current.temp,
        description: weather.current.description,
      }
    } catch {
      // Weather unavailable — continue without it
    }
  }

  // Top news clusters per topic (max 3)
  const topics = repo.listTopics()
  const newsClusters: BriefingPayload['newsClusters'] = []
  for (const topic of topics.slice(0, 3)) {
    const clusters = repo.listClusters({ topicId: topic.id, limit: 1 })
    const cluster = clusters[0]
    if (!cluster) continue
    newsClusters.push({
      topicName: topic.name,
      summary: cluster.summary,
      itemCount: repo.getClusterItemCount(cluster.id),
    })
  }

  const result: BriefingPayload = { newsClusters, generatedAt: now }
  if (weatherPayload !== undefined) result.weather = weatherPayload
  return result
}

function broadcastBriefing(payload: BriefingPayload): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send('briefing:morning', payload)
}
