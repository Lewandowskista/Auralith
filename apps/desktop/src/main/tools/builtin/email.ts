import { z } from 'zod'
import { shell } from 'electron'
import { registerTool } from '@auralith/core-tools'

export function registerEmailTools(): void {
  registerTool({
    id: 'email.draft',
    tier: 'confirm',
    paramsSchema: z.object({
      to: z.string(),
      subject: z.string().optional(),
      body: z.string().optional(),
      cc: z.string().optional(),
    }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel:
      "Open the default email client with a draft pre-filled. Does NOT send automatically — the user must click Send themselves. Use for composing emails on the user's behalf.",
    execute: async (params) => {
      const parts: string[] = []
      if (params.subject) parts.push(`subject=${encodeURIComponent(params.subject)}`)
      if (params.body) parts.push(`body=${encodeURIComponent(params.body)}`)
      if (params.cc) parts.push(`cc=${encodeURIComponent(params.cc)}`)
      const query = parts.length > 0 ? `?${parts.join('&')}` : ''
      const mailto = `mailto:${encodeURIComponent(params.to)}${query}`
      await shell.openExternal(mailto)
      return { ok: true }
    },
  })
}
