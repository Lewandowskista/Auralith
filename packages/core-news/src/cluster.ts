// DBSCAN-lite: groups items by cosine similarity on their title text.
// When embeddings are available they're used; otherwise falls back to
// keyword-overlap Jaccard similarity so clustering works offline too.

const COSINE_THRESHOLD = 0.3 // items within this similarity get same cluster
const MIN_CLUSTER_SIZE = 2 // singleton items remain unclustered

export type ClusterGroup = {
  indices: number[]
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0)
    na += (a[i] ?? 0) ** 2
    nb += (b[i] ?? 0) ** 2
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

function jaccard(a: string, b: string): number {
  const sa = new Set(a.toLowerCase().split(/\W+/).filter(Boolean))
  const sb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean))
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

export function clusterItems(
  items: Array<{ id: string; title: string }>,
  embeddings?: number[][],
): ClusterGroup[] {
  const n = items.length
  if (n === 0) return []

  const assigned = new Array<number | null>(n).fill(null)
  const groups: ClusterGroup[] = []

  function sim(i: number, j: number): number {
    const ei = embeddings?.[i]
    const ej = embeddings?.[j]
    if (ei && ej) {
      return cosine(ei, ej)
    }
    const ti = items[i]?.title ?? ''
    const tj = items[j]?.title ?? ''
    return jaccard(ti, tj)
  }

  for (let i = 0; i < n; i++) {
    if (assigned[i] !== null) continue
    const neighbors: number[] = []
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      if (sim(i, j) >= COSINE_THRESHOLD) neighbors.push(j)
    }
    if (neighbors.length + 1 < MIN_CLUSTER_SIZE) continue
    const groupIdx = groups.length
    groups.push({ indices: [i, ...neighbors] })
    assigned[i] = groupIdx
    for (const nb of neighbors) assigned[nb] = groupIdx
  }

  return groups
}
