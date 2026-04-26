import { z } from 'zod'
import type { OllamaClient } from '@auralith/core-ai'
import type { ModelRouter } from '@auralith/core-ai'
import { runPrompt, type PromptContract } from '@auralith/core-ai'

const SummaryOutputSchema = z.object({
  summary: z.string().min(1).max(600),
})

type SummaryOutput = z.infer<typeof SummaryOutputSchema>

const DOC_SUMMARY_CONTRACT: PromptContract<SummaryOutput> = {
  id: 'doc-summary-v1',
  role: 'summarize',
  system:
    'You are a concise document summarizer. Write exactly 2-3 sentences (max 80 words) capturing the main topic and key facts of the provided text. Output only valid JSON.',
  userTemplate: (ctx) =>
    `Summarize this document excerpt in 2-3 sentences:\n\n${ctx['text'] ?? ''}`,
  outputSchema: SummaryOutputSchema,
  maxTokens: 120,
  temperature: 0,
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24h cache — summaries are stable
}

/** Generates a short 2-3 sentence summary for a document. Returns null on failure. */
export async function summarizeDoc(
  text: string,
  router: ModelRouter,
  client: OllamaClient,
): Promise<string | null> {
  // Truncate to first ~4000 chars to keep the prompt cheap for phi4-mini
  const excerpt = text.length > 4000 ? text.slice(0, 4000) + '…' : text

  try {
    const result = await runPrompt(
      DOC_SUMMARY_CONTRACT,
      { text: excerpt },
      client,
      router.modelFor('summarize'),
    )
    if (result.ok) return result.data.summary
    return null
  } catch {
    return null
  }
}
