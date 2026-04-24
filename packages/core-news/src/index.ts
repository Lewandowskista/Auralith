export { fetchFeed, parseFeed, type RssFeedItem, type RssFeedMeta } from './rss'
export { createNewsRepo, type NewsRepo } from './repo'
export { clusterItems, type ClusterGroup } from './cluster'
export {
  runFullPipeline,
  fetchAndIngest,
  summarizePending,
  clusterTopic,
  type PipelineOpts,
} from './pipeline'
export { SUMMARIZE_ITEM_PROMPT, ANALYZE_ITEM_PROMPT, CLUSTER_LABEL_PROMPT } from './prompts'
