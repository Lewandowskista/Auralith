import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { registerHandler } from '../router'
import type { DbBundle } from '@auralith/core-db'
import { spaces, folderRules, docs, chunks } from '@auralith/core-db'
import {
  BrainSearchParamsSchema,
  BrainGetChunkParamsSchema,
  BrainListSpacesParamsSchema,
  BrainCreateSpaceParamsSchema,
  BrainUpdateSpaceParamsSchema,
  BrainDeleteSpaceParamsSchema,
  BrainReindexParamsSchema,
  BrainListDocsParamsSchema,
} from '@auralith/core-domain'
import type { OllamaClient } from '@auralith/core-ai'
import { hybridSearch } from '@auralith/core-retrieval'
import type Database from 'better-sqlite3'
import { ingestFile } from '@auralith/core-ingest'
import { embedChunks } from '@auralith/core-ingest'
import { readdir } from 'fs/promises'
import { join } from 'path'

type BrainDeps = {
  bundle: DbBundle
  sqlite: Database.Database
  embedClient: OllamaClient
  embedModel: string
}

// Set by initBrainDeps from main process after Ollama is ready
let _deps: BrainDeps | null = null

export function initBrainDeps(deps: BrainDeps): void {
  _deps = deps
}

function getDeps(): BrainDeps {
  if (!_deps) throw new Error('Brain deps not initialized')
  return _deps
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function registerBrainHandlers(): void {
  registerHandler('brain.listSpaces', async (params) => {
    BrainListSpacesParamsSchema.parse(params)
    const { bundle } = getDeps()
    const rows = bundle.db.select().from(spaces).all()
    return {
      spaces: rows.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        createdAt: s.createdAt.getTime(),
      })),
    }
  })

  registerHandler('brain.createSpace', async (params) => {
    const { name, slug } = BrainCreateSpaceParamsSchema.parse(params)
    const { bundle } = getDeps()
    const id = randomUUID()
    const now = new Date()
    bundle.db
      .insert(spaces)
      .values({ id, name, slug: slug || slugify(name), createdAt: now, rulesJson: '[]' })
      .run()
    const row = bundle.db.select().from(spaces).where(eq(spaces.id, id)).get()
    if (!row) throw new Error('Created space could not be loaded')
    return {
      space: { id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt.getTime() },
    }
  })

  registerHandler('brain.updateSpace', async (params) => {
    const { id, name, slug } = BrainUpdateSpaceParamsSchema.parse(params)
    const { bundle } = getDeps()
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates['name'] = name
    if (slug !== undefined) updates['slug'] = slug
    bundle.db.update(spaces).set(updates).where(eq(spaces.id, id)).run()
    const row = bundle.db.select().from(spaces).where(eq(spaces.id, id)).get()
    if (!row) throw Object.assign(new Error('Space not found'), { code: 'NOT_FOUND' })
    return {
      space: { id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt.getTime() },
    }
  })

  registerHandler('brain.deleteSpace', async (params) => {
    const { id } = BrainDeleteSpaceParamsSchema.parse(params)
    const { bundle } = getDeps()
    bundle.db.delete(spaces).where(eq(spaces.id, id)).run()
    return { deleted: true }
  })

  registerHandler('brain.listDocs', async (params) => {
    const { spaceId, limit, offset } = BrainListDocsParamsSchema.parse(params)
    const { bundle } = getDeps()
    const query = bundle.db.select().from(docs)
    if (spaceId) query.where(eq(docs.spaceId, spaceId))
    const rows = query.limit(limit).offset(offset).all()
    const total = bundle.db.select().from(docs).all().length
    return {
      docs: rows.map((d) => ({
        id: d.id,
        path: d.path,
        kind: d.kind,
        title: d.title,
        size: d.size,
        mtime: d.mtime.getTime(),
        indexedAt: d.indexedAt?.getTime(),
        spaceId: d.spaceId ?? undefined,
      })),
      total,
    }
  })

  registerHandler('brain.getChunk', async (params) => {
    const { chunkId } = BrainGetChunkParamsSchema.parse(params)
    const { bundle } = getDeps()
    const row = bundle.db.select().from(chunks).where(eq(chunks.id, chunkId)).get()
    if (!row) throw new Error(`Chunk not found: ${chunkId}`)
    return {
      chunk: {
        id: row.id,
        docId: row.docId,
        seq: row.seq,
        headingPath: row.headingPath,
        charStart: row.charStart,
        charEnd: row.charEnd,
        page: row.page ?? undefined,
        text: row.text,
        tokens: row.tokens,
      },
    }
  })

  registerHandler('brain.search', async (params) => {
    const opts = BrainSearchParamsSchema.parse(params)
    const { bundle, sqlite, embedClient, embedModel } = getDeps()
    const hits = await hybridSearch(
      {
        query: opts.query,
        ...(opts.spaceId !== undefined ? { spaceId: opts.spaceId } : {}),
        ...(opts.topK !== undefined ? { topK: opts.topK } : {}),
        ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
      },
      bundle.db,
      sqlite,
      bundle.vec,
      embedClient,
      embedModel,
    )
    return {
      results: hits.map((h) => ({
        doc: {
          id: h.docId,
          path: h.docPath,
          kind: 'md' as const,
          title: h.docTitle,
          size: 0,
          mtime: 0,
        },
        citation: {
          chunkId: h.chunkId,
          docPath: h.docPath,
          headingPath: h.headingPath,
          charStart: h.charStart,
          charEnd: h.charEnd,
          page: h.page,
          text: h.text,
        },
        score: h.score,
      })),
    }
  })

  registerHandler('brain.reindex', async (params) => {
    const { spaceId, force } = BrainReindexParamsSchema.parse(params)
    const { bundle, sqlite, embedClient, embedModel } = getDeps()

    // Find folders from folder_rules for this space (or all spaces)
    const rules = spaceId
      ? bundle.db.select().from(folderRules).where(eq(folderRules.spaceId, spaceId)).all()
      : bundle.db.select().from(folderRules).all()

    void force
    let queued = 0
    for (const rule of rules) {
      // Walk directory for supported files
      const files = await walkDir(rule.path, ['.md', '.txt', '.pdf'])
      for (const file of files) {
        queued++
        // Fire-and-forget per file — errors are logged per-file
        void ingestFile(file, bundle.db, {
          spaceId: rule.spaceId,
          sqlite,
          onChunksReady: async (docId, texts) => {
            // Get chunk IDs for the doc
            const docChunks = bundle.db.select().from(chunks).where(eq(chunks.docId, docId)).all()
            await embedChunks(
              docId,
              docChunks.map((c) => c.id),
              texts,
              embedClient,
              embedModel,
              bundle.vec,
            )
          },
        }).catch((err: unknown) => {
          console.error(`[ingest] ${file}:`, err)
        })
      }
    }

    return { queued }
  })
}

async function walkDir(dir: string, exts: string[]): Promise<string[]> {
  const files: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true })
    for (const e of entries) {
      if (e.isFile()) {
        const name = e.name.toLowerCase()
        if (exts.some((ext) => name.endsWith(ext))) {
          files.push(join(e.parentPath ?? dir, e.name))
        }
      }
    }
  } catch {
    // Directory unreadable — skip
  }
  return files
}
