import { randomUUID } from 'crypto'
import type { DbClient } from '@auralith/core-db'
import {
  newsFeeds,
  newsTopics,
  newsTopicFeeds,
  newsItems,
  newsClusters,
  eq,
  and,
  desc,
  count,
  isNull,
  lt,
} from '@auralith/core-db'
import type { RssFeedItem } from './rss'

export type NewsRepo = ReturnType<typeof createNewsRepo>

export function createNewsRepo(db: DbClient) {
  // --- Feeds ---
  function listFeeds() {
    return db.select().from(newsFeeds).all()
  }

  function getFeedById(id: string) {
    return db.select().from(newsFeeds).where(eq(newsFeeds.id, id)).get()
  }

  function addFeed(url: string, title: string): typeof newsFeeds.$inferSelect {
    const existing = db.select().from(newsFeeds).where(eq(newsFeeds.url, url)).get()
    if (existing) return existing
    const id = randomUUID()
    db.insert(newsFeeds).values({ id, url, title }).run()
    const inserted = db.select().from(newsFeeds).where(eq(newsFeeds.id, id)).get()
    if (!inserted) throw new Error(`Feed ${id} not found after insert`)
    return inserted
  }

  function removeFeed(id: string): void {
    db.delete(newsFeeds).where(eq(newsFeeds.id, id)).run()
  }

  // --- Topics ---
  function listTopics() {
    return db.select().from(newsTopics).all()
  }

  function createTopic(name: string, slug: string): typeof newsTopics.$inferSelect {
    const existing = db.select().from(newsTopics).where(eq(newsTopics.slug, slug)).get()
    if (existing) return existing
    const id = randomUUID()
    db.insert(newsTopics).values({ id, name, slug, analysisOptIn: false }).run()
    const inserted = db.select().from(newsTopics).where(eq(newsTopics.id, id)).get()
    if (!inserted) throw new Error(`Topic ${id} not found after insert`)
    return inserted
  }

  function deleteTopic(id: string): void {
    db.delete(newsTopics).where(eq(newsTopics.id, id)).run()
  }

  function setTopicAnalysisOptIn(topicId: string, optIn: boolean): void {
    db.update(newsTopics).set({ analysisOptIn: optIn }).where(eq(newsTopics.id, topicId)).run()
  }

  function linkFeedToTopic(topicId: string, feedId: string): void {
    const existing = db
      .select()
      .from(newsTopicFeeds)
      .where(and(eq(newsTopicFeeds.topicId, topicId), eq(newsTopicFeeds.feedId, feedId)))
      .get()
    if (!existing) {
      db.insert(newsTopicFeeds).values({ topicId, feedId }).run()
    }
  }

  function getTopicForFeed(feedId: string): string | undefined {
    const row = db
      .select({ topicId: newsTopicFeeds.topicId })
      .from(newsTopicFeeds)
      .where(eq(newsTopicFeeds.feedId, feedId))
      .get()
    return row?.topicId
  }

  function listTopicFeedLinks(): Array<{ topicId: string; feedId: string }> {
    return db
      .select({ topicId: newsTopicFeeds.topicId, feedId: newsTopicFeeds.feedId })
      .from(newsTopicFeeds)
      .all()
  }

  // --- Items ---
  function upsertItems(feedId: string, items: RssFeedItem[]): number {
    let inserted = 0
    const now = new Date()
    for (const item of items) {
      const existing = db
        .select({ id: newsItems.id })
        .from(newsItems)
        .where(and(eq(newsItems.feedId, feedId), eq(newsItems.guid, item.guid)))
        .get()
      if (existing) continue
      const values: Parameters<typeof db.insert>[0] extends unknown
        ? Record<string, unknown>
        : never = {
        id: randomUUID(),
        feedId,
        guid: item.guid,
        url: item.url,
        title: item.title,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        rawText: item.rawText,
        fetchedAt: now,
        saved: false,
      }
      if (item.imageUrl) values['imageUrl'] = item.imageUrl
      if (item.videoUrl) values['videoUrl'] = item.videoUrl
      if (item.mediaType) values['mediaType'] = item.mediaType
      if (item.author) values['author'] = item.author
      if (item.categories?.length) values['categories'] = item.categories.join(',')
      if (item.readingTimeMin) values['readingTimeMin'] = item.readingTimeMin
      db.insert(newsItems)
        .values(values as typeof newsItems.$inferInsert)
        .run()
      inserted++
    }
    return inserted
  }

  function listItems(
    opts: {
      clusterId?: string
      feedId?: string
      unreadOnly?: boolean
      savedOnly?: boolean
      limit?: number
      offset?: number
    } = {},
  ) {
    const conditions = []
    if (opts.clusterId) conditions.push(eq(newsItems.clusterId, opts.clusterId))
    if (opts.feedId) conditions.push(eq(newsItems.feedId, opts.feedId))
    if (opts.unreadOnly) conditions.push(isNull(newsItems.readAt))
    if (opts.savedOnly) conditions.push(eq(newsItems.saved, true))

    return db
      .select()
      .from(newsItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(newsItems.fetchedAt))
      .limit(opts.limit ?? 30)
      .offset(opts.offset ?? 0)
      .all()
  }

  function countItems(opts: { clusterId?: string; feedId?: string; unreadOnly?: boolean } = {}) {
    const conditions = []
    if (opts.clusterId) conditions.push(eq(newsItems.clusterId, opts.clusterId))
    if (opts.feedId) conditions.push(eq(newsItems.feedId, opts.feedId))
    if (opts.unreadOnly) conditions.push(isNull(newsItems.readAt))
    const [row] = db
      .select({ n: count() })
      .from(newsItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .all()
    return row?.n ?? 0
  }

  function markRead(itemId: string): void {
    db.update(newsItems).set({ readAt: new Date() }).where(eq(newsItems.id, itemId)).run()
  }

  function setSaved(itemId: string, saved: boolean): void {
    db.update(newsItems).set({ saved }).where(eq(newsItems.id, itemId)).run()
  }

  function setSummary(itemId: string, summary: string): void {
    db.update(newsItems).set({ summary }).where(eq(newsItems.id, itemId)).run()
  }

  function setAnalysis(itemId: string, analysis: string): void {
    db.update(newsItems).set({ analysis }).where(eq(newsItems.id, itemId)).run()
  }

  function getItemsNeedingSummary(feedId: string, limit = 20) {
    return db
      .select()
      .from(newsItems)
      .where(and(eq(newsItems.feedId, feedId), isNull(newsItems.summary)))
      .orderBy(desc(newsItems.fetchedAt))
      .limit(limit)
      .all()
  }

  // --- Clusters ---
  function listClusters(opts: { topicId?: string; limit?: number; offset?: number } = {}) {
    const conditions = opts.topicId ? [eq(newsClusters.topicId, opts.topicId)] : []
    return db
      .select()
      .from(newsClusters)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(newsClusters.createdAt))
      .limit(opts.limit ?? 20)
      .offset(opts.offset ?? 0)
      .all()
  }

  function createCluster(topicId: string, summary: string): typeof newsClusters.$inferSelect {
    const id = randomUUID()
    const now = new Date()
    db.insert(newsClusters).values({ id, topicId, summary, createdAt: now }).run()
    const inserted = db.select().from(newsClusters).where(eq(newsClusters.id, id)).get()
    if (!inserted) throw new Error(`Cluster ${id} not found after insert`)
    return inserted
  }

  function assignCluster(itemId: string, clusterId: string): void {
    db.update(newsItems).set({ clusterId }).where(eq(newsItems.id, itemId)).run()
  }

  function getClusterItemCount(clusterId: string): number {
    const [row] = db
      .select({ n: count() })
      .from(newsItems)
      .where(eq(newsItems.clusterId, clusterId))
      .all()
    return row?.n ?? 0
  }

  function countSavedOlderThan(ms: number): number {
    const cutoff = new Date(Date.now() - ms)
    const [row] = db
      .select({ n: count() })
      .from(newsItems)
      .where(and(eq(newsItems.saved, true), lt(newsItems.fetchedAt, cutoff)))
      .all()
    return row?.n ?? 0
  }

  function getRecentUnclusteredItems(topicId: string, limit = 50) {
    // Items from feeds linked to this topic that have no cluster assigned
    const feedIds = db
      .select({ feedId: newsTopicFeeds.feedId })
      .from(newsTopicFeeds)
      .where(eq(newsTopicFeeds.topicId, topicId))
      .all()
      .map((r) => r.feedId)

    if (feedIds.length === 0) return []

    return db
      .select()
      .from(newsItems)
      .where(
        and(
          isNull(newsItems.clusterId),
          // drizzle inArray not re-exported — use manual filter post-query
        ),
      )
      .orderBy(desc(newsItems.fetchedAt))
      .limit(limit * 3)
      .all()
      .filter((i) => feedIds.includes(i.feedId))
      .slice(0, limit)
  }

  return {
    listFeeds,
    getFeedById,
    addFeed,
    removeFeed,
    listTopics,
    createTopic,
    deleteTopic,
    setTopicAnalysisOptIn,
    linkFeedToTopic,
    getTopicForFeed,
    listTopicFeedLinks,
    upsertItems,
    listItems,
    countItems,
    countSavedOlderThan,
    markRead,
    setSaved,
    setSummary,
    setAnalysis,
    getItemsNeedingSummary,
    getRecentUnclusteredItems,
    listClusters,
    createCluster,
    assignCluster,
    getClusterItemCount,
  }
}
