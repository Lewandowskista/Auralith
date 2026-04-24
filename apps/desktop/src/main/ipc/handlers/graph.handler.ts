import { z } from 'zod'
import { registerHandler } from '../router'
import type { DbBundle } from '@auralith/core-db'
import type Database from 'better-sqlite3'

type GraphDeps = {
  bundle: DbBundle
  sqlite: Database.Database
}

let _deps: GraphDeps | null = null

export function initGraphDeps(deps: GraphDeps): void {
  _deps = deps
}

function getDeps(): GraphDeps {
  if (!_deps) throw new Error('Graph deps not initialized')
  return _deps
}

export type GraphNode = {
  id: string
  label: string
  kind: 'space' | 'doc' | 'chunk' | 'event'
  size?: number
}

export type GraphEdge = {
  source: string
  target: string
  kind: 'space->doc' | 'doc->chunk' | 'chunk->event'
  weight?: number
}

export function registerGraphHandlers(): void {
  registerHandler('graph.build', async (params) => {
    const { spaceId, maxDocs, maxChunksPerDoc } = z
      .object({
        spaceId: z.string().optional(),
        maxDocs: z.number().int().min(1).max(500).default(100),
        maxChunksPerDoc: z.number().int().min(0).max(20).default(5),
      })
      .parse(params)

    const { sqlite } = getDeps()

    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const nodeIds = new Set<string>()

    function addNode(n: GraphNode): void {
      if (!nodeIds.has(n.id)) {
        nodeIds.add(n.id)
        nodes.push(n)
      }
    }

    // Load spaces
    type SpaceRow = { id: string; name: string }
    const spaces = sqlite
      .prepare(`SELECT id, name FROM spaces ORDER BY name LIMIT 50`)
      .all() as SpaceRow[]
    for (const s of spaces) {
      addNode({ id: `space:${s.id}`, label: s.name, kind: 'space', size: 20 })
    }

    // Load docs
    type DocRow = {
      id: string
      title: string
      spaceId: string | null
      kind: string
      indexedAt: number | null
    }
    const docQuery = spaceId
      ? `SELECT id, title, space_id AS spaceId, kind, indexed_at AS indexedAt FROM docs WHERE space_id = ? ORDER BY indexed_at DESC LIMIT ?`
      : `SELECT id, title, space_id AS spaceId, kind, indexed_at AS indexedAt FROM docs ORDER BY indexed_at DESC LIMIT ?`
    const docRows: DocRow[] = spaceId
      ? (sqlite.prepare(docQuery).all(spaceId, maxDocs) as DocRow[])
      : (sqlite.prepare(docQuery).all(maxDocs) as DocRow[])

    for (const d of docRows) {
      addNode({ id: `doc:${d.id}`, label: d.title.slice(0, 40), kind: 'doc', size: 12 })
      if (d.spaceId) {
        edges.push({ source: `space:${d.spaceId}`, target: `doc:${d.id}`, kind: 'space->doc' })
      }
    }

    // Load chunks (sample top N per doc)
    if (maxChunksPerDoc > 0) {
      for (const d of docRows) {
        type ChunkRow = { id: string; headingPath: string; seq: number }
        const chunkRows = sqlite
          .prepare(
            `SELECT id, heading_path AS headingPath, seq FROM chunks WHERE doc_id = ? ORDER BY seq ASC LIMIT ?`,
          )
          .all(d.id, maxChunksPerDoc) as ChunkRow[]

        for (const c of chunkRows) {
          const label = c.headingPath || `chunk ${c.seq + 1}`
          addNode({ id: `chunk:${c.id}`, label: label.slice(0, 30), kind: 'chunk', size: 6 })
          edges.push({ source: `doc:${d.id}`, target: `chunk:${c.id}`, kind: 'doc->chunk' })
        }
      }
    }

    // Connect events to docs that share the same path
    type EventRow = { id: string; kind: string; path: string }
    const eventRows = sqlite
      .prepare(
        `SELECT id, kind, path FROM events WHERE kind IN ('file.created','file.modified','file.deleted') ORDER BY ts DESC LIMIT 200`,
      )
      .all() as EventRow[]

    type DocPathRow = { id: string; path: string }
    const docPaths = sqlite
      .prepare(`SELECT id, path FROM docs WHERE path NOT LIKE 'web-clip:%'`)
      .all() as DocPathRow[]
    const docPathMap = new Map(docPaths.map((d) => [d.path, d.id]))

    for (const e of eventRows) {
      const docId = docPathMap.get(e.path)
      if (!docId) continue
      if (!nodeIds.has(`doc:${docId}`)) continue
      addNode({ id: `event:${e.id}`, label: e.kind, kind: 'event', size: 4 })
      edges.push({ source: `chunk:${docId}`, target: `event:${e.id}`, kind: 'chunk->event' })
    }

    return { nodes, edges }
  })
}
