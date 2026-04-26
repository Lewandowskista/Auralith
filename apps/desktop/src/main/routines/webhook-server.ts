import { createServer, type Server } from 'http'
import type { RoutineEngine } from '@auralith/core-routines'

const DEFAULT_PORT_RANGE_START = 47200
const DEFAULT_PORT_RANGE_END = 47299

export type WebhookServerOptions = {
  engine: RoutineEngine
  portRangeStart?: number
  portRangeEnd?: number
}

export class WebhookServer {
  private server: Server | null = null
  private port: number | null = null
  private engine: RoutineEngine

  constructor(private opts: WebhookServerOptions) {
    this.engine = opts.engine
  }

  async start(): Promise<number> {
    const start = this.opts.portRangeStart ?? DEFAULT_PORT_RANGE_START
    const end = this.opts.portRangeEnd ?? DEFAULT_PORT_RANGE_END

    for (let port = start; port <= end; port++) {
      try {
        await this.tryListen(port)
        this.port = port
        return port
      } catch {
        // try next port
      }
    }

    throw new Error(`No available port in range ${start}–${end}`)
  }

  getPort(): number | null {
    return this.port
  }

  /** Copyable URL shown to the user in Settings → Automations. */
  getWebhookBaseUrl(): string | null {
    if (!this.port) return null
    return `http://127.0.0.1:${this.port}`
  }

  stop(): void {
    this.server?.close()
    this.server = null
    this.port = null
  }

  private tryListen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const MAX_BODY = 1_000_000 // 1 MB
      const srv = createServer((req, res) => {
        let body = ''
        let tooLarge = false
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
          if (body.length > MAX_BODY) {
            tooLarge = true
            res.writeHead(413, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Payload too large' }))
            req.destroy()
          }
        })
        req.on('end', () => {
          if (tooLarge) return
          const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
          const path = url.pathname
          const secret = req.headers['x-auralith-secret'] as string | undefined

          let payload: Record<string, unknown> = {}
          try {
            payload = JSON.parse(body) as Record<string, unknown>
          } catch {
            /* ignore */
          }

          void this.engine.onWebhook({
            path,
            body: payload,
            ...(secret !== undefined ? { secret } : {}),
          })

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        })
      })

      srv.once('error', reject)
      srv.once('listening', () => {
        this.server = srv
        resolve()
      })
      srv.listen(port, '127.0.0.1')
    })
  }
}
