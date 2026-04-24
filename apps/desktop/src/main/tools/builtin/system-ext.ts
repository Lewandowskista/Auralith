import { z } from 'zod'
import { clipboard } from 'electron'
import { registerTool } from '@auralith/core-tools'

export function registerSystemExtTools(): void {
  registerTool({
    id: 'system.setClipboard',
    tier: 'safe',
    paramsSchema: z.object({ text: z.string() }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Copy text to the system clipboard.',
    execute: async (params) => {
      clipboard.writeText(params.text)
      return { ok: true }
    },
  })

  registerTool({
    id: 'system.getClipboard',
    tier: 'safe',
    paramsSchema: z.object({}),
    resultSchema: z.object({ text: z.string() }),
    describeForModel: 'Read the current text content of the system clipboard.',
    execute: async () => {
      return { text: clipboard.readText() }
    },
  })
}
