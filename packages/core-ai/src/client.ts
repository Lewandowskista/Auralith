import { z } from 'zod'

export type OllamaConfig = {
  baseUrl: string
  timeoutMs?: number
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type GenerateOpts = {
  model: string
  messages: ChatMessage[]
  format?: 'json'
  maxTokens?: number
  temperature?: number
  /** Ollama context window size — controls VRAM usage. Clamped by resolveModelConfig. */
  num_ctx?: number
  stream?: false
}

export type EmbedOpts = {
  model: string
  input: string | string[]
}

const TagsResponseSchema = z.object({
  models: z.array(z.object({ name: z.string() })),
})

export class OllamaClient {
  private baseUrl: string
  private timeoutMs: number

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.timeoutMs = config.timeoutMs ?? 30_000
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(4_000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<string[]> {
    const res = await this.fetchJson(`${this.baseUrl}/api/tags`)
    const parsed = TagsResponseSchema.safeParse(res)
    if (!parsed.success) return []
    return parsed.data.models.map((m) => m.name)
  }

  async generate(opts: GenerateOpts): Promise<string> {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages,
      stream: false,
      options: {
        num_predict: opts.maxTokens ?? 512,
        temperature: opts.temperature ?? 0,
        ...(opts.num_ctx !== undefined ? { num_ctx: opts.num_ctx } : {}),
      },
    }
    if (opts.format === 'json') body['format'] = 'json'

    const res = await this.fetchJson(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const content = (res as { message?: { content?: string } }).message?.content
    if (typeof content !== 'string') throw new Error('Unexpected Ollama response shape')
    return content
  }

  async *stream(opts: Omit<GenerateOpts, 'stream'>): AsyncGenerator<string> {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages,
      stream: true,
      options: {
        num_predict: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0.7,
        ...(opts.num_ctx !== undefined ? { num_ctx: opts.num_ctx } : {}),
      },
    }
    if (opts.format === 'json') body['format'] = 'json'

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (!res.ok || !res.body) throw new Error(`Ollama stream failed: ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          try {
            const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
            if (chunk.message?.content) yield chunk.message.content
            if (chunk.done) return
          } catch {
            console.warn('[ollama] skipped malformed stream line:', line.slice(0, 80))
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async embed(opts: EmbedOpts): Promise<number[][]> {
    const inputs = Array.isArray(opts.input) ? opts.input : [opts.input]
    const body = { model: opts.model, input: inputs }
    const res = await this.fetchJson(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const embeddings = (res as { embeddings?: number[][] }).embeddings
    if (!Array.isArray(embeddings)) throw new Error('Unexpected embed response shape')
    return embeddings
  }

  private async fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: init.signal ?? AbortSignal.timeout(this.timeoutMs),
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${url}`)
    return res.json()
  }
}
