import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'crypto'
import type { ObservabilityRepo } from '@auralith/core-db'

export type IpcRequest = {
  op: string
  params: unknown
  requestId: string
}

export type IpcResponse =
  | { ok: true; data: unknown; requestId: string; traceId: string }
  | { ok: false; error: { message: string; code?: string }; requestId: string; traceId: string }

type Handler = (params: unknown, ctx: HandlerContext) => Promise<unknown>

export type HandlerContext = {
  event: IpcMainInvokeEvent
  requestId: string
  traceId: string
  op: string
}

const handlers = new Map<string, Handler>()

// Injected after DB init — optional so router works before DB is ready
let _obsRepo: ObservabilityRepo | null = null

export function setObservabilityRepo(repo: ObservabilityRepo): void {
  _obsRepo = repo
}

export function registerHandler(op: string, handler: Handler): void {
  handlers.set(op, handler)
}

export function setupIpcRouter(): void {
  ipcMain.handle('auralith:invoke', async (event, request: IpcRequest): Promise<IpcResponse> => {
    const { op, params, requestId } = request
    const traceId = randomUUID()

    const handler = handlers.get(op)

    if (!handler) {
      console.warn(`[IPC ${traceId}] Unknown op: ${op}`)
      return {
        ok: false,
        error: { message: `Unknown op: ${op}`, code: 'UNKNOWN_OP' },
        requestId,
        traceId,
      }
    }

    const start = performance.now()
    try {
      const data = await handler(params, { event, requestId, traceId, op })
      const ms = Math.round(performance.now() - start)
      // Debounced batch-insert — skip very cheap ops to keep volume down
      if (ms >= 5) {
        _obsRepo?.queueTrace({
          op,
          durationMs: ms,
          status: 'ok',
          errCode: null,
          ts: Date.now(),
          paramsBytes: JSON.stringify(params).length,
          resultBytes: JSON.stringify(data).length,
        })
      }
      return { ok: true, data, requestId, traceId }
    } catch (err) {
      const ms = Math.round(performance.now() - start)
      const message = err instanceof Error ? err.message : 'Unknown error'
      const code =
        err instanceof Error && 'code' in err
          ? String((err as NodeJS.ErrnoException).code)
          : undefined
      console.error(`[IPC ${traceId}] ${op} → error (${ms}ms):`, err)
      _obsRepo?.queueTrace({
        op,
        durationMs: ms,
        status: 'error',
        errCode: code ?? null,
        ts: Date.now(),
        paramsBytes: JSON.stringify(params).length,
        resultBytes: 0,
      })
      return { ok: false, error: { message, ...(code ? { code } : {}) }, requestId, traceId }
    }
  })
}
