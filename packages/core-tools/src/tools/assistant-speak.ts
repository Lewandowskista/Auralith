import { z } from 'zod'
import { registerTool } from '../registry'

export function registerAssistantSpeakTool(
  speakFn: (text: string, voiceId?: string, rate?: number) => Promise<void>,
): void {
  registerTool({
    id: 'assistant.speak',
    tier: 'safe',
    describeForModel: 'Speak text aloud using the system text-to-speech engine.',
    paramsSchema: z.object({
      text: z.string().min(1).max(2000),
      voiceId: z.string().optional(),
      rate: z.number().min(0.1).max(3).optional(),
    }),
    resultSchema: z.object({ ok: z.boolean() }),
    execute: async (params) => {
      await speakFn(params.text, params.voiceId, params.rate)
      return { ok: true }
    },
  })
}
