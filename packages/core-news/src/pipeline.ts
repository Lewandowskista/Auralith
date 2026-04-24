import { fetchFeed } from './rss'
import type { NewsRepo } from './repo'
import { clusterItems } from './cluster'
import type { OllamaClient } from '@auralith/core-ai'
import { runPrompt } from '@auralith/core-ai'
import { SUMMARIZE_ITEM_PROMPT, ANALYZE_ITEM_PROMPT, CLUSTER_LABEL_PROMPT } from './prompts'

export type PipelineOpts = {
  repo: NewsRepo
  ollamaClient?: OllamaClient
  classifierModel?: string
  embedModel?: string
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
  const { repo, ollamaClient, classifierModel } = opts
  if (!ollamaClient || !classifierModel) return

  const pending = repo.getItemsNeedingSummary(feedId, 10)
  for (const item of pending) {
    if (!item.rawText) continue
    const result = await runPrompt(
      SUMMARIZE_ITEM_PROMPT,
      { title: item.title, text: item.rawText },
      ollamaClient,
      classifierModel,
    )
    if (result.ok) {
      repo.setSummary(item.id, result.data.summary)

      // Check if the topic has analysis opt-in
      const topicId = repo.getTopicForFeed(feedId)
      if (topicId) {
        const topics = repo.listTopics()
        const topic = topics.find((t) => t.id === topicId)
        if (topic?.analysisOptIn) {
          const aResult = await runPrompt(
            ANALYZE_ITEM_PROMPT,
            { title: item.title, summary: result.data.summary },
            ollamaClient,
            classifierModel,
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
  const { repo, ollamaClient, classifierModel } = opts
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
      )
      if (result.ok) label = result.data.label
    }

    const cluster = repo.createCluster(topicId, label)
    for (const item of groupItems) {
      repo.assignCluster(item.id, cluster.id)
    }
  }
}

export async function runFullPipeline(opts: PipelineOpts): Promise<void> {
  const { repo } = opts
  const feeds = repo.listFeeds().filter((f) => f.enabled)

  if (feeds.length === 0) {
    console.warn('[news] pipeline: no enabled feeds — add topics/feeds first')
    return
  }

  for (const feed of feeds) {
    await fetchAndIngest(feed.id, feed.url, opts)
    await summarizePending(feed.id, opts)
  }

  const topics = repo.listTopics()
  for (const topic of topics) {
    await clusterTopic(topic.id, opts)
  }
}
