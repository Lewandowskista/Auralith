import { randomUUID } from 'crypto'
import { createHash } from 'crypto'
import { eq } from 'drizzle-orm'
import type { DbBundle } from '@auralith/core-db'
import { docs, chunks } from '@auralith/core-db'
import type { OllamaClient } from '@auralith/core-ai'
import type Database from 'better-sqlite3'
import { chunkText } from '@auralith/core-ingest'
import { embedChunks } from '@auralith/core-ingest'

export type ClipPayload = {
  id?: string
  url: string
  title?: string
  text: string
  selection?: string
  html?: string
  clippedAt?: number
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}

export async function ingestClip(
  clip: ClipPayload,
  bundle: DbBundle,
  sqlite: Database.Database,
  embedClient: OllamaClient,
  embedModel: string,
): Promise<{ docId: string; chunkCount: number }> {
  const content = clip.selection?.trim()
    ? `${clip.selection}\n\n---\nSource: ${clip.url}`
    : clip.html
      ? htmlToText(clip.html)
      : clip.text

  const title = clip.title ?? new URL(clip.url).hostname
  const hash = createHash('sha256').update(content).digest('hex')
  const virtualPath = `web-clip:${clip.url}`
  const now = new Date(clip.clippedAt ?? Date.now())

  const existing = bundle.db.select().from(docs).where(eq(docs.path, virtualPath)).get()

  if (existing && existing.hash === hash) {
    return { docId: existing.id, chunkCount: 0 }
  }

  const docId = existing?.id ?? randomUUID()

  if (existing) {
    bundle.db.update(docs).set({ title, hash, indexedAt: now }).where(eq(docs.id, docId)).run()
  } else {
    bundle.db
      .insert(docs)
      .values({
        id: docId,
        path: virtualPath,
        kind: 'txt',
        title,
        size: content.length,
        mtime: now,
        hash,
        indexedAt: now,
        redactedFlags: '{}',
      })
      .run()
  }

  bundle.db.delete(chunks).where(eq(chunks.docId, docId)).run()

  const rawChunks = chunkText(content)
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

  for (let i = 0; i < chunkRows.length; i += 100) {
    bundle.db
      .insert(chunks)
      .values(chunkRows.slice(i, i + 100))
      .run()
  }

  // Update FTS
  try {
    sqlite
      .prepare(`DELETE FROM chunks_fts WHERE rowid IN (SELECT rowid FROM chunks WHERE doc_id = ?)`)
      .run(docId)
    const insertFts = sqlite.prepare(`INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)`)
    for (const row of chunkRows) {
      const r = sqlite.prepare(`SELECT rowid FROM chunks WHERE id = ?`).get(row.id) as
        | { rowid: number }
        | undefined
      if (r) insertFts.run(r.rowid, row.text)
    }
  } catch {
    // Non-fatal
  }

  // Embed
  try {
    const chunkVecRepo = bundle.vec
    await embedChunks(
      docId,
      chunkRows.map((r) => r.id),
      chunkRows.map((r) => r.text),
      embedClient,
      embedModel,
      chunkVecRepo,
    )
  } catch {
    // Non-fatal — still searchable via FTS
  }

  return { docId, chunkCount: chunkRows.length }
}
