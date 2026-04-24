import { z } from 'zod'
import { ActivityEventKindSchema, type ActivityEventKind } from '@auralith/core-domain'
import type { EventsRepo } from '@auralith/core-db'
import { registerTool } from '@auralith/core-tools'

export function registerActivityTools(eventsRepo: () => EventsRepo): void {
  registerTool({
    id: 'activity.query',
    tier: 'safe',
    paramsSchema: z.object({
      after: z.number().int().optional(),
      before: z.number().int().optional(),
      kind: ActivityEventKindSchema.optional(),
      text: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100).default(25),
    }),
    resultSchema: z.object({
      total: z.number(),
      events: z.array(
        z.object({
          id: z.string(),
          ts: z.number(),
          kind: ActivityEventKindSchema,
          path: z.string(),
          actor: z.string(),
          source: z.string(),
          prevPath: z.string().optional(),
          payloadJson: z.string(),
          sessionId: z.string().optional(),
        }),
      ),
    }),
    describeForModel:
      'Query recent activity events from the local timeline. Use this to answer questions like what the user worked on, when files changed, or what happened during a time window.',
    execute: async (params) => {
      const repo = eventsRepo()
      const text = params.text?.trim().toLowerCase()
      const baseLimit = Math.min(Math.max(params.limit ?? 25, 1) * (text ? 4 : 1), 200)
      const rows = repo.queryEvents({
        ...(params.after !== undefined ? { after: new Date(params.after) } : {}),
        ...(params.before !== undefined ? { before: new Date(params.before) } : {}),
        ...(params.kind !== undefined ? { kind: params.kind as ActivityEventKind } : {}),
        limit: baseLimit,
      })

      const filtered = text
        ? rows.filter(
            (row) =>
              row.path.toLowerCase().includes(text) ||
              row.prevPath?.toLowerCase().includes(text) ||
              row.payloadJson.toLowerCase().includes(text),
          )
        : rows

      return {
        total: filtered.length,
        events: filtered.slice(0, params.limit ?? 25).map((row) => ({
          id: row.id,
          ts: row.ts,
          kind: row.kind as ActivityEventKind,
          path: row.path,
          actor: row.actor,
          source: row.source,
          payloadJson: row.payloadJson,
          ...(row.prevPath ? { prevPath: row.prevPath } : {}),
          ...(row.sessionId ? { sessionId: row.sessionId } : {}),
        })),
      }
    },
  })
}
