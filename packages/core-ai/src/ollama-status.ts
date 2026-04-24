import type { OllamaClient } from './client'

export type OllamaStatus = 'online' | 'offline' | 'checking'

type Listener = (status: OllamaStatus) => void

export class OllamaStatusMonitor {
  private client: OllamaClient
  private status: OllamaStatus = 'checking'
  private listeners: Set<Listener> = new Set()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(client: OllamaClient) {
    this.client = client
  }

  getStatus(): OllamaStatus {
    return this.status
  }

  isOnline(): boolean {
    return this.status === 'online'
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  async check(): Promise<OllamaStatus> {
    const alive = await this.client.ping()
    const next: OllamaStatus = alive ? 'online' : 'offline'
    if (next !== this.status) {
      this.status = next
      this.listeners.forEach((fn) => fn(next))
    }
    return next
  }

  start(intervalMs = 30_000): void {
    void this.check()
    this.timer = setInterval(() => {
      void this.check()
    }, intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
