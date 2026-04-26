import { z } from 'zod'
import { registerTool } from '@auralith/core-tools'
import { clipboard } from 'electron'

export function registerClipboardTools(): void {
  registerTool({
    id: 'clipboard.read',
    tier: 'safe',
    describeForModel: 'Read the current text content of the Windows clipboard.',
    paramsSchema: z.object({}),
    resultSchema: z.object({ text: z.string(), empty: z.boolean() }),
    execute: async () => {
      const text = clipboard.readText()
      return { text, empty: text.length === 0 }
    },
  })

  registerTool({
    id: 'clipboard.write',
    tier: 'confirm-transient',
    describeForModel: 'Write text to the Windows clipboard, replacing current contents.',
    paramsSchema: z.object({
      text: z.string().describe('Text to write to clipboard'),
    }),
    resultSchema: z.object({ ok: z.boolean(), charCount: z.number() }),
    reversible: {
      windowMs: 5 * 60 * 1000,
      undo: async (_params, _result) => {
        clipboard.writeText('')
      },
    },
    execute: async (params) => {
      clipboard.writeText(params.text)
      return { ok: true, charCount: params.text.length }
    },
  })
}
