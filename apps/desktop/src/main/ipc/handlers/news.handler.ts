import { BrowserWindow } from 'electron'
import { registerHandler } from '../router'
import type { DbBundle } from '@auralith/core-db'
import { createNewsRepo } from '@auralith/core-news'
import {
  NewsListTopicsParamsSchema,
  NewsCreateTopicParamsSchema,
  NewsDeleteTopicParamsSchema,
  NewsSetTopicAnalysisOptInParamsSchema,
  NewsListFeedsParamsSchema,
  NewsAddFeedParamsSchema,
  NewsRemoveFeedParamsSchema,
  NewsListClustersParamsSchema,
  NewsListItemsParamsSchema,
  NewsMarkReadParamsSchema,
  NewsSaveItemParamsSchema,
  NewsTriggerFetchParamsSchema,
  NewsSeedTopicsParamsSchema,
  NewsListTopicFeedsParamsSchema,
} from '@auralith/core-domain'
import type { OllamaClient, PromptCacheStore } from '@auralith/core-ai'
import { createPromptCache } from '@auralith/core-ai'
import { createPromptCacheRepo } from '@auralith/core-db'
import { runFullPipeline } from '@auralith/core-news'

type NewsDeps = {
  bundle: DbBundle
  ollamaClient?: OllamaClient
  classifierModel?: string
  summarizeModel?: string
  extractModel?: string
  promptCache?: PromptCacheStore
}

let _deps: NewsDeps | null = null

export function initNewsDeps(deps: Omit<NewsDeps, 'promptCache'> & { bundle: DbBundle }): void {
  const cacheRepo = createPromptCacheRepo(deps.bundle.db)
  _deps = {
    ...deps,
    promptCache: createPromptCache({
      get: (hash) => cacheRepo.get(hash),
      set: (row) => cacheRepo.set(row),
      evictExpired: () => cacheRepo.evictExpired(),
    }),
  }
}

function getDeps(): NewsDeps {
  if (!_deps) throw new Error('News deps not initialized')
  return _deps
}

export function registerNewsHandlers(): void {
  registerHandler('news.listTopics', async (params) => {
    NewsListTopicsParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    return { topics: repo.listTopics() }
  })

  registerHandler('news.createTopic', async (params) => {
    const { name, slug } = NewsCreateTopicParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    const topic = repo.createTopic(name, slug)
    return { topic }
  })

  registerHandler('news.deleteTopic', async (params) => {
    const { id } = NewsDeleteTopicParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    repo.deleteTopic(id)
    return { deleted: true }
  })

  registerHandler('news.setTopicAnalysisOptIn', async (params) => {
    const { topicId, optIn } = NewsSetTopicAnalysisOptInParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    repo.setTopicAnalysisOptIn(topicId, optIn)
    return { updated: true }
  })

  registerHandler('news.listFeeds', async (params) => {
    NewsListFeedsParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    return { feeds: repo.listFeeds() }
  })

  registerHandler('news.listTopicFeeds', async (params) => {
    NewsListTopicFeedsParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    return { links: repo.listTopicFeedLinks() }
  })

  registerHandler('news.addFeed', async (params) => {
    const { url, title, topicId } = NewsAddFeedParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    const feed = repo.addFeed(url, title)
    if (topicId) repo.linkFeedToTopic(topicId, feed.id)
    return { feed }
  })

  registerHandler('news.removeFeed', async (params) => {
    const { id } = NewsRemoveFeedParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    repo.removeFeed(id)
    return { removed: true }
  })

  registerHandler('news.listClusters', async (params) => {
    const opts = NewsListClustersParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    const clusterRows = repo.listClusters({
      ...(opts.topicId !== undefined ? { topicId: opts.topicId } : {}),
      limit: opts.limit,
      offset: opts.offset,
    })
    const clusterIds = clusterRows.map((c) => c.id)
    const itemCounts = repo.getClusterItemCounts(clusterIds)
    return {
      clusters: clusterRows.map((c) => ({
        id: c.id,
        topicId: c.topicId,
        summary: c.summary,
        createdAt: c.createdAt.getTime(),
        itemCount: itemCounts.get(c.id) ?? 0,
      })),
    }
  })

  registerHandler('news.listItems', async (params) => {
    const opts = NewsListItemsParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    const queryOpts: Parameters<typeof repo.listItems>[0] = {
      limit: opts.limit,
      offset: opts.offset,
    }
    if (opts.clusterId !== undefined) queryOpts.clusterId = opts.clusterId
    if (opts.feedId !== undefined) queryOpts.feedId = opts.feedId
    if (opts.unreadOnly) queryOpts.unreadOnly = true
    if (opts.savedOnly) queryOpts.savedOnly = true

    const items = repo.listItems(queryOpts)
    const total = repo.countItems({
      ...(opts.clusterId !== undefined ? { clusterId: opts.clusterId } : {}),
      ...(opts.feedId !== undefined ? { feedId: opts.feedId } : {}),
    })

    // Single query to fetch all feed titles for the result set
    const uniqueFeedIds = [...new Set(items.map((i) => i.feedId))]
    const feedTitleCache = repo.getFeedsByIds(uniqueFeedIds)

    return {
      items: items.map((i) => ({
        id: i.id,
        feedId: i.feedId,
        sourceName: feedTitleCache.get(i.feedId) ?? '',
        title: i.title,
        url: i.url,
        publishedAt: i.publishedAt?.getTime(),
        rawText: i.rawText ?? undefined,
        summary: i.summary ?? undefined,
        analysis: i.analysis ?? undefined,
        clusterId: i.clusterId ?? undefined,
        fetchedAt: i.fetchedAt.getTime(),
        readAt: i.readAt?.getTime(),
        saved: i.saved,
        imageUrl: i.imageUrl ?? undefined,
        videoUrl: i.videoUrl ?? undefined,
        mediaType: i.mediaType ?? undefined,
        author: i.author ?? undefined,
        categories: i.categories ? i.categories.split(',').filter(Boolean) : undefined,
        readingTimeMin: i.readingTimeMin ?? undefined,
        fullContent: i.fullContent ?? undefined,
        fullContentFetchedAt: i.fullContentFetchedAt?.getTime(),
      })),
      total,
    }
  })

  registerHandler('news.markRead', async (params) => {
    const { itemId } = NewsMarkReadParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    repo.markRead(itemId)
    return { updated: true }
  })

  registerHandler('news.saveItem', async (params) => {
    const { itemId, saved } = NewsSaveItemParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)
    repo.setSaved(itemId, saved)
    return { updated: true }
  })

  registerHandler('news.triggerFetch', async (params) => {
    NewsTriggerFetchParamsSchema.parse(params)
    const { bundle, ollamaClient, classifierModel, summarizeModel, extractModel, promptCache } =
      getDeps()
    const repo = createNewsRepo(bundle.db)
    // Run pipeline in background — broadcast completion when done
    void runFullPipeline({
      repo,
      ...(ollamaClient ? { ollamaClient } : {}),
      ...(classifierModel ? { classifierModel } : {}),
      ...(summarizeModel ? { summarizeModel } : {}),
      ...(extractModel ? { extractModel } : {}),
      ...(promptCache ? { promptCache } : {}),
    })
      .then(() => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed())
            win.webContents.send('news:fetch-complete', { clustersUpdated: true })
        }
      })
      .catch((err: unknown) => console.error('[news] pipeline error:', err))
    return { triggered: true }
  })

  registerHandler('news.seedTopics', async (params) => {
    const { topics } = NewsSeedTopicsParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createNewsRepo(bundle.db)

    // Curated RSS feeds per topic name (case-insensitive match)
    const TOPIC_FEEDS: Record<string, Array<{ url: string; title: string }>> = {
      technology: [
        { url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', title: 'Ars Technica' },
        { url: 'https://www.theverge.com/rss/index.xml', title: 'The Verge' },
      ],
      science: [
        { url: 'https://www.sciencedaily.com/rss/top/science.xml', title: 'Science Daily' },
        { url: 'https://feeds.newscientist.com/science-news', title: 'New Scientist' },
      ],
      business: [
        {
          url: 'https://feeds.bloomberg.com/businessweek/index.rss',
          title: 'Bloomberg Businessweek',
        },
        { url: 'https://www.ft.com/rss/home/uk', title: 'Financial Times' },
      ],
      'world news': [
        { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', title: 'BBC World News' },
        { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', title: 'NYT World' },
      ],
      health: [
        { url: 'https://feeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC', title: 'WebMD' },
        { url: 'https://www.medicalnewstoday.com/rss/all-news', title: 'Medical News Today' },
      ],
      'ai & machine learning': [
        { url: 'https://bair.berkeley.edu/blog/feed.xml', title: 'BAIR Blog' },
        { url: 'https://huggingface.co/blog/feed.xml', title: 'Hugging Face Blog' },
      ],
      design: [
        { url: 'https://feeds.feedburner.com/smashingmagazine', title: 'Smashing Magazine' },
        { url: 'https://alistapart.com/main/feed/', title: 'A List Apart' },
      ],
      finance: [
        { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', title: 'MarketWatch' },
        { url: 'https://www.investing.com/rss/news.rss', title: 'Investing.com' },
      ],
      culture: [
        { url: 'https://www.theguardian.com/culture/rss', title: 'The Guardian Culture' },
        { url: 'https://pitchfork.com/rss/news/', title: 'Pitchfork' },
      ],
      sports: [
        { url: 'https://www.espn.com/espn/rss/news', title: 'ESPN' },
        { url: 'https://feeds.bbci.co.uk/sport/rss.xml', title: 'BBC Sport' },
      ],
      cooking: [
        { url: 'https://www.seriouseats.com/feeds/all', title: 'Serious Eats' },
        { url: 'https://www.bonappetit.com/feed/rss', title: 'Bon Appétit' },
      ],
      'film & tv': [
        { url: 'https://variety.com/feed/', title: 'Variety' },
        { url: 'https://www.hollywoodreporter.com/feed/', title: 'Hollywood Reporter' },
      ],
      books: [
        { url: 'https://www.theguardian.com/books/rss', title: 'The Guardian Books' },
        { url: 'https://lithub.com/feed/', title: 'Literary Hub' },
      ],
      games: [
        { url: 'https://www.rockpapershotgun.com/feed', title: 'Rock Paper Shotgun' },
        { url: 'https://kotaku.com/rss', title: 'Kotaku' },
      ],
    }

    let seeded = 0
    for (const topicName of topics) {
      const key = topicName.toLowerCase()
      const slug = key.replace(/[^a-z0-9]+/g, '-')
      const topic = repo.createTopic(topicName, slug)
      const feeds = TOPIC_FEEDS[key] ?? []
      for (const { url, title } of feeds) {
        const feed = repo.addFeed(url, title)
        repo.linkFeedToTopic(topic.id, feed.id)
      }
      seeded++
    }
    return { seeded }
  })
}
