import { existsSync, copyFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'

// browser_history_imports is created by the Wave 3 migration in core-db/client.ts

export type BrowserHistoryRow = {
  url: string
  title: string | null
  visitTime: number
  visitCount: number
}

type ChromeVisitRow = {
  url: string
  title: string | null
  last_visit_time: number
  visit_count: number
}

/** Chrome/Edge store time as microseconds since 1601-01-01. */
function chromeTimeToMs(chromeTime: number): number {
  const EPOCH_DELTA_MS = 11644473600000
  return Math.floor(chromeTime / 1000) - EPOCH_DELTA_MS
}

/** Find Chrome or Edge History SQLite file paths. */
export function findBrowserHistoryPaths(): Array<{ browser: string; path: string }> {
  const home = process.env['USERPROFILE'] ?? ''
  const candidates = [
    {
      browser: 'Chrome',
      path: join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'History'),
    },
    {
      browser: 'Edge',
      path: join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'History'),
    },
    {
      browser: 'Brave',
      path: join(
        home,
        'AppData',
        'Local',
        'BraveSoftware',
        'Brave-Browser',
        'User Data',
        'Default',
        'History',
      ),
    },
  ]
  return candidates.filter((c) => existsSync(c.path))
}

/** Read Chrome/Edge history from the locked SQLite file (copy first). */
export function readBrowserHistory(historyPath: string, limit = 10_000): BrowserHistoryRow[] {
  // Chrome locks the DB while running — copy to temp first
  const tmpPath = join(tmpdir(), `auralith-history-${randomUUID()}.db`)
  try {
    copyFileSync(historyPath, tmpPath)
    const db = new Database(tmpPath, { readonly: true })
    const rows = db
      .prepare(
        `
      SELECT u.url, u.title, u.last_visit_time, u.visit_count
      FROM urls u
      ORDER BY u.last_visit_time DESC
      LIMIT ?
    `,
      )
      .all(limit) as ChromeVisitRow[]
    db.close()
    return rows.map((r) => ({
      url: r.url,
      title: r.title ?? null,
      visitTime: chromeTimeToMs(r.last_visit_time),
      visitCount: r.visit_count,
    }))
  } finally {
    try {
      unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
  }
}

/** Import browser history URLs into the local DB (dedup by URL). */
export function importBrowserHistory(
  rows: BrowserHistoryRow[],
  sqlite: Database.Database,
): { imported: number; skipped: number } {
  let imported = 0
  let skipped = 0
  const now = Date.now()

  const stmt = sqlite.prepare(
    `INSERT OR IGNORE INTO browser_history_imports (id, url, title, visit_time, visit_count, imported_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )

  for (const row of rows) {
    if (!row.url.startsWith('http://') && !row.url.startsWith('https://')) {
      skipped++
      continue
    }
    try {
      stmt.run(randomUUID(), row.url, row.title, row.visitTime, row.visitCount, now)
      imported++
    } catch {
      skipped++
    }
  }

  return { imported, skipped }
}
