import { z } from 'zod'
import type { PromptContract } from '../runtime'
import { formatToon, formatXmlBlock } from '../prompt-format'

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
- Keep answers concise unless the question requires detail.
- At the end of your answer, list the chunk ids you used as: Sources: [^n], [^n], ...`

// Threshold for switching from TOON-like records to XML blocks per chunk.
// Chunks shorter than this are packed into a TOON table for token efficiency;
// longer chunks get their own XML block so content is clearly delimited and
// prompt-injection-resistant.
const LONG_CHUNK_THRESHOLD = 400

export type RagChunk = {
  n: number
  text: string
  path: string
  title?: string
  score?: number
}

/**
 * Build the user-turn message for a RAG answer.
 *
 * Format strategy (local small-model optimized):
 *   - Short chunks (< 400 chars): packed into a TOON-like compact record table.
 *     Saves tokens by removing repetitive "Chunk N / path:" prefixes.
 *   - Long chunks (>= 400 chars): each gets its own XML-style block.
 *     Clearly delimits untrusted content and prevents prompt injection.
 *   - Mixed: short chunks are grouped in a TOON block, then long chunks follow as XML blocks.
 */
export function buildRagUserPrompt(query: string, chunks: RagChunk[]): string {
  if (chunks.length === 0) {
    return `Context: (none)\n\n---\n\nQuestion: ${query}`
  }

  const shortChunks = chunks.filter((c) => c.text.length < LONG_CHUNK_THRESHOLD)
  const longChunks = chunks.filter((c) => c.text.length >= LONG_CHUNK_THRESHOLD)

  const parts: string[] = []

  if (shortChunks.length > 0) {
    // TOON-like records for compact short chunks.
    // n is the citation number the model should use in [^n] references.
    const toon = formatToon(
      shortChunks.map((c) => ({
        n: c.n,
        path: c.path,
        ...(c.title ? { title: c.title } : {}),
        ...(c.score !== undefined ? { score: c.score.toFixed(2) } : {}),
        text: c.text,
      })),
      ['n', 'path', ...(shortChunks.some((c) => c.title) ? ['title'] : []), 'text'],
      'chunks',
    )
    parts.push(toon)
  }

  if (longChunks.length > 0) {
    // XML-style blocks for long chunks — untrusted content clearly delimited.
    const xmlBlocks = longChunks.map((c) =>
      formatXmlBlock('chunk', c.text, {
        n: c.n,
        path: c.path,
        ...(c.title ? { title: c.title } : {}),
        ...(c.score !== undefined ? { score: c.score.toFixed(2) } : {}),
      }),
    )
    parts.push(xmlBlocks.join('\n\n'))
  }

  return `Context:\n\n${parts.join('\n\n')}\n\n---\n\nQuestion: ${query}`
}

// Contract for validating citation presence (post-hoc check).
// Output is strict JSON — never changes regardless of input format.
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
