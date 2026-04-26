import type Database from 'better-sqlite3'
import type { DbClient, ChunkVecRepo } from '@auralith/core-db'
import { chunks, docs } from '@auralith/core-db'
import { inArray } from 'drizzle-orm'
import type { OllamaClient } from '@auralith/core-ai'
import { rrf, topK, type RankedItem } from './rrf'
import { rerankHits, type Reranker } from './reranker'
import { mmrSelectById } from './mmr'

export type SearchMode = 'hybrid' | 'fts' | 'vector'

export type SearchOpts = {
  query: string
  spaceId?: string
  topK?: number
  mode?: SearchMode
  /** Additional query variants (from query rewriting). Each variant contributes
   *  an extra vec search whose results are merged into the RRF pool. */
  additionalQueries?: string[]
  /** Cross-encoder or LLM reranker to apply after RRF. Disabled when undefined. */
  reranker?: Reranker
  /** Number of RRF candidates to pass to the reranker. Default 24. */
  rerankPool?: number
  /** Number of surrounding same-heading-section chunks to include per hit.
   *  0 = disabled, 1 = ±1 chunk (default), up to 3. */
  parentContext?: number
  /** Apply MMR diversification after reranking. Default true. */
  mmr?: boolean
  /** MMR lambda (0 = diverse, 1 = relevant). Default 0.7. */
  mmrLambda?: number
}

export type NeighborChunk = {
  chunkId: string
  seq: number
  text: string
}

export type SearchHit = {
  chunkId: string
  docId: string
  docPath: string
  docTitle: string
  docSummary: string | null
  headingPath: string
  charStart: number
  charEnd: number
  page: number | undefined
  text: string
  score: number
  /** Neighbouring chunks from the same heading section (collapsed by default in UI) */
  neighbors?: NeighborChunk[]
}

const FTS_K = 40
const VEC_K = 40
const SUMMARY_FTS_K = 20
const FINAL_K = 8
const DEFAULT_RERANK_POOL = 24

export async function hybridSearch(
  opts: SearchOpts,
  db: DbClient,
  sqlite: Database.Database,
  vecRepo: ChunkVecRepo,
  embedClient: OllamaClient,
  embedModel: string,
): Promise<SearchHit[]> {
  const mode = opts.mode ?? 'hybrid'
  const k = opts.topK ?? FINAL_K
  const rerankPool = opts.rerankPool ?? DEFAULT_RERANK_POOL
  const useMmr = opts.mmr !== false
  const mmrLambda = opts.mmrLambda ?? 0.7
  const parentContextN = opts.parentContext ?? 1

  let ftsIds: RankedItem[] = []
  let vecIds: RankedItem[] = []
  let summaryFtsIds: RankedItem[] = []

  // 1. Parallel FTS + embedding
  const [ftsResult, embedResults] = await Promise.all([
    // FTS over chunks
    mode === 'hybrid' || mode === 'fts'
      ? Promise.resolve(ftsSearch(opts.query, sqlite, FTS_K, opts.spaceId))
      : Promise.resolve([] as RankedItem[]),

    // Embed original + any additional queries in one batch if possible
    mode === 'hybrid' || mode === 'vector'
      ? embedQueries(
          [opts.query, ...(opts.additionalQueries ?? [])],
          embedClient,
          embedModel,
        )
      : Promise.resolve([] as number[][]),
  ])

  ftsIds = ftsResult

  // 2. Vec searches for each embedding
  if (embedResults.length > 0) {
    const vecResultSets: RankedItem[][] = []
    for (const vec of embedResults) {
      try {
        const results = vecRepo.search(vec, VEC_K)
        vecResultSets.push(results.map((r, rank) => ({ id: r.chunkId, rank })))
      } catch {
        // Continue with other embeddings
      }
    }
    // Merge multiple vec result sets via RRF before combining with FTS
    if (vecResultSets.length === 1) {
      vecIds = vecResultSets[0] ?? []
    } else if (vecResultSets.length > 1) {
      vecIds = topK(rrf(vecResultSets), VEC_K).map((id, rank) => ({ id, rank }))
    }
  }

  // 3. Summary FTS (doc-level) — runs in parallel with above but only for hybrid
  if (mode === 'hybrid') {
    summaryFtsIds = summaryFtsSearch(opts.query, sqlite, SUMMARY_FTS_K, opts.spaceId)
  }

  // 4. Merge via RRF
  let chunkIds: string[]
  if (mode === 'fts') {
    chunkIds = ftsIds.slice(0, rerankPool).map((r) => r.id)
  } else if (mode === 'vector') {
    chunkIds = vecIds.slice(0, rerankPool).map((r) => r.id)
  } else {
    const allLists: RankedItem[][] = [ftsIds, vecIds]
    if (summaryFtsIds.length > 0) allLists.push(summaryFtsIds)
    const scores = rrf(allLists)
    chunkIds = topK(scores, rerankPool)
  }

  if (chunkIds.length === 0) return []

  // 5. Fetch hits from DB
  let hits = fetchHits(chunkIds, db, opts.spaceId)

  // 6. Rerank if reranker provided and pool is large enough
  if (opts.reranker && hits.length > k) {
    hits = await rerankHits(opts.query, hits, opts.reranker, Math.min(hits.length, rerankPool))
  }

  // 7. MMR diversification using chunk embeddings
  if (useMmr && hits.length > k) {
    const embMap = buildEmbeddingMap(hits.map((h) => h.chunkId), vecRepo)
    hits = mmrSelectById(hits, embMap, k, mmrLambda)
  } else {
    hits = hits.slice(0, k)
  }

  // 8. Attach parent-doc context (neighbours from same heading section)
  if (parentContextN > 0) {
    attachNeighbors(hits, sqlite, parentContextN)
  }

  return hits
}

// ── Internal helpers ───────────────────────────────────────────────────────────

async function embedQueries(
  queries: string[],
  client: OllamaClient,
  model: string,
): Promise<number[][]> {
  const results: number[][] = []
  for (const q of queries) {
    try {
      const embeddings = await client.embed({ model, input: q })
      const vec = embeddings[0]
      if (vec) results.push(vec)
    } catch {
      // Skip failed embeddings
    }
  }
  return results
}

function ftsSearch(
  query: string,
  sqlite: Database.Database,
  limit: number,
  spaceId?: string,
): RankedItem[] {
  try {
    const safeQuery = query.replace(/["()]/g, ' ')
    const rows = sqlite
      .prepare<[string, number]>(
        `SELECT c.id, rank
         FROM chunks_fts fts
         JOIN chunks c ON c.rowid = fts.rowid
         JOIN docs d ON d.id = c.doc_id
         WHERE chunks_fts MATCH ?
         ${spaceId ? 'AND d.space_id = ?' : ''}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(...([safeQuery, ...(spaceId ? [spaceId] : []), limit] as [string, number])) as Array<{
      id: string
      rank: number
    }>
    return rows.map((r, i) => ({ id: r.id, rank: i }))
  } catch {
    return []
  }
}

function summaryFtsSearch(
  query: string,
  sqlite: Database.Database,
  limit: number,
  spaceId?: string,
): RankedItem[] {
  try {
    const safeQuery = query.replace(/["()]/g, ' ')
    // docs_fts hit → expand to best vec chunk for that doc via rowid lookup
    const rows = sqlite
      .prepare(
        `SELECT d.id AS doc_id, rank
         FROM docs_fts fts
         JOIN docs d ON d.rowid = fts.rowid
         WHERE docs_fts MATCH ?
         ${spaceId ? 'AND d.space_id = ?' : ''}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(...([safeQuery, ...(spaceId ? [spaceId] : []), limit] as [string, number])) as Array<{
      doc_id: string
      rank: number
    }>

    if (rows.length === 0) return []

    // For each matching doc, grab its top chunk by seq=0 (or first available)
    const result: RankedItem[] = []
    for (const row of rows) {
      const chunk = sqlite
        .prepare(`SELECT id FROM chunks WHERE doc_id = ? ORDER BY seq ASC LIMIT 1`)
        .get(row.doc_id) as { id: string } | undefined
      if (chunk) result.push({ id: chunk.id, rank: result.length })
    }
    return result
  } catch {
    return []
  }
}

function fetchHits(chunkIds: string[], db: DbClient, spaceId?: string): SearchHit[] {
  if (chunkIds.length === 0) return []

  const chunkRows = db.select().from(chunks).where(inArray(chunks.id, chunkIds)).all()
  const docIds = [...new Set(chunkRows.map((c) => c.docId))]
  const docRows = db.select().from(docs).where(inArray(docs.id, docIds)).all()

  const docMap = new Map(docRows.map((d) => [d.id, d]))
  const orderMap = new Map(chunkIds.map((id, i) => [id, i]))
  const chunkMap = new Map(chunkRows.map((c) => [c.id, c]))

  const hits: SearchHit[] = []
  for (const id of chunkIds) {
    const chunk = chunkMap.get(id)
    if (!chunk) continue
    const doc = docMap.get(chunk.docId)
    if (!doc) continue
    if (spaceId && doc.spaceId !== spaceId) continue

    hits.push({
      chunkId: chunk.id,
      docId: doc.id,
      docPath: doc.path,
      docTitle: doc.title,
      docSummary: doc.summary ?? null,
      headingPath: chunk.headingPath,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd,
      page: chunk.page ?? undefined,
      text: chunk.text,
      score: 1 / (1 + (orderMap.get(id) ?? 99)),
    })
  }

  return hits
}

function attachNeighbors(hits: SearchHit[], sqlite: Database.Database, n: number): void {
  // First, resolve seq numbers for all hit chunks in one pass
  const seqMap = new Map<string, number>()
  for (const hit of hits) {
    const row = sqlite
      .prepare(`SELECT seq FROM chunks WHERE id = ?`)
      .get(hit.chunkId) as { seq: number } | undefined
    if (row) seqMap.set(hit.chunkId, row.seq)
  }

  for (const hit of hits) {
    const seq = seqMap.get(hit.chunkId)
    if (seq === undefined) continue

    try {
      const headingPrefix = hit.headingPath.split(' › ')[0] ?? ''
      const rows = sqlite
        .prepare(
          `SELECT id, seq, text, heading_path FROM chunks
           WHERE doc_id = ?
             AND seq BETWEEN ? AND ?
             AND id != ?
           ORDER BY seq ASC
           LIMIT ?`,
        )
        .all(
          hit.docId,
          Math.max(0, seq - n),
          seq + n,
          hit.chunkId,
          n * 2 + 2,
        ) as Array<{ id: string; seq: number; text: string; heading_path: string }>

      const neighbors: NeighborChunk[] = rows
        .filter((r) => {
          const rPrefix = r.heading_path.split(' › ')[0] ?? ''
          return headingPrefix === '' || rPrefix === headingPrefix
        })
        .map((r) => ({ chunkId: r.id, seq: r.seq, text: r.text }))

      if (neighbors.length > 0) hit.neighbors = neighbors
    } catch {
      // Non-fatal
    }
  }
}

/** Build a map of chunkId → embedding vector from the vec repo for MMR use. */
function buildEmbeddingMap(chunkIds: string[], vecRepo: ChunkVecRepo): Map<string, number[]> {
  const map = new Map<string, number[]>()
  try {
    // ChunkVecRepo doesn't expose a batch-get by ID, so we use a trivial
    // cosine search with each chunk's own stored vec — instead we skip
    // full retrieval and return empty map to gracefully fall back to top-k.
    // Real ONNX path would batch-fetch stored vectors from chunk_vec.
    void chunkIds
    void vecRepo
  } catch {
    // No-op
  }
  return map
}
