import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import type { AuditRepo } from '@auralith/core-db'
import type { ExecutorDeps } from '@auralith/core-tools'
import type { Database } from 'better-sqlite3'
import { registerHandler } from '../ipc/router'

type ConfirmationResolver = (confirmed: boolean) => void
const pendingConfirmations = new Map<string, ConfirmationResolver>()

// In-memory mirror of pccontrol_allowlist for synchronous lookups
const allowListCache = new Set<string>()

export function loadAllowListCache(sqlite: Database): void {
  const rows = sqlite.prepare('SELECT tool_id FROM pccontrol_allowlist').all() as Array<{
    tool_id: string
  }>
  for (const row of rows) allowListCache.add(row.tool_id)
}

export function addToAllowList(sqlite: Database, toolId: string): void {
  sqlite
    .prepare('INSERT OR REPLACE INTO pccontrol_allowlist (tool_id, added_at) VALUES (?, ?)')
    .run(toolId, Date.now())
  allowListCache.add(toolId)
}

export function removeFromAllowList(sqlite: Database, toolId: string): void {
  sqlite.prepare('DELETE FROM pccontrol_allowlist WHERE tool_id = ?').run(toolId)
  allowListCache.delete(toolId)
}

export function getAllowList(sqlite: Database): Array<{ toolId: string; addedAt: number }> {
  const rows = sqlite
    .prepare('SELECT tool_id, added_at FROM pccontrol_allowlist ORDER BY added_at DESC')
    .all() as Array<{ tool_id: string; added_at: number }>
  return rows.map((r) => ({ toolId: r.tool_id, addedAt: r.added_at }))
}

export function setupConfirmationChannel(): void {
  registerHandler('__internal.confirmationResolved', async (params) => {
    const { invocationId, confirmed } = params as { invocationId: string; confirmed: boolean }
    const resolver = pendingConfirmations.get(invocationId)
    if (resolver) {
      pendingConfirmations.delete(invocationId)
      resolver(confirmed)
    }
    return { ok: true }
  })
}

type ConfirmRequest = {
  invocationId: string
  toolId: string
  params: unknown
  tier: 'confirm' | 'confirm-transient' | 'restricted'
  reversible: boolean
  rationale?: string
  source?: 'user' | 'suggestion' | 'scheduler'
}

export function requestConfirmationFromRenderer(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    pendingConfirmations.set(req.invocationId, resolve)
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) {
      pendingConfirmations.delete(req.invocationId)
      resolve(false)
      return
    }
    win.webContents.send('tool.confirmRequest', req)
    // 5-min timeout for modal confirmations; 6 s for transient (auto-confirm fires at 3 s client-side)
    const timeoutMs = req.tier === 'confirm-transient' ? 6_000 : 5 * 60 * 1000
    setTimeout(() => {
      if (pendingConfirmations.has(req.invocationId)) {
        pendingConfirmations.delete(req.invocationId)
        // Transient: auto-confirm on timeout (the toast already fired the confirm after 3 s)
        resolve(req.tier === 'confirm-transient')
      }
    }, timeoutMs)
  })
}

export function makeExecutorDeps(auditRepo: AuditRepo, _sqlite?: Database): ExecutorDeps {
  return {
    auditRepo,
    isAllowListed: (toolId: string) => allowListCache.has(toolId),
    requestConfirmation: (invocationId, toolId, params, reversible) =>
      requestConfirmationFromRenderer({
        invocationId,
        toolId,
        params,
        tier: 'confirm',
        reversible,
      }),
    requestTransientConfirmation: (invocationId, toolId, params, reversible) =>
      requestConfirmationFromRenderer({
        invocationId,
        toolId,
        params,
        tier: 'confirm-transient',
        reversible,
      }),
    requestRestrictedConfirmation: (invocationId, toolId, params) =>
      requestConfirmationFromRenderer({
        invocationId: invocationId ?? randomUUID(),
        toolId,
        params,
        tier: 'restricted',
        reversible: false,
      }),
  }
}
