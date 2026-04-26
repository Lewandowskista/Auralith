export { fetchFeed, parseFeed, type RssFeedItem, type RssFeedMeta } from './rss'
export { createNewsRepo, type NewsRepo } from './repo'
export { clusterItems, type ClusterGroup } from './cluster'
export {
  runFullPipeline,
  fetchAndIngest,
  summarizePending,
  clusterTopic,
  fetchFullContent,
  type PipelineOpts,
} from './pipeline'
export { fetchArticleContent, type ArticleFetchResult, type ArticleFetchOpts } from './article-fetcher'
export {
  SUMMARIZE_ITEM_PROMPT,
  ANALYZE_ITEM_PROMPT,
  CLUSTER_LABEL_PROMPT,
  DIGEST_PROMPT,
  DigestOutputSchema,
  buildSingleArticleContext,
  buildDigestContext,
  type DigestOutput,
  type DigestArticle,
} from './prompts'
