/**
 * Multi-query expansion via phi4-mini:3.8b.
 *
 * Generates 2 paraphrases + 1 keyword-only variant of the query.
 * All 4 queries (original + 3 rewrites) are embedded and their vec results
 * merged into the RRF pool before reranking, improving recall.
 *
 * Skip conditions (return [] — caller uses original query only):
 * - Query is < 4 words AND contains a quoted span (already keyword-shaped)
 * - Timeout: 1.5s hard cutoff
 * - Any model error
 */
import { z } from 'zod'
import type { OllamaClient } from '@auralith/core-ai'
import { runPrompt, type PromptContract } from '@auralith/core-ai'

const RewriteOutputSchema = z.object({
  paraphrases: z.array(z.string().min(3)).max(3),
  keywords: z.string().min(2),
})

type RewriteOutput = z.infer<typeof RewriteOutputSchema>

const QUERY_REWRITE_CONTRACT: PromptContract<RewriteOutput> = {
  id: 'query-rewrite-v1',
  role: 'classifier',
  system: `You are a search query optimizer. Given a user query, produce:
1. Two short paraphrases that capture the same intent with different wording
2. One keyword-only variant (3-5 key terms, no stop words)
Output ONLY valid JSON.`,
  userTemplate: (ctx) => `Query: "${ctx['query'] ?? ''}"\n\nOutput JSON: {"paraphrases": ["...", "..."], "keywords": "..."}`,
  outputSchema: RewriteOutputSchema,
  maxTokens: 100,
  temperature: 0,
}

/**
 * Returns additional query variants to expand the vec search pool.
 * Returns [] on skip or failure — caller should treat this gracefully.
 */
export async function rewriteQuery(
  query: string,
  client: OllamaClient,
  model: string,
  timeoutMs = 1500,
): Promise<string[]> {
  // Skip short queries that look like keyword searches already
  const words = query.trim().split(/\s+/)
  if (words.length < 4 && /["']/.test(query)) return []

  try {
    const raceResult = await Promise.race([
      runPrompt(QUERY_REWRITE_CONTRACT, { query }, client, model),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])

    if (!raceResult || !raceResult.ok) return []

    const rewrites: string[] = []
    for (const p of raceResult.data.paraphrases) {
      if (p && p.trim().length > 2) rewrites.push(p.trim())
    }
    if (raceResult.data.keywords.trim().length > 2) {
      rewrites.push(raceResult.data.keywords.trim())
    }

    return rewrites
  } catch {
    return []
  }
}
