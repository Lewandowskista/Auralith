import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'crypto'

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
      return { ok: true, data, requestId, traceId }
    } catch (err) {
      const ms = Math.round(performance.now() - start)
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[IPC ${traceId}] ${op} → error (${ms}ms):`, err)
      return { ok: false, error: { message }, requestId, traceId }
    }
  })
}
