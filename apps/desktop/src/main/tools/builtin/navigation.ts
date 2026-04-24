import { z } from 'zod'
import { BrowserWindow, shell } from 'electron'
import { registerTool } from '@auralith/core-tools'
import { createNewsRepo } from '@auralith/core-news'
import { getDb } from '@auralith/core-db'

function sendToRenderer(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, data)
}

export function registerNavigationTools(): void {
  registerTool({
    id: 'news.openDigest',
    tier: 'safe',
    paramsSchema: z.object({ topicId: z.string().optional() }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Navigate to the News screen and optionally open a specific topic.',
    execute: async (params) => {
      sendToRenderer('navigate', {
        section: 'news',
        ...(params.topicId !== undefined ? { topicId: params.topicId } : {}),
      })
      return { ok: true }
    },
  })

  registerTool({
    id: 'news.markTopicRead',
    tier: 'confirm',
    paramsSchema: z.object({ topicId: z.string() }),
    resultSchema: z.object({ marked: z.number() }),
    describeForModel: 'Mark all unread news items in a topic as read.',
    execute: async (params) => {
      const { db } = getDb()
      const repo = createNewsRepo(db)
      // Get all clusters for the topic, then mark their items read
      const clusters = repo.listClusters({ topicId: params.topicId, limit: 100 })
      let marked = 0
      for (const cluster of clusters) {
        const items = repo.listItems({ clusterId: cluster.id, limit: 100 })
        for (const item of items) {
          if (!item.readAt) {
            repo.markRead(item.id)
            marked++
          }
        }
      }
      return { marked }
    },
  })

  registerTool({
    id: 'weather.openScreen',
    tier: 'safe',
    paramsSchema: z.object({}),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Navigate to the Weather screen.',
    execute: async () => {
      sendToRenderer('navigate', { section: 'weather' })
      return { ok: true }
    },
  })

  registerTool({
    id: 'briefing.show',
    tier: 'safe',
    paramsSchema: z.object({ tone: z.enum(['morning', 'leisure']).optional() }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel:
      'Show the morning briefing on the Home screen. Pass tone="leisure" for a weekend-friendly variant.',
    execute: async (params) => {
      sendToRenderer('briefing:show', { type: params.tone ?? 'morning' })
      return { ok: true }
    },
  })

  registerTool({
    id: 'briefing.showEod',
    tier: 'safe',
    paramsSchema: z.object({ date: z.string().optional() }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Show the end-of-day recap briefing on the Home screen.',
    execute: async (params) => {
      sendToRenderer('briefing:show', {
        type: 'eod',
        ...(params.date !== undefined ? { date: params.date } : {}),
      })
      return { ok: true }
    },
  })

  registerTool({
    id: 'system.openPath',
    tier: 'confirm',
    paramsSchema: z.object({ path: z.string() }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    describeForModel: 'Open a file or folder with the default OS application.',
    execute: async (params) => {
      const err = await shell.openPath(params.path)
      if (err) return { ok: false, error: err }
      return { ok: true }
    },
  })

  registerTool({
    id: 'news.openSaved',
    tier: 'safe',
    paramsSchema: z.object({}),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Navigate to the News screen filtered to saved items.',
    execute: async () => {
      sendToRenderer('navigate', { section: 'news', filter: 'saved' })
      return { ok: true }
    },
  })

  registerTool({
    id: 'leisure.dismissIdea',
    tier: 'safe',
    paramsSchema: z.object({ idea: z.string().optional() }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Acknowledge and dismiss a leisure hobby idea suggestion.',
    execute: async () => {
      return { ok: true }
    },
  })

  registerTool({
    id: 'briefing.showEventPrep',
    tier: 'confirm',
    paramsSchema: z.object({ title: z.string(), startAt: z.string().optional() }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Show an event preparation briefing card for an upcoming calendar event.',
    execute: async (params) => {
      const startAtMs = params.startAt ? new Date(params.startAt).getTime() : undefined
      sendToRenderer('briefing:show', {
        type: 'event-prep',
        eventTitle: params.title,
        ...(startAtMs !== undefined ? { startAt: startAtMs } : {}),
      })
      return { ok: true }
    },
  })
}
