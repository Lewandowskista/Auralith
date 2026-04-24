import { XMLParser } from 'fast-xml-parser'

export type RssFeedItem = {
  guid: string
  url: string
  title: string
  publishedAt?: number
  rawText: string
  imageUrl?: string
  videoUrl?: string
  mediaType?: string
  author?: string
  categories?: string[]
  readingTimeMin?: number
}

export type RssFeedMeta = {
  title: string
  items: RssFeedItem[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (tagName) => ['item', 'entry', 'category', 'media:content'].includes(tagName),
})

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function toStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null && '#text' in v)
    return String((v as Record<string, unknown>)['#text'] ?? '')
  return ''
}

function parseDate(v: unknown): number | undefined {
  const s = toStr(v)
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d.getTime()
}

/** Estimate reading time from word count at 220 wpm */
function readingTimeMin(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(words / 220))
}

/** Extract first <img src> from HTML string */
function extractFirstImage(html: string): string | undefined {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m?.[1]
}

/** Extract image from media:content, media:thumbnail, or enclosure */
function extractMediaImage(item: Record<string, unknown>): {
  imageUrl?: string
  videoUrl?: string
  mediaType?: string
} {
  // media:content
  const mediaContent = item['media:content']
  if (mediaContent) {
    const entries: unknown[] = Array.isArray(mediaContent) ? mediaContent : [mediaContent]
    for (const e of entries) {
      if (typeof e !== 'object' || e === null) continue
      const obj = e as Record<string, unknown>
      const url = toStr(obj['@_url'])
      const type = toStr(obj['@_type'])
      const medium = toStr(obj['@_medium'])
      if (!url) continue
      if (type.startsWith('video') || medium === 'video')
        return { videoUrl: url, mediaType: type || 'video' }
      if (type.startsWith('image') || medium === 'image')
        return { imageUrl: url, mediaType: type || 'image/jpeg' }
      // Unknown medium — treat as image if extension matches
      if (/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url)) return { imageUrl: url }
    }
  }

  // media:thumbnail
  const thumb = item['media:thumbnail']
  if (thumb) {
    const t =
      typeof thumb === 'object' && thumb !== null ? (thumb as Record<string, unknown>) : null
    const url = t ? toStr(t['@_url']) : ''
    if (url) return { imageUrl: url }
  }

  // enclosure
  const enclosure = item['enclosure']
  if (enclosure) {
    const enc =
      typeof enclosure === 'object' && enclosure !== null
        ? (enclosure as Record<string, unknown>)
        : null
    if (enc) {
      const url = toStr(enc['@_url'])
      const type = toStr(enc['@_type'])
      if (url) {
        if (type.startsWith('video')) return { videoUrl: url, mediaType: type }
        if (type.startsWith('image')) return { imageUrl: url, mediaType: type }
      }
    }
  }

  return {}
}

function extractCategories(item: Record<string, unknown>): string[] {
  const cats: string[] = []
  const raw = item['category']
  if (!raw) return cats
  const entries = Array.isArray(raw) ? raw : [raw]
  for (const c of entries) {
    const s = toStr(c)
    if (s) cats.push(s)
  }
  return cats
}

function extractAuthor(item: Record<string, unknown>): string | undefined {
  const author = item['dc:creator'] ?? item['author']
  if (!author) return undefined
  return toStr(author) || undefined
}

export async function fetchFeed(url: string, timeoutMs = 10_000): Promise<RssFeedMeta> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'Auralith/1.0 RSS Reader' },
  })
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status} ${url}`)
  const xml = await res.text()
  return parseFeed(xml, url)
}

export function parseFeed(xml: string, sourceUrl = ''): RssFeedMeta {
  const doc = parser.parse(xml) as Record<string, unknown>

  // RSS 2.0
  const rss = doc['rss'] as Record<string, unknown> | undefined
  if (rss) {
    const channel = rss['channel'] as Record<string, unknown> | undefined
    if (channel) return parseRssChannel(channel)
  }

  // Atom
  const feed = doc['feed'] as Record<string, unknown> | undefined
  if (feed) return parseAtomFeed(feed)

  throw new Error(`Unrecognized feed format from ${sourceUrl}`)
}

function parseRssChannel(channel: Record<string, unknown>): RssFeedMeta {
  const feedTitle = toStr(channel['title']) || 'Untitled'
  const rawItems = channel['item']
  const rawList: unknown[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : []

  return {
    title: feedTitle,
    items: rawList.map((raw) => {
      const i = raw as Record<string, unknown>
      const guid = toStr(i['guid']) || toStr(i['link']) || String(Math.random())
      const url = toStr(i['link']) || guid
      const title = stripHtml(toStr(i['title'])) || '(no title)'
      const rawHtml = toStr(i['description']) || toStr(i['content:encoded']) || ''
      const rawText = stripHtml(rawHtml).slice(0, 4000)

      const media = extractMediaImage(i)
      // Fallback: first <img> in the HTML description if no media: fields
      if (!media.imageUrl && rawHtml) {
        const fallback = extractFirstImage(rawHtml)
        if (fallback) media.imageUrl = fallback
      }

      const item: RssFeedItem = {
        guid,
        url,
        title,
        rawText,
        readingTimeMin: readingTimeMin(rawText),
      }
      const pubAt = parseDate(i['pubDate'])
      if (pubAt !== undefined) item.publishedAt = pubAt
      if (media.imageUrl) item.imageUrl = media.imageUrl
      if (media.videoUrl) item.videoUrl = media.videoUrl
      if (media.mediaType) item.mediaType = media.mediaType
      const author = extractAuthor(i)
      if (author) item.author = author
      const categories = extractCategories(i)
      if (categories.length > 0) item.categories = categories
      return item
    }),
  }
}

function parseAtomFeed(feed: Record<string, unknown>): RssFeedMeta {
  const feedTitle =
    toStr((feed['title'] as Record<string, unknown>)?.['#text'] ?? feed['title']) || 'Untitled'
  const rawEntries = feed['entry']
  const entries: unknown[] = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : []

  return {
    title: feedTitle,
    items: entries.map((entry) => {
      const e = entry as Record<string, unknown>
      const guid = toStr(e['id']) || String(Math.random())
      const linkEl = e['link']
      const url =
        typeof linkEl === 'object' && linkEl !== null
          ? toStr((linkEl as Record<string, unknown>)['@_href'])
          : toStr(linkEl) || guid
      const title =
        stripHtml(toStr((e['title'] as Record<string, unknown>)?.['#text'] ?? e['title'])) ||
        '(no title)'
      const rawHtml =
        toStr((e['content'] as Record<string, unknown>)?.['#text'] ?? e['content']) ||
        toStr((e['summary'] as Record<string, unknown>)?.['#text'] ?? e['summary'])
      const rawText = stripHtml(rawHtml).slice(0, 4000)

      const media = extractMediaImage(e)
      if (!media.imageUrl && rawHtml) {
        const fallback = extractFirstImage(rawHtml)
        if (fallback) media.imageUrl = fallback
      }

      const item: RssFeedItem = {
        guid,
        url,
        title,
        rawText,
        readingTimeMin: readingTimeMin(rawText),
      }
      const pubAt = parseDate(e['updated'] ?? e['published'])
      if (pubAt !== undefined) item.publishedAt = pubAt
      if (media.imageUrl) item.imageUrl = media.imageUrl
      if (media.videoUrl) item.videoUrl = media.videoUrl
      if (media.mediaType) item.mediaType = media.mediaType
      const author = extractAuthor(e)
      if (author) item.author = author
      return item
    }),
  }
}
