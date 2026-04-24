/// <reference types="vite/client" />

// window.auralith — bridged from preload/index.ts via contextBridge
interface Window {
  auralith: {
    invoke: (
      op: string,
      params?: unknown,
    ) => Promise<
      { ok: true; data: unknown } | { ok: false; error: { message: string; code?: string } }
    >
    on: (channel: string, callback: (data: unknown) => void) => () => void
    platform: string
    version: string
  }
}
