import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { NewsLeftPanel } from './NewsLeftPanel'
import { NewsFeed } from './NewsFeed'
import { NewsArticleReader } from './NewsArticleReader'
import type { NewsItemData } from './NewsItemCard'

type Topic = { id: string; name: string; slug: string; analysisOptIn: boolean }
type Cluster = {
  id: string
  topicId: string
  summary: string
  createdAt: number
  itemCount: number
}
type TopicFeedLink = { topicId: string; feedId: string }

export function NewsScreen(): ReactElement {
  // Core data
  const [topics, setTopics] = useState<Topic[]>([])
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [rawItems, setRawItems] = useState<NewsItemData[]>([])
  const [topicFeedLinks, setTopicFeedLinks] = useState<TopicFeedLink[]>([])

  // Navigation state
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null)
  const [activeItem, setActiveItem] = useState<NewsItemData | null>(null)
  const [expandedClusterIds, setExpandedClusterIds] = useState<Set<string>>(new Set())
  const [heroItem, setHeroItem] = useState<NewsItemData | null>(null)

  // Filter state
  const [filterUnread, setFilterUnread] = useState(false)
  const [filterSaved, setFilterSaved] = useState(false)

  // UI state
  const [fetching, setFetching] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)

  // ── Data loaders ─────────────────────────────────────────────────────────

  const loadClusters = useCallback(async (topicId?: string) => {
    const res = await window.auralith.invoke('news.listClusters', {
      limit: 20,
      offset: 0,
      ...(topicId ? { topicId } : {}),
    })
    if (res.ok) {
      setClusters((res.data as { clusters: Cluster[] }).clusters)
      setExpandedClusterIds(new Set())
      setActiveItem(null)
    }
  }, [])

  const loadRawItems = useCallback(async () => {
    const res = await window.auralith.invoke('news.listItems', {
      limit: 60,
      offset: 0,
      unreadOnly: false,
      savedOnly: false,
    })
    if (res.ok) setRawItems((res.data as { items: NewsItemData[]; total: number }).items)
  }, [])

  const loadTopicFeedLinks = useCallback(async () => {
    const res = await window.auralith.invoke('news.listTopicFeeds', {})
    if (res.ok) setTopicFeedLinks((res.data as { links: TopicFeedLink[] }).links)
  }, [])

  const loadTopics = useCallback(async () => {
    const res = await window.auralith.invoke('news.listTopics', {})
    if (!res.ok) return
    const loaded = (res.data as { topics: Topic[] }).topics
    if (loaded.length === 0) {
      try {
        const settingRes = await window.auralith.invoke('settings.get', { key: 'news.topics' })
        if (settingRes.ok) {
          const saved = (settingRes.data as { value: unknown }).value
          if (Array.isArray(saved) && saved.length > 0) {
            await window.auralith.invoke('news.seedTopics', { topics: saved as string[] })
            const reloaded = await window.auralith.invoke('news.listTopics', {})
            if (reloaded.ok) setTopics((reloaded.data as { topics: Topic[] }).topics)
            setFetching(true)
            toast.info('First-time setup — fetching your news feeds…')
            void window.auralith.invoke('news.triggerFetch', {})
            return
          }
        }
      } catch (err) {
        console.error('[NewsScreen] auto-seed failed:', err)
      }
    }
    setTopics(loaded)
  }, [])

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    void loadTopics()
  }, [loadTopics])

  useEffect(() => {
    void loadClusters(activeTopic?.id)
    void loadRawItems()
    void loadTopicFeedLinks()
  }, [activeTopic, loadClusters, loadRawItems, loadTopicFeedLinks])

  // Pre-fetch the first item of the hero cluster for the hero card
  useEffect(() => {
    const heroCluster = clusters[0]
    if (!heroCluster) {
      setHeroItem(null)
      return
    }
    window.auralith
      .invoke('news.listItems', {
        clusterId: heroCluster.id,
        limit: 1,
        offset: 0,
        unreadOnly: false,
        savedOnly: false,
      })
      .then((res) => {
        if (res.ok) {
          const items = (res.data as { items: NewsItemData[] }).items
          setHeroItem(items[0] ?? null)
        }
      })
      .catch((err) => console.error('[NewsScreen] hero item fetch failed:', err))
  }, [clusters])

  useEffect(() => {
    const unsub = window.auralith.on('news:fetch-complete', () => {
      void loadClusters(activeTopic?.id)
      void loadRawItems()
      void loadTopicFeedLinks()
      setFetching(false)
      setLastRefreshedAt(Date.now())
    })
    return unsub
  }, [activeTopic, loadClusters, loadRawItems, loadTopicFeedLinks])

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleTriggerFetch() {
    setFetching(true)
    try {
      await window.auralith.invoke('news.triggerFetch', {})
      toast.success('Fetch started — refreshing…')
    } catch {
      setFetching(false)
      toast.error('Could not start feed refresh.')
    }
  }

  function patchItem(id: string, patch: Partial<NewsItemData>) {
    setRawItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    if (heroItem?.id === id) setHeroItem((h) => (h ? { ...h, ...patch } : h))
    if (activeItem?.id === id) setActiveItem((a) => (a ? { ...a, ...patch } : a))
  }

  async function handleToggleSave(item: NewsItemData) {
    const saved = !item.saved
    await window.auralith.invoke('news.saveItem', { itemId: item.id, saved })
    patchItem(item.id, { saved })
    toast.success(saved ? 'Saved' : 'Unsaved')
  }

  async function handleMarkRead(item: NewsItemData) {
    if (item.readAt) return
    await window.auralith.invoke('news.markRead', { itemId: item.id })
    patchItem(item.id, { readAt: Date.now() })
  }

  function handleSelectItem(item: NewsItemData) {
    setActiveItem((prev) => (prev?.id === item.id ? null : item))
    void handleMarkRead(item)
  }

  function handleToggleCluster(id: string) {
    setExpandedClusterIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreateTopic(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const res = await window.auralith.invoke('news.createTopic', { name, slug })
    if (res.ok) {
      toast.success('Topic created')
      void loadTopics()
    } else {
      toast.error('Could not create topic.')
    }
  }

  async function handleDeleteTopic(topic: Topic) {
    const res = await window.auralith.invoke('news.deleteTopic', { id: topic.id })
    if (res.ok) {
      toast.success('Topic deleted')
      if (activeTopic?.id === topic.id) setActiveTopic(null)
      void loadTopics()
    }
  }

  async function handleToggleAnalysis(topic: Topic) {
    await window.auralith.invoke('news.setTopicAnalysisOptIn', {
      topicId: topic.id,
      optIn: !topic.analysisOptIn,
    })
    setTopics((prev) =>
      prev.map((t) => (t.id === topic.id ? { ...t, analysisOptIn: !t.analysisOptIn } : t)),
    )
    if (activeTopic?.id === topic.id)
      setActiveTopic((t) => (t ? { ...t, analysisOptIn: !t.analysisOptIn } : t))
  }

  function handleTriggerBriefing() {
    const topicName = activeTopic?.name
    const prompt = `Please give me a spoken briefing of today's top news stories${topicName ? ` in the "${topicName}" topic` : ''}.`
    window.dispatchEvent(new CustomEvent('auralith:navigate', { detail: { section: 'assistant' } }))
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('auralith:assistant-prefill', { detail: prompt }))
    }, 300)
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const clusterCountByTopicId = useMemo(
    () => new Map(topics.map((t) => [t.id, clusters.filter((c) => c.topicId === t.id).length])),
    [topics, clusters],
  )

  const visibleRawItems = useMemo(() => {
    if (!activeTopic) return rawItems
    const feedIds = new Set(
      topicFeedLinks.filter((l) => l.topicId === activeTopic.id).map((l) => l.feedId),
    )
    return rawItems.filter((i) => feedIds.has(i.feedId))
  }, [rawItems, activeTopic, topicFeedLinks])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      <NewsLeftPanel
        topics={topics}
        activeTopic={activeTopic}
        fetching={fetching}
        lastRefreshedAt={lastRefreshedAt}
        filterUnread={filterUnread}
        filterSaved={filterSaved}
        clusterCountByTopicId={clusterCountByTopicId}
        onSetActiveTopic={setActiveTopic}
        onSetFilterUnread={setFilterUnread}
        onSetFilterSaved={setFilterSaved}
        onTriggerFetch={() => void handleTriggerFetch()}
        onTriggerBriefing={handleTriggerBriefing}
        onCreateTopic={handleCreateTopic}
        onDeleteTopic={handleDeleteTopic}
        onToggleAnalysis={handleToggleAnalysis}
      />

      <div className="flex flex-1 overflow-hidden">
        <NewsFeed
          clusters={clusters}
          heroItem={heroItem}
          rawItems={visibleRawItems}
          activeItemId={activeItem?.id ?? null}
          expandedClusterIds={expandedClusterIds}
          fetching={fetching}
          onToggleCluster={handleToggleCluster}
          onSelectItem={handleSelectItem}
          onToggleSave={handleToggleSave}
          onMarkRead={handleMarkRead}
          onTriggerFetch={() => void handleTriggerFetch()}
        />

        <AnimatePresence>
          {activeItem && (
            <NewsArticleReader
              key={activeItem.id}
              item={activeItem}
              onClose={() => setActiveItem(null)}
              onToggleSave={handleToggleSave}
              onPatchItem={patchItem}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
