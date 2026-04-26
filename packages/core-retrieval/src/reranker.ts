/**
 * Cross-encoder reranker interface + LLM-fallback implementation.
 *
 * The ONNX bge-reranker-v2-m3 implementation lives in the desktop app's
 * services/reranker.service.ts and is injected at runtime. This module defines
 * the interface and provides a lightweight LLM-as-reranker fallback that uses
 * the phi4-mini model already resident in every preset — zero extra binary deps.
 */
import { z } from 'zod'
import type { OllamaClient } from '@auralith/core-ai'
import { runPrompt, type PromptContract } from '@auralith/core-ai'

export type Reranker = {
  /** Score each (query, passage) pair. Returns a score per passage (higher = more relevant). */
  score(query: string, passages: string[]): Promise<number[]>
}

// ── LLM-as-reranker (phi4-mini fallback) ──────────────────────────────────────

const RerankOutputSchema = z.object({
  scores: z.array(z.number().min(0).max(1)),
})

function buildRerankContract(n: number): PromptContract<z.infer<typeof RerankOutputSchema>> {
  return {
    id: 'rerank-v1',
    role: 'classifier',
    system: `You are a relevance scorer. Given a query and ${n} text passages,
rate each passage's relevance to the query from 0.0 (irrelevant) to 1.0 (highly relevant).
Output ONLY valid JSON with a "scores" array of ${n} numbers in the same order as the passages.`,
    userTemplate: (ctx) => ctx['input'] ?? '',
    outputSchema: RerankOutputSchema,
    maxTokens: 80,
    temperature: 0,
  }
}

export function createLlmReranker(client: OllamaClient, model: string): Reranker {
  return {
    async score(query, passages) {
      if (passages.length === 0) return []

      const passList = passages
        .map((p, i) => `[${i + 1}] ${p.slice(0, 300)}`)
        .join('\n\n')

      const contract = buildRerankContract(passages.length)
      const result = await runPrompt(
        contract,
        { input: `Query: ${query}\n\nPassages:\n${passList}` },
        client,
        model,
      )

      if (result.ok && result.data.scores.length === passages.length) {
        return result.data.scores
      }

      // Fallback: uniform scores (original RRF order preserved)
      return passages.map((_, i) => 1 - i / passages.length)
    },
  }
}

// ── Pool reranking ─────────────────────────────────────────────────────────────

/**
 * Re-orders hits by reranker score, returning the top-N.
 * Called after RRF merges the initial candidate pool (usually 20-30 hits).
 */
export async function rerankHits<T extends { text: string }>(
  query: string,
  hits: T[],
  reranker: Reranker,
  topN: number,
): Promise<T[]> {
  if (hits.length === 0) return []
  if (hits.length <= topN) return hits

  const scores = await reranker.score(
    query,
    hits.map((h) => h.text),
  )

  const indexed = hits.map((h, i) => ({ hit: h, score: scores[i] ?? 0 }))
  indexed.sort((a, b) => b.score - a.score)

  return indexed.slice(0, topN).map((x) => x.hit)
}
