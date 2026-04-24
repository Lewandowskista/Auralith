import { z } from 'zod'
import { registerHandler } from '../router'
import type { DbBundle } from '@auralith/core-db'
import type Database from 'better-sqlite3'
import {
  findBrowserHistoryPaths,
  readBrowserHistory,
  importBrowserHistory,
} from '../../ingest/browser-history-importer'

type IngestDeps = {
  bundle: DbBundle
  sqlite: Database.Database
}

let _deps: IngestDeps | null = null

export function initIngestDeps(deps: IngestDeps): void {
  _deps = deps
}

function getDeps(): IngestDeps {
  if (!_deps) throw new Error('Ingest deps not initialized')
  return _deps
}

export function registerIngestHandlers(): void {
  registerHandler('ingest.listBrowserProfiles', async () => {
    const profiles = findBrowserHistoryPaths()
    return { profiles: profiles.map((p) => ({ browser: p.browser, path: p.path })) }
  })

  registerHandler('ingest.importBrowserHistory', async (params) => {
    const { path, limit } = z
      .object({
        path: z.string(),
        limit: z.number().int().min(100).max(50_000).default(10_000),
      })
      .parse(params)

    const { sqlite } = getDeps()

    let rows
    try {
      rows = readBrowserHistory(path, limit)
    } catch (err) {
      throw new Error(
        `Could not read browser history: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const result = importBrowserHistory(rows, sqlite)
    return result
  })

  registerHandler('ingest.listBrowserHistory', async (params) => {
    const { limit, offset, query } = z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
        query: z.string().optional(),
      })
      .parse(params)

    const { sqlite } = getDeps()

    type HistoryRow = {
      id: string
      url: string
      title: string | null
      visitTime: number
      visitCount: number
    }
    const rows: HistoryRow[] = query
      ? (sqlite
          .prepare(
            `
          SELECT id, url, title, visit_time as visitTime, visit_count as visitCount
          FROM browser_history_imports
          WHERE url LIKE ? OR title LIKE ?
          ORDER BY visit_time DESC
          LIMIT ? OFFSET ?
        `,
          )
          .all(`%${query}%`, `%${query}%`, limit, offset) as HistoryRow[])
      : (sqlite
          .prepare(
            `
          SELECT id, url, title, visit_time as visitTime, visit_count as visitCount
          FROM browser_history_imports
          ORDER BY visit_time DESC
          LIMIT ? OFFSET ?
        `,
          )
          .all(limit, offset) as HistoryRow[])

    return { rows }
  })
}
