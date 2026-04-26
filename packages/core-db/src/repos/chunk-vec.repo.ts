import type { Database } from 'better-sqlite3'

export type ChunkVecRepo = ReturnType<typeof createChunkVecRepo>

const EMBEDDING_DIM = 768

export function createChunkVecRepo(sqlite: Database) {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vec USING vec0(
      chunk_id TEXT PRIMARY KEY,
      embedding float[${EMBEDDING_DIM}]
    );
  `)

  const insertStmt = sqlite.prepare<[string, Buffer]>(`
    INSERT INTO chunk_vec(chunk_id, embedding)
    VALUES (?, ?)
  `)

  const deleteStmt = sqlite.prepare<[string]>(`
    DELETE FROM chunk_vec WHERE chunk_id = ?
  `)

  const deleteByDocStmt = sqlite.prepare<[string]>(`
    DELETE FROM chunk_vec WHERE chunk_id IN (
      SELECT id FROM chunks WHERE doc_id = ?
    )
  `)

  const replaceEmbedding = sqlite.transaction((chunkId: string, embedding: Buffer) => {
    deleteStmt.run(chunkId)
    insertStmt.run(chunkId, embedding)
  })

  function upsert(chunkId: string, embedding: number[]): void {
    if (embedding.length !== EMBEDDING_DIM) {
      throw new Error(`Expected ${EMBEDDING_DIM}-dim embedding, got ${embedding.length}`)
    }
    const buf = Buffer.allocUnsafe(embedding.length * 4)
    for (let i = 0; i < embedding.length; i++) {
      buf.writeFloatLE(embedding[i] ?? 0, i * 4)
    }
    replaceEmbedding(chunkId, buf)
  }

  function remove(chunkId: string): void {
    deleteStmt.run(chunkId)
  }

  function removeByDoc(docId: string): void {
    deleteByDocStmt.run(docId)
  }

  function search(
    queryEmbedding: number[],
    topK = 40,
  ): Array<{ chunkId: string; distance: number }> {
    if (queryEmbedding.length !== EMBEDDING_DIM) {
      throw new Error(`Expected ${EMBEDDING_DIM}-dim query, got ${queryEmbedding.length}`)
    }
    const buf = Buffer.allocUnsafe(queryEmbedding.length * 4)
    for (let i = 0; i < queryEmbedding.length; i++) {
      buf.writeFloatLE(queryEmbedding[i] ?? 0, i * 4)
    }
    const rows = sqlite
      .prepare<[Buffer, number]>(
        `
        SELECT chunk_id, distance
        FROM chunk_vec
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      `,
      )
      .all(buf, topK) as Array<{ chunk_id: string; distance: number }>

    return rows.map((r) => ({ chunkId: r.chunk_id, distance: r.distance }))
  }

  function getByIds(chunkIds: string[]): Array<{ chunkId: string; embedding: number[] }> {
    if (chunkIds.length === 0) return []
    const placeholders = chunkIds.map(() => '?').join(',')
    const rows = sqlite
      .prepare<
        string[]
      >(`SELECT chunk_id, embedding FROM chunk_vec WHERE chunk_id IN (${placeholders})`)
      .all(...chunkIds) as Array<{ chunk_id: string; embedding: Buffer }>
    return rows.map((r) => {
      const floats: number[] = []
      for (let i = 0; i < r.embedding.length; i += 4) {
        floats.push(r.embedding.readFloatLE(i))
      }
      return { chunkId: r.chunk_id, embedding: floats }
    })
  }

  return { upsert, remove, removeByDoc, search, getByIds }
}
