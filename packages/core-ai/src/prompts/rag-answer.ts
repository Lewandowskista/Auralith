import { z } from 'zod'
import type { PromptContract } from '../runtime'

// RAG answer uses streaming so we don't use PromptContract for the actual call,
// but we define the citation validation schema here.
export const CitationPresenceSchema = z.object({
  hasCitations: z.boolean(),
  answeredFromContext: z.boolean(),
})

export type CitationPresence = z.infer<typeof CitationPresenceSchema>

export const RAG_SYSTEM_PROMPT = `You are a precise research assistant. Answer questions ONLY from the provided context chunks.
Rules:
- Cite every factual claim with [^n] where n is the chunk number.
- If the context does not contain enough information to answer, say "I don't have enough information in the provided context to answer that."
- Do not invent or infer facts not present in the context.
- Keep answers concise unless the question requires detail.`

export function buildRagUserPrompt(
  query: string,
  chunks: Array<{ n: number; text: string; path: string }>,
): string {
  const context = chunks.map((c) => `[^${c.n}] (${c.path})\n${c.text}`).join('\n\n---\n\n')
  return `Context:\n\n${context}\n\n---\n\nQuestion: ${query}`
}

// Contract for validating citation presence (post-hoc check)
export const CITATION_VALIDATE_V1: PromptContract<CitationPresence> = {
  id: 'rag.citation.validate.v1',
  role: 'classifier',
  system: 'Check whether the answer uses citations and answers from context. Reply JSON only.',
  userTemplate: (ctx) =>
    `Answer: "${(ctx['answer'] ?? '').slice(0, 500)}"\n\nDoes it contain [^n] citations? Does it appear to answer from provided context?\nJSON: {"hasCitations": true/false, "answeredFromContext": true/false}`,
  outputSchema: CitationPresenceSchema,
  maxTokens: 40,
  temperature: 0,
}
