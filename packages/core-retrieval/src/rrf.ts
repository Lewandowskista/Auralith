// Reciprocal Rank Fusion — merges ranked lists from FTS and vector search
// RRF(d) = Σ 1/(k + rank(d)) where k=60 (standard constant)

const K = 60

export type RankedItem = { id: string; rank: number }

export function rrf(lists: RankedItem[][]): Map<string, number> {
  const scores = new Map<string, number>()
  for (const list of lists) {
    for (const item of list) {
      const current = scores.get(item.id) ?? 0
      scores.set(item.id, current + 1 / (K + item.rank + 1))
    }
  }
  return scores
}

export function topK(scores: Map<string, number>, k: number): string[] {
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id]) => id)
}
