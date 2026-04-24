import { contextBridge, ipcRenderer } from 'electron'

export type IpcRequest = {
  op: string
  params: unknown
  requestId: string
}

export type IpcResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { message: string; code?: string } }

let requestCounter = 0

function invoke(op: string, params: unknown = {}): Promise<IpcResponse> {
  const requestId = `req_${++requestCounter}_${Date.now()}`
  const request: IpcRequest = { op, params, requestId }
  return ipcRenderer.invoke('auralith:invoke', request) as Promise<IpcResponse>
}

function on(channel: string, callback: (data: unknown) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  invoke,
  on,
  platform: process.platform,
  version: process.env['npm_package_version'] ?? '0.0.1',
} as const

contextBridge.exposeInMainWorld('auralith', api)

export type AuralithAPI = typeof api
