import { z } from 'zod'

const FeedSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  lang: z.string(),
  region: z.string(),
  enabled: z.boolean(),
  fetchInterval: z.number(),
})

const TopicSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  analysisOptIn: z.boolean(),
})

const ClusterSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  summary: z.string(),
  createdAt: z.number(),
  itemCount: z.number(),
})

const NewsItemSchema = z.object({
  id: z.string(),
  feedId: z.string(),
  sourceName: z.string().optional(),
  title: z.string(),
  url: z.string(),
  publishedAt: z.number().optional(),
  rawText: z.string().optional(),
  summary: z.string().optional(),
  analysis: z.string().optional(),
  clusterId: z.string().optional(),
  fetchedAt: z.number(),
  readAt: z.number().optional(),
  saved: z.boolean(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  mediaType: z.string().optional(),
  author: z.string().optional(),
  categories: z.array(z.string()).optional(),
  readingTimeMin: z.number().optional(),
  fullContent: z.string().optional(),
  fullContentFetchedAt: z.number().optional(),
})

export const NewsListTopicsParamsSchema = z.object({})
export const NewsListTopicsResultSchema = z.object({ topics: z.array(TopicSchema) })

export const NewsCreateTopicParamsSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
})
export const NewsCreateTopicResultSchema = z.object({ topic: TopicSchema })

export const NewsDeleteTopicParamsSchema = z.object({ id: z.string() })
export const NewsDeleteTopicResultSchema = z.object({ deleted: z.boolean() })

export const NewsSetTopicAnalysisOptInParamsSchema = z.object({
  topicId: z.string(),
  optIn: z.boolean(),
})
export const NewsSetTopicAnalysisOptInResultSchema = z.object({ updated: z.boolean() })

export const NewsListFeedsParamsSchema = z.object({})
export const NewsListFeedsResultSchema = z.object({ feeds: z.array(FeedSchema) })

export const NewsListTopicFeedsParamsSchema = z.object({})
export const NewsListTopicFeedsResultSchema = z.object({
  links: z.array(z.object({ topicId: z.string(), feedId: z.string() })),
})

export const NewsAddFeedParamsSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  topicId: z.string().optional(),
})
export const NewsAddFeedResultSchema = z.object({ feed: FeedSchema })

export const NewsRemoveFeedParamsSchema = z.object({ id: z.string() })
export const NewsRemoveFeedResultSchema = z.object({ removed: z.boolean() })

export const NewsListClustersParamsSchema = z.object({
  topicId: z.string().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().min(0).default(0),
})
export const NewsListClustersResultSchema = z.object({ clusters: z.array(ClusterSchema) })

export const NewsListItemsParamsSchema = z.object({
  clusterId: z.string().optional(),
  feedId: z.string().optional(),
  unreadOnly: z.boolean().default(false),
  savedOnly: z.boolean().default(false),
  limit: z.number().int().positive().default(30),
  offset: z.number().int().min(0).default(0),
})
export const NewsListItemsResultSchema = z.object({
  items: z.array(NewsItemSchema),
  total: z.number(),
})

export const NewsMarkReadParamsSchema = z.object({ itemId: z.string() })
export const NewsMarkReadResultSchema = z.object({ updated: z.boolean() })

export const NewsSaveItemParamsSchema = z.object({ itemId: z.string(), saved: z.boolean() })
export const NewsSaveItemResultSchema = z.object({ updated: z.boolean() })

export const NewsTriggerFetchParamsSchema = z.object({ feedId: z.string().optional() })
export const NewsTriggerFetchResultSchema = z.object({ triggered: z.boolean() })

export const NewsSeedTopicsParamsSchema = z.object({ topics: z.array(z.string().min(1)) })
export const NewsSeedTopicsResultSchema = z.object({ seeded: z.number() })
