import { fetchFeed } from './rss'
import type { NewsRepo } from './repo'
import { clusterItems } from './cluster'
import type { OllamaClient, PromptCacheStore } from '@auralith/core-ai'
import { runPrompt } from '@auralith/core-ai'
import {
  SUMMARIZE_ITEM_PROMPT,
  ANALYZE_ITEM_PROMPT,
  CLUSTER_LABEL_PROMPT,
  buildSingleArticleContext,
} from './prompts'
import { fetchArticleContent } from './article-fetcher'

export type PipelineOpts = {
  repo: NewsRepo
  ollamaClient?: OllamaClient
  /** Model for classifier/label tasks (fast model — phi4-mini:3.8b on balanced preset) */
  classifierModel?: string
  /** Model for summarization tasks. Falls back to classifierModel when not set. */
  summarizeModel?: string
  /** Model for analysis/extraction tasks. Falls back to classifierModel when not set. */
  extractModel?: string
  /** @deprecated kept for back-compat with older callers */
  embedModel?: string
  /** Optional cache store for deterministic prompts (summaries, cluster labels). */
  promptCache?: PromptCacheStore
}

export async function fetchAndIngest(
  feedId: string,
  feedUrl: string,
  opts: PipelineOpts,
): Promise<number> {
  const { repo } = opts
  let items
  try {
    const feed = await fetchFeed(feedUrl)
    items = feed.items
  } catch (err) {
    console.error(`[news] fetch failed for ${feedUrl}:`, err)
    return 0
  }
  const inserted = repo.upsertItems(feedId, items)
  return inserted
}

export async function summarizePending(feedId: string, opts: PipelineOpts): Promise<void> {
  const { repo, ollamaClient, classifierModel, summarizeModel, extractModel, promptCache } = opts
  if (!ollamaClient || !classifierModel) return

  // Route each prompt to the most appropriate model role.
  const modelForSummarize = summarizeModel ?? classifierModel
  const modelForExtract = extractModel ?? classifierModel

  const pending = repo.getItemsNeedingSummary(feedId, 10)
  for (const item of pending) {
    if (!item.rawText) continue
    // Wrap article in an XML-style block to clearly delimit untrusted external
    // content from prompt instructions, reducing prompt injection risk.
    const articleBlock = buildSingleArticleContext({ title: item.title, text: item.rawText })
    const result = await runPrompt(
      SUMMARIZE_ITEM_PROMPT,
      { articleBlock },
      ollamaClient,
      modelForSummarize,
      promptCache,
    )
    if (result.ok) {
      repo.setSummary(item.id, result.data.summary)

      // Only run analysis when the topic has opted in
      const topicId = repo.getTopicForFeed(feedId)
      if (topicId) {
        const topics = repo.listTopics()
        const topic = topics.find((t) => t.id === topicId)
        if (topic?.analysisOptIn) {
          const aResult = await runPrompt(
            ANALYZE_ITEM_PROMPT,
            { title: item.title, summary: result.data.summary },
            ollamaClient,
            modelForExtract,
          )
          if (aResult.ok) {
            repo.setAnalysis(item.id, aResult.data.analysis)
          }
        }
      }
    }
  }
}

export async function clusterTopic(topicId: string, opts: PipelineOpts): Promise<void> {
  const { repo, ollamaClient, classifierModel, promptCache } = opts
  const unclustered = repo.getRecentUnclusteredItems(topicId, 50)
  if (unclustered.length < 2) return

  const groups = clusterItems(unclustered.map((i) => ({ id: i.id, title: i.title })))

  for (const group of groups) {
    const groupItems = group.indices.flatMap((idx) => {
      const it = unclustered[idx]
      return it ? [it] : []
    })
    const headlines = groupItems.map((i) => `- ${i.title}`).join('\n')

    let label = `${groupItems.length} related stories`
    if (ollamaClient && classifierModel) {
      const result = await runPrompt(
        CLUSTER_LABEL_PROMPT,
        { headlines },
        ollamaClient,
        classifierModel,
        promptCache,
      )
      if (result.ok) label = result.data.label
    }

    const cluster = repo.createCluster(topicId, label)
    for (const item of groupItems) {
      repo.assignCluster(item.id, cluster.id)
    }
  }
}

export async function fetchFullContent(opts: PipelineOpts): Promise<void> {
  const { repo } = opts
  const pending = repo.getItemsNeedingFullContent(10)
  for (const item of pending) {
    if (!item.url) {
      repo.setFullContent(item.id, null)
      continue
    }
    const result = await fetchArticleContent(item.url, { timeoutMs: 5000 })
    repo.setFullContent(item.id, result?.fullContent ?? null)
    // Small delay between external fetches to avoid hammering servers
    await new Promise((r) => setTimeout(r, 200))
  }
}

export async function runFullPipeline(opts: PipelineOpts): Promise<void> {
  const { repo } = opts
  const feeds = repo.listFeeds().filter((f) => f.enabled)

  if (feeds.length === 0) {
    console.warn('[news] pipeline: no enabled feeds — add topics/feeds first')
    return
  }

  // Stage 1: fetch all feeds in parallel (network I/O bound, no Ollama contention)
  await Promise.all(feeds.map((feed) => fetchAndIngest(feed.id, feed.url, opts)))

  // Stage 2: summarize each feed sequentially (Ollama is the bottleneck)
  for (const feed of feeds) {
    await summarizePending(feed.id, opts)
  }

  // Stage 3: cluster all topics in parallel (CPU-only grouping; model labels are fast classifiers)
  const topics = repo.listTopics()
  await Promise.all(topics.map((topic) => clusterTopic(topic.id, opts)))

  // Stage 4: fetch full article content for items not yet attempted
  await fetchFullContent(opts)
}
