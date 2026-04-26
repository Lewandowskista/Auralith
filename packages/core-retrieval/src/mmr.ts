/**
 * Maximal Marginal Relevance (MMR) diversification.
 *
 * Selects k items from a ranked list that are relevant to the query
 * but not redundant with each other.
 *
 * λ = 1.0 → pure relevance (preserves input order)
 * λ = 0.0 → pure diversity (maximises spread)
 * λ = 0.7 → recommended balance (relevance-first with gentle dedup)
 */

export type VectorHit = {
  id: string
  score: number
  embedding: number[]
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0)
    normA += (a[i] ?? 0) ** 2
    normB += (b[i] ?? 0) ** 2
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Apply MMR to a list of hits that have embeddings.
 * Returns a reordered/filtered list of up to k items.
 */
export function mmrSelect<T extends { id: string; score: number; embedding: number[] }>(
  hits: T[],
  k: number,
  lambda = 0.7,
): T[] {
  if (hits.length === 0) return []
  if (hits.length <= k) return hits

  const selected: T[] = []
  const remaining = [...hits]

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0
    let bestScore = -Infinity

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]
      if (!candidate) continue
      const relevance = candidate.score

      // Max similarity to already-selected set
      let maxSim = 0
      for (const sel of selected) {
        const sim = cosine(candidate.embedding, sel.embedding)
        if (sim > maxSim) maxSim = sim
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim
      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIdx = i
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0]
    if (!chosen) break
    selected.push(chosen)
  }

  return selected
}

/**
 * Lightweight MMR over SearchHit objects that don't carry embeddings.
 * Uses a precomputed embedding map keyed by chunkId.
 * Falls back gracefully (returns top-k by score) if embeddings are missing.
 */
export function mmrSelectById<T extends { chunkId: string; score: number }>(
  hits: T[],
  embeddingsByChunkId: Map<string, number[]>,
  k: number,
  lambda = 0.7,
): T[] {
  if (hits.length === 0) return []
  if (hits.length <= k) return hits

  // If embeddings aren't available for most hits, skip MMR
  const covered = hits.filter((h) => embeddingsByChunkId.has(h.chunkId)).length
  if (covered < hits.length * 0.5) return hits.slice(0, k)

  const withEmb = hits.map((h) => ({
    ...h,
    id: h.chunkId,
    embedding: embeddingsByChunkId.get(h.chunkId) ?? [],
  }))

  const selected = mmrSelect(withEmb as unknown as Array<T & { id: string; embedding: number[] }>, k, lambda)
  return selected as unknown as T[]
}
