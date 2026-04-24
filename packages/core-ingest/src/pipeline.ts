import { createHash, randomUUID } from 'crypto'
import { statSync } from 'fs'
import { eq } from 'drizzle-orm'
import type { DbClient } from '@auralith/core-db'
import type Database from 'better-sqlite3'
import { docs, chunks } from '@auralith/core-db'
import { parseMd } from './parsers/md'
import { parseTxt } from './parsers/txt'
import { parsePdf } from './parsers/pdf'
import { parseDocx } from './parsers/docx'
import { parseHtml } from './parsers/html'
import { parseEpub } from './parsers/epub'
import { chunkText } from './chunker'

export type IngestResult =
  | { status: 'indexed'; docId: string; chunkCount: number }
  | { status: 'skipped'; docId: string; reason: 'unchanged' }
  | { status: 'error'; path: string; error: string }

export type DocKind = 'md' | 'txt' | 'pdf' | 'docx' | 'html' | 'epub'

function detectKind(path: string): DocKind | null {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'md') return 'md'
  if (ext === 'txt') return 'txt'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'epub') return 'epub'
  return null
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export async function ingestFile(
  filePath: string,
  db: DbClient,
  opts: {
    spaceId?: string
    sqlite?: Database.Database
    onChunksReady?: (docId: string, chunkTexts: string[]) => Promise<void>
  } = {},
): Promise<IngestResult> {
  const kind = detectKind(filePath)
  if (!kind) return { status: 'error', path: filePath, error: 'Unsupported file type' }

  let stat
  try {
    stat = statSync(filePath)
  } catch (err) {
    return {
      status: 'error',
      path: filePath,
      error: err instanceof Error ? err.message : 'stat failed',
    }
  }

  // Check existing doc — skip if hash unchanged
  const existing = db.select().from(docs).where(eq(docs.path, filePath)).get()

  let parsed: { text: string; title: string }
  let pageTexts: string[] | undefined

  try {
    if (kind === 'md') parsed = parseMd(filePath)
    else if (kind === 'txt') parsed = parseTxt(filePath)
    else if (kind === 'docx') parsed = parseDocx(filePath)
    else if (kind === 'html') parsed = parseHtml(filePath)
    else if (kind === 'epub') parsed = parseEpub(filePath)
    else {
      const pdfResult = await parsePdf(filePath)
      parsed = pdfResult
      pageTexts = pdfResult.pageTexts
    }
  } catch (err) {
    return {
      status: 'error',
      path: filePath,
      error: err instanceof Error ? err.message : 'parse failed',
    }
  }

  const hash = hashContent(parsed.text)

  if (existing && existing.hash === hash) {
    return { status: 'skipped', docId: existing.id, reason: 'unchanged' }
  }

  const docId = existing?.id ?? randomUUID()
  const now = new Date()

  // Build page map for PDFs (charOffset → page number)
  let pageMap: Map<number, number> | undefined
  if (pageTexts && pageTexts.length > 0) {
    pageMap = new Map()
    let offset = 0
    for (let i = 0; i < pageTexts.length; i++) {
      pageMap.set(offset, i + 1)
      offset += (pageTexts[i]?.length ?? 0) + 1
    }
  }

  const rawChunks = chunkText(parsed.text, pageMap)

  // Upsert doc
  if (existing) {
    db.update(docs)
      .set({
        title: parsed.title,
        size: stat.size,
        mtime: new Date(stat.mtimeMs),
        hash,
        indexedAt: now,
        spaceId: opts.spaceId ?? null,
      })
      .where(eq(docs.id, docId))
      .run()
  } else {
    db.insert(docs)
      .values({
        id: docId,
        path: filePath,
        kind,
        title: parsed.title,
        size: stat.size,
        mtime: new Date(stat.mtimeMs),
        hash,
        indexedAt: now,
        spaceId: opts.spaceId ?? null,
        redactedFlags: '{}',
      })
      .run()
  }

  // Delete old chunks
  db.delete(chunks).where(eq(chunks.docId, docId)).run()

  // Insert new chunks
  const chunkRows = rawChunks.map((c) => ({
    id: randomUUID(),
    docId,
    seq: c.seq,
    headingPath: c.headingPath,
    charStart: c.charStart,
    charEnd: c.charEnd,
    page: c.page ?? null,
    text: c.text,
    tokens: c.tokens,
  }))

  if (chunkRows.length > 0) {
    // Insert in batches of 100 to avoid SQLite parameter limits
    for (let i = 0; i < chunkRows.length; i += 100) {
      db.insert(chunks)
        .values(chunkRows.slice(i, i + 100))
        .run()
    }
  }

  // Update FTS index (requires raw sqlite instance)
  if (opts.sqlite) {
    updateFts(
      opts.sqlite,
      docId,
      rawChunks.flatMap((c) => {
        const row = chunkRows[c.seq]
        return row ? [{ id: row.id, text: c.text }] : []
      }),
    )
  }

  // Call embedding hook if provided
  if (opts.onChunksReady) {
    await opts.onChunksReady(
      docId,
      rawChunks.map((c) => c.text),
    )
  }

  return { status: 'indexed', docId, chunkCount: rawChunks.length }
}

function updateFts(
  sqlite: Database.Database,
  docId: string,
  chunkData: Array<{ id: string; text: string }>,
): void {
  try {
    sqlite
      .prepare(`DELETE FROM chunks_fts WHERE rowid IN (SELECT rowid FROM chunks WHERE doc_id = ?)`)
      .run(docId)
    const insert = sqlite.prepare(`INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)`)
    for (const c of chunkData) {
      const row = sqlite.prepare(`SELECT rowid FROM chunks WHERE id = ?`).get(c.id) as
        | { rowid: number }
        | undefined
      if (row) insert.run(row.rowid, c.text)
    }
  } catch {
    // FTS sync failure is non-fatal — vector search still works
  }
}
