import type Database from 'better-sqlite3'
import type { DbClient, ChunkVecRepo } from '@auralith/core-db'
import { chunks, docs } from '@auralith/core-db'
import { inArray } from 'drizzle-orm'
import type { OllamaClient } from '@auralith/core-ai'
import { rrf, topK, type RankedItem } from './rrf'

export type SearchMode = 'hybrid' | 'fts' | 'vector'

export type SearchOpts = {
  query: string
  spaceId?: string
  topK?: number
  mode?: SearchMode
}

export type SearchHit = {
  chunkId: string
  docId: string
  docPath: string
  docTitle: string
  headingPath: string
  charStart: number
  charEnd: number
  page: number | undefined
  text: string
  score: number
}

const FTS_K = 40
const VEC_K = 40
const FINAL_K = 8

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

  let ftsIds: RankedItem[] = []
  let vecIds: RankedItem[] = []

  if (mode === 'hybrid' || mode === 'fts') {
    ftsIds = ftsSearch(opts.query, sqlite, FTS_K, opts.spaceId)
  }

  if (mode === 'hybrid' || mode === 'vector') {
    try {
      const embeddings = await embedClient.embed({ model: embedModel, input: opts.query })
      const vec = embeddings[0]
      if (vec) {
        const results = vecRepo.search(vec, VEC_K)
        vecIds = results.map((r, rank) => ({ id: r.chunkId, rank }))
      }
    } catch {
      // Embedding failed (Ollama offline) — fall back to FTS-only
      if (mode === 'vector') return []
    }
  }

  // Merge via RRF
  let chunkIds: string[]
  if (mode === 'fts') {
    chunkIds = ftsIds.slice(0, k).map((r) => r.id)
  } else if (mode === 'vector') {
    chunkIds = vecIds.slice(0, k).map((r) => r.id)
  } else {
    const scores = rrf([ftsIds, vecIds])
    chunkIds = topK(scores, k)
  }

  if (chunkIds.length === 0) return []

  // Fetch chunk + doc data
  return fetchHits(chunkIds, db, opts.spaceId)
}

function ftsSearch(
  query: string,
  sqlite: Database.Database,
  limit: number,
  spaceId?: string,
): RankedItem[] {
  try {
    // FTS5 match query — escape special chars
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

function fetchHits(chunkIds: string[], db: DbClient, spaceId?: string): SearchHit[] {
  if (chunkIds.length === 0) return []

  const chunkRows = db.select().from(chunks).where(inArray(chunks.id, chunkIds)).all()

  const docIds = [...new Set(chunkRows.map((c) => c.docId))]
  const docRows = db.select().from(docs).where(inArray(docs.id, docIds)).all()

  const docMap = new Map(docRows.map((d) => [d.id, d]))

  // Maintain RRF order
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
