import { z } from 'zod'
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { registerTool } from '@auralith/core-tools'
import type { EventsRepo } from '@auralith/core-db'

export function registerNoteTools(getNotesDir: () => string, eventsRepo: () => EventsRepo): void {
  registerTool({
    id: 'notes.createQuick',
    tier: 'safe',
    paramsSchema: z.object({ title: z.string(), body: z.string() }),
    resultSchema: z.object({ path: z.string() }),
    describeForModel: 'Create a quick markdown note in the notes folder.',
    reversible: {
      windowMs: 30 * 60 * 1000,
      undo: async (_params, result) => {
        try {
          const { unlinkSync } = await import('fs')
          unlinkSync(result.path)
        } catch {
          /* best-effort */
        }
      },
    },
    execute: async (params) => {
      const notesDir = getNotesDir()
      mkdirSync(notesDir, { recursive: true })
      const slug = params.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50)
      const filename = `${new Date().toISOString().slice(0, 10)}-${slug}.md`
      const path = join(notesDir, filename)
      writeFileSync(path, `# ${params.title}\n\n${params.body}\n`, 'utf8')
      return { path }
    },
  })

  registerTool({
    id: 'notes.createFromSession',
    tier: 'confirm',
    paramsSchema: z.object({ sessionId: z.string(), title: z.string().optional() }),
    resultSchema: z.object({ path: z.string() }),
    describeForModel: 'Create a markdown recap note from a recent file activity session.',
    reversible: {
      windowMs: 30 * 60 * 1000,
      undo: async (_params, result) => {
        try {
          const { unlinkSync } = await import('fs')
          unlinkSync(result.path)
        } catch {
          /* best-effort */
        }
      },
    },
    execute: async (params) => {
      const repo = eventsRepo()
      const events = repo.queryEvents({ sessionId: params.sessionId, limit: 100 })
      const notesDir = getNotesDir()
      mkdirSync(notesDir, { recursive: true })

      const title = params.title ?? `Session recap ${new Date().toISOString().slice(0, 10)}`
      const lines = [`# ${title}`, '', `_Generated ${new Date().toLocaleString()}_`, '']
      const byKind: Record<string, string[]> = {}
      for (const e of events) {
        const k = e.kind ?? 'other'
        if (!byKind[k]) byKind[k] = []
        byKind[k].push(e.path)
      }
      for (const [kind, paths] of Object.entries(byKind)) {
        lines.push(`## ${kind}`)
        for (const p of paths.slice(0, 20)) lines.push(`- ${p}`)
        lines.push('')
      }

      const filename = `recap-${params.sessionId.slice(0, 8)}-${randomUUID().slice(0, 4)}.md`
      const path = join(notesDir, filename)
      writeFileSync(path, lines.join('\n'), 'utf8')
      return { path }
    },
  })

  registerTool({
    id: 'notes.append',
    tier: 'confirm',
    paramsSchema: z.object({ path: z.string(), content: z.string() }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Append text to an existing note file.',
    execute: async (params) => {
      if (!existsSync(params.path)) throw new Error(`Note not found: ${params.path}`)
      appendFileSync(params.path, `\n${params.content}`, 'utf8')
      return { ok: true }
    },
  })
}
