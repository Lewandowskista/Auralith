import type { z } from 'zod'
import type { OllamaClient, ChatMessage } from './client'
import type { ModelRole } from './router'

export type PromptContract<TOut> = {
  id: string
  role: ModelRole
  system: string
  userTemplate: (ctx: Record<string, string>) => string
  outputSchema: z.ZodType<TOut>
  maxTokens: number
  temperature: number
}

export type RunResult<TOut> =
  | { ok: true; data: TOut; raw: string }
  | { ok: false; error: string; raw: string }

export async function runPrompt<TOut>(
  contract: PromptContract<TOut>,
  ctx: Record<string, string>,
  client: OllamaClient,
  model: string,
): Promise<RunResult<TOut>> {
  const messages: ChatMessage[] = [
    { role: 'system', content: contract.system },
    { role: 'user', content: contract.userTemplate(ctx) },
  ]

  const attempt = async (extraSuffix?: string): Promise<RunResult<TOut>> => {
    const finalMessages = extraSuffix
      ? [
          ...messages,
          { role: 'assistant' as const, content: '' },
          { role: 'user' as const, content: extraSuffix },
        ]
      : messages

    let raw = ''
    try {
      raw = await client.generate({
        model,
        messages: finalMessages,
        format: 'json',
        maxTokens: contract.maxTokens,
        temperature: contract.temperature,
      })
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Ollama request failed',
        raw: '',
      }
    }

    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return { ok: false, error: 'Response was not valid JSON', raw }
    }

    const validated = contract.outputSchema.safeParse(parsed)
    if (validated.success) {
      return { ok: true, data: validated.data, raw }
    }
    return { ok: false, error: validated.error.message, raw }
  }

  // First attempt
  const first = await attempt()
  if (first.ok) return first

  // One retry with explicit schema reminder
  const retry = await attempt(
    `Your previous reply was invalid. Reply with ONLY valid JSON matching this schema (no prose, no markdown): ${JSON.stringify(contract.outputSchema.description ?? 'object')}`,
  )
  return retry
}
