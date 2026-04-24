import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { AuditRepo } from '@auralith/core-db'
import type { ExecutorDeps } from '@auralith/core-tools'

type ConfirmationResolver = (confirmed: boolean) => void
const pendingConfirmations = new Map<string, ConfirmationResolver>()

export function setupConfirmationChannel(): void {
  ipcMain.handle(
    '__internal.confirmationResolved',
    (_event, payload: { invocationId: string; confirmed: boolean }) => {
      const resolver = pendingConfirmations.get(payload.invocationId)
      if (resolver) {
        pendingConfirmations.delete(payload.invocationId)
        resolver(payload.confirmed)
      }
      return { ok: true }
    },
  )
}

type ConfirmRequest = {
  invocationId: string
  toolId: string
  params: unknown
  tier: 'confirm' | 'restricted'
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
    // Timeout after 5 minutes — user can always re-invoke
    setTimeout(
      () => {
        if (pendingConfirmations.has(req.invocationId)) {
          pendingConfirmations.delete(req.invocationId)
          resolve(false)
        }
      },
      5 * 60 * 1000,
    )
  })
}

export function makeExecutorDeps(auditRepo: AuditRepo): ExecutorDeps {
  return {
    auditRepo,
    requestConfirmation: (invocationId, toolId, params, reversible) =>
      requestConfirmationFromRenderer({
        invocationId,
        toolId,
        params,
        tier: 'confirm',
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
