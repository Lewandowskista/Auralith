import type { AppContextProvider, AppContextRequest, AppContextProviderResult } from '../types'
import { formatToon } from '../../prompt-format'

// ── Types mirrored from core-news ─────────────────────────────────────────────

type NewsCluster = {
  id: string
  topicName: string
  label: string
  summary: string
  itemCount: number
  importance?: 'low' | 'medium' | 'high'
  latestAt?: number
}

type NewsTopic = {
  id: string
  name: string
  slug: string
  analysisOptIn?: boolean
}

type NewsArticle = {
  id: string
  title: string
  /** Feed/source display name */
  source: string
  publishedAt?: number | null
  summary?: string | null
  clusterId?: string | null
}

// ── Provider deps ─────────────────────────────────────────────────────────────

export type NewsContextDeps = {
  listTopics: () => Promise<NewsTopic[]>
  /** Returns recent clusters across all enabled topics, sorted by importance/recency */
  listClusters: (opts?: { limit?: number; topicId?: string }) => Promise<NewsCluster[]>
  /** Returns unread cluster count */
  getUnreadCount?: () => Promise<number>
  /** Returns individual article headlines for the top clusters — enables specific citations */
  listArticles?: (opts: { limit: number }) => Promise<NewsArticle[]>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STALE_AFTER_MS = 30 * 60 * 1000 // 30 minutes
const MAX_CLUSTERS = 6
const MAX_ARTICLES = 12

// ── Context quality filters ───────────────────────────────────────────────────

function isClusterValid(c: NewsCluster): boolean {
  return (
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    typeof c.label === 'string' &&
    c.label.length > 0 &&
    typeof c.summary === 'string' &&
    c.summary.length > 0 &&
    typeof c.importance === 'string' &&
    Array.isArray([]) // item_ids not stored on cluster type — itemCount serves as proxy
  )
}

function isArticleValid(a: NewsArticle): boolean {
  return (
    typeof a.id === 'string' &&
    a.id.length > 0 &&
    typeof a.title === 'string' &&
    a.title.trim().length > 3 &&
    typeof a.source === 'string' &&
    a.source.trim().length > 0 &&
    a.publishedAt !== null &&
    a.publishedAt !== undefined
  )
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function createNewsContextProvider(deps: NewsContextDeps): AppContextProvider {
  return {
    capability: 'news',

    canHandle(req: AppContextRequest): boolean {
      return req.requestedCapabilities.includes('news')
    },

    async getContext(req: AppContextRequest): Promise<AppContextProviderResult> {
      if (req.isCloudModel) {
        return {
          capability: 'news',
          promptText: '',
          charCount: 0,
          freshness: 'missing',
          warnings: ['News context excluded — cloud model restriction.'],
          source: 'core-news',
        }
      }

      const warnings: string[] = []
      let topics: NewsTopic[] = []
      let clusters: NewsCluster[] = []
      let unreadCount: number | undefined

      try {
        ;[topics, clusters] = await Promise.all([
          deps.listTopics(),
          deps.listClusters({ limit: MAX_CLUSTERS }),
        ])
        if (deps.getUnreadCount) {
          unreadCount = await deps.getUnreadCount()
        }
      } catch (err) {
        warnings.push(`News fetch failed: ${err instanceof Error ? err.message : 'error'}`)
      }

      if (clusters.length === 0) {
        return {
          capability: 'news',
          promptText: '',
          charCount: 0,
          freshness: 'missing',
          warnings: [
            ...warnings,
            'No news clusters available. News may not have been fetched yet.',
          ],
          suggestedRefreshAction: 'news.triggerFetch',
          source: 'core-news',
        }
      }

      // Determine freshness from the latest cluster timestamp
      const latestTs = clusters.map((c) => c.latestAt ?? 0).reduce((a, b) => Math.max(a, b), 0)
      const isStale = latestTs > 0 && Date.now() - latestTs > STALE_AFTER_MS
      if (isStale) warnings.push('News data may be stale (>30 min). Refresh recommended.')

      const topicNames = topics.map((t) => t.name).join(', ') || '(none configured)'

      // Fetch individual articles when available — enables specific title/source citations
      let articles: NewsArticle[] = []
      if (deps.listArticles) {
        try {
          articles = await deps.listArticles({ limit: MAX_ARTICLES })
        } catch {
          warnings.push('Article detail fetch failed — cluster-level context only.')
        }
      }

      // Filter to well-formed clusters and articles before building context
      const validClusters = clusters.filter(isClusterValid)
      const validArticles = articles.filter(isArticleValid)

      if (validClusters.length < clusters.length) {
        warnings.push(
          `${clusters.length - validClusters.length} cluster(s) filtered — missing required fields (headline/summary/importance).`,
        )
      }
      if (articles.length > 0 && validArticles.length < articles.length) {
        warnings.push(
          `${articles.length - validArticles.length} article(s) filtered — missing title, source, or timestamp.`,
        )
      }

      // TOON compact record table for clusters — saves tokens on small models
      const clusterRows = validClusters.map((c) => ({
        id: c.id,
        topic: c.topicName,
        label: c.label.slice(0, 50),
        items: String(c.itemCount),
        importance: c.importance ?? 'medium',
        summary: c.summary.slice(0, 100),
      }))

      const clusterTable = formatToon(
        clusterRows,
        ['id', 'topic', 'label', 'items', 'importance', 'summary'],
        'news_clusters',
      )

      // Article table — uses only validated articles; full title preserved (not truncated)
      // so the grounding validator can find exact title matches later.
      const articleTable =
        validArticles.length > 0
          ? formatToon(
              validArticles.map((a) => ({
                id: a.id,
                cluster: a.clusterId ?? '',
                source: a.source.slice(0, 30),
                published: a.publishedAt ? _relativeTime(a.publishedAt) : 'unknown',
                // Do NOT truncate title — grounding validator needs exact match
                title: a.title,
                summary: (a.summary ?? '').slice(0, 100),
              })),
              ['id', 'cluster', 'source', 'published', 'title', 'summary'],
              'news_items',
            )
          : ''

      const unreadLine = unreadCount !== undefined ? `unread_clusters: ${unreadCount}` : ''

      // Context contract instruction block — model must cite titles, not summarize vaguely
      const contractBlock =
        validArticles.length > 0
          ? 'INSTRUCTION: You MUST use the provided news_items titles. You are NOT allowed to summarize without citing at least one exact title from news_items.'
          : ''

      const promptText = [
        '### News',
        `source: core-news | freshness: ${isStale ? 'stale' : 'fresh'} | topics: ${topicNames}`,
        unreadLine,
        clusterTable,
        articleTable,
        contractBlock,
      ]
        .filter(Boolean)
        .join('\n')

      return {
        capability: 'news',
        promptText,
        charCount: promptText.length,
        freshness: isStale ? 'stale' : 'fresh',
        ...(latestTs ? { dataTimestamp: new Date(latestTs).toISOString() } : {}),
        warnings,
        ...(isStale ? { suggestedRefreshAction: 'news.triggerFetch' } : {}),
        source: 'core-news',
      }
    },
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _relativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return `${Math.round(diffH / 24)}d ago`
}
