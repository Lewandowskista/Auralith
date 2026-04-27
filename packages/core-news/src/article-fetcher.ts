import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'

export type ArticleFetchResult = {
  fullContent: string
  byline?: string
  siteName?: string
}

export type ArticleFetchOpts = {
  timeoutMs?: number
  maxBodyBytes?: number
}

/**
 * Fetch the full article HTML from a URL, extract readable content via
 * Mozilla Readability, sanitize it, and return the result.
 * Returns null on any error (timeout, HTTP failure, bot block, parse error).
 */
const DEFAULT_MAX_BODY_BYTES = 500 * 1024 // 500 KB

export async function fetchArticleContent(
  url: string,
  opts: ArticleFetchOpts = {},
): Promise<ArticleFetchResult | null> {
  const { timeoutMs = 8000, maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = opts

  let html: string
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en',
      },
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null

    // Guard against very large responses (malicious or CDN error pages)
    const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10)
    if (contentLength > maxBodyBytes) return null

    // Stream body with a rolling byte cap so Content-Length absence doesn't bypass guard
    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        if (totalBytes > maxBodyBytes) {
          reader.cancel().catch(() => undefined)
          return null
        }
        chunks.push(value)
      }
    }
    html = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length)
        merged.set(acc)
        merged.set(c, acc.length)
        return merged
      }, new Uint8Array(0)),
    )
  } catch {
    return null
  }

  try {
    const { document } = parseHTML(html)
    const reader = new Readability(document as unknown as Document, {
      charThreshold: 150,
    })
    const article = reader.parse()
    if (!article?.content) return null

    const sanitized = sanitizeArticleHtml(article.content)
    if (!sanitized.trim()) return null

    return {
      fullContent: sanitized,
      byline: article.byline ?? undefined,
      siteName: article.siteName ?? undefined,
    }
  } catch {
    return null
  }
}

/**
 * Strip dangerous elements and attributes from Readability-extracted HTML.
 * Readability already removes most nav/ad content; this is the final safety pass.
 */
function sanitizeArticleHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/href="javascript:[^"]*"/gi, 'href="#"')
    .replace(/src="javascript:[^"]*"/gi, '')
    .replace(/<(input|button|select|textarea|object|embed|applet)[^>]*\/?>/gi, '')
    .replace(/<\/(input|button|select|textarea|object|embed|applet)>/gi, '')
    .trim()
}
