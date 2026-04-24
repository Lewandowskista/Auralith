import { z } from 'zod'
import { shell } from 'electron'
import { registerTool } from '@auralith/core-tools'

const ALLOWED_SCHEMES = ['https:', 'http:']
const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_FETCH_BYTES = 100_000
const FETCH_TIMEOUT_MS = 10_000
const fetchCache = new Map<string, { expiresAt: number; result: FetchResult }>()

type FetchResult = {
  ok: boolean
  status: number
  url: string
  finalUrl: string
  title?: string
  text: string
  fromCache: boolean
  truncated: boolean
}

function isUrlSafe(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_SCHEMES.includes(parsed.protocol)
  } catch {
    return false
  }
}

export function registerWebTools(): void {
  registerTool({
    id: 'web.openUrl',
    tier: 'safe',
    paramsSchema: z.object({ url: z.string().url() }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    describeForModel: "Open a URL in the user's default browser. Only http/https URLs allowed.",
    execute: async (params) => {
      if (!isUrlSafe(params.url)) {
        return { ok: false, error: 'Only http:// and https:// URLs are allowed' }
      }
      await shell.openExternal(params.url)
      return { ok: true }
    },
  })

  registerTool({
    id: 'web.search',
    tier: 'safe',
    paramsSchema: z.object({ query: z.string().min(1) }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel:
      'Open a web search for the given query in the default browser using DuckDuckGo.',
    execute: async (params) => {
      const url = `https://duckduckgo.com/?q=${encodeURIComponent(params.query)}`
      await shell.openExternal(url)
      return { ok: true }
    },
  })

  registerTool({
    id: 'web.fetch',
    tier: 'safe',
    paramsSchema: z.object({
      url: z.string().url(),
      maxBytes: z.number().int().min(1_000).max(MAX_FETCH_BYTES).default(MAX_FETCH_BYTES),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      status: z.number(),
      url: z.string(),
      finalUrl: z.string(),
      title: z.string().optional(),
      text: z.string(),
      fromCache: z.boolean(),
      truncated: z.boolean(),
    }),
    describeForModel:
      'Fetch a web page and return readable text content for the assistant. Only http/https URLs are allowed. Response text is size-capped and cached briefly.',
    execute: async (params) => {
      if (!isUrlSafe(params.url)) {
        return {
          ok: false,
          status: 0,
          url: params.url,
          finalUrl: params.url,
          text: 'Only http:// and https:// URLs are allowed',
          fromCache: false,
          truncated: false,
        }
      }

      const cached = fetchCache.get(params.url)
      if (cached && cached.expiresAt > Date.now()) {
        return { ...cached.result, fromCache: true }
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      try {
        const response = await fetch(params.url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Auralith/0.0.1',
            Accept: 'text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8, */*;q=0.1',
          },
        })

        const rawText = await readResponseText(response, params.maxBytes ?? MAX_FETCH_BYTES)
        const contentType = response.headers.get('content-type') ?? ''
        const normalized = contentType.includes('html')
          ? htmlToReadableText(rawText.text)
          : normalizeWhitespace(rawText.text)

        const title = contentType.includes('html') ? extractTitle(rawText.text) : undefined
        const result: FetchResult = {
          ok: response.ok,
          status: response.status,
          url: params.url,
          finalUrl: response.url,
          ...(title ? { title } : {}),
          text: normalized,
          fromCache: false,
          truncated: rawText.truncated,
        }

        fetchCache.set(params.url, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          result,
        })

        return result
      } finally {
        clearTimeout(timeout)
      }
    },
  })
}

async function readResponseText(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text()
    return {
      text: text.slice(0, maxBytes),
      truncated: text.length > maxBytes,
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    bytesRead += value.byteLength
    if (bytesRead > maxBytes) {
      const overflow = bytesRead - maxBytes
      const keepBytes = value.byteLength - overflow
      if (keepBytes > 0) {
        text += decoder.decode(value.subarray(0, keepBytes), { stream: true })
      }
      truncated = true
      await reader.cancel()
      break
    }

    text += decoder.decode(value, { stream: true })
  }

  text += decoder.decode()
  return { text, truncated }
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1] ? normalizeWhitespace(decodeHtmlEntities(match[1])) : undefined
}

function htmlToReadableText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6|li|tr|blockquote)>/gi, '$&\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  return normalizeWhitespace(decodeHtmlEntities(withoutNoise))
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}
