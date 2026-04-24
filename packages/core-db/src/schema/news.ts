import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const newsFeeds = sqliteTable('news_feeds', {
  id: text('id').primaryKey(),
  url: text('url').notNull().unique(),
  title: text('title').notNull(),
  lang: text('lang').notNull().default('en'),
  region: text('region').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  fetchInterval: integer('fetch_interval').notNull().default(3600),
})

export const newsTopics = sqliteTable('news_topics', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  analysisOptIn: integer('analysis_opt_in', { mode: 'boolean' }).notNull().default(false),
})

export const newsTopicFeeds = sqliteTable('news_topic_feeds', {
  topicId: text('topic_id')
    .notNull()
    .references(() => newsTopics.id, { onDelete: 'cascade' }),
  feedId: text('feed_id')
    .notNull()
    .references(() => newsFeeds.id, { onDelete: 'cascade' }),
})

export const newsClusters = sqliteTable('news_clusters', {
  id: text('id').primaryKey(),
  topicId: text('topic_id')
    .notNull()
    .references(() => newsTopics.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const newsItems = sqliteTable('news_items', {
  id: text('id').primaryKey(),
  feedId: text('feed_id')
    .notNull()
    .references(() => newsFeeds.id, { onDelete: 'cascade' }),
  guid: text('guid').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  rawText: text('raw_text').notNull().default(''),
  summary: text('summary'),
  analysis: text('analysis'),
  clusterId: text('cluster_id').references(() => newsClusters.id, { onDelete: 'set null' }),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  saved: integer('saved', { mode: 'boolean' }).notNull().default(false),
  // M15: media and metadata fields
  imageUrl: text('image_url'),
  videoUrl: text('video_url'),
  mediaType: text('media_type'),
  author: text('author'),
  categories: text('categories'),
  readingTimeMin: integer('reading_time_min'),
})
