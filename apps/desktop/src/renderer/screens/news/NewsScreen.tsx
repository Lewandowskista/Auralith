import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Newspaper,
  Layers,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  RefreshCw,
  Plus,
  Trash2,
  FlaskConical,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { NewsItemCard } from './NewsItemCard'
import type { NewsItemData } from './NewsItemCard'

type Topic = { id: string; name: string; slug: string; analysisOptIn: boolean }
type Cluster = {
  id: string
  topicId: string
  summary: string
  createdAt: number
  itemCount: number
}
type NewsItem = NewsItemData

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function NewsScreen(): ReactElement {
  const [topics, setTopics] = useState<Topic[]>([])
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [activeCluster, setActiveCluster] = useState<Cluster | null>(null)
  const [items, setItems] = useState<NewsItem[]>([])
  const [activeItem, setActiveItem] = useState<NewsItem | null>(null)
  const [fetching, setFetching] = useState(false)
  const [rawItems, setRawItems] = useState<NewsItem[]>([])
  const [addingTopic, setAddingTopic] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')

  const loadClusters = useCallback(async (topicId?: string) => {
    const res = await window.auralith.invoke('news.listClusters', {
      limit: 20,
      offset: 0,
      ...(topicId ? { topicId } : {}),
    })
    if (res.ok) {
      setClusters((res.data as { clusters: Cluster[] }).clusters)
      setActiveCluster(null)
      setActiveItem(null)
      setItems([])
    }
  }, [])

  const loadRawItems = useCallback(async (feedId?: string) => {
    const res = await window.auralith.invoke('news.listItems', {
      limit: 60,
      offset: 0,
      unreadOnly: false,
      savedOnly: false,
      ...(feedId ? { feedId } : {}),
    })
    if (res.ok) setRawItems((res.data as { items: NewsItem[]; total: number }).items)
  }, [])

  const loadTopics = useCallback(async () => {
    const res = await window.auralith.invoke('news.listTopics', {})
    if (!res.ok) return
    const loaded = (res.data as { topics: Topic[] }).topics
    if (loaded.length === 0) {
      // Topics were never seeded — check if onboarding saved preferences and seed now
      try {
        const settingRes = await window.auralith.invoke('settings.get', { key: 'news.topics' })
        if (settingRes.ok) {
          const saved = (settingRes.data as { value: unknown }).value
          if (Array.isArray(saved) && saved.length > 0) {
            await window.auralith.invoke('news.seedTopics', { topics: saved as string[] })
            const reloaded = await window.auralith.invoke('news.listTopics', {})
            if (reloaded.ok) setTopics((reloaded.data as { topics: Topic[] }).topics)
            // Kick off the first fetch automatically after seeding
            setFetching(true)
            toast.info('First-time setup — fetching your news feeds…')
            void window.auralith.invoke('news.triggerFetch', {}).then(() => {
              setTimeout(() => {
                void loadClusters(undefined)
                setFetching(false)
              }, 12_000)
            })
            return
          }
        }
      } catch (err) {
        console.error('[NewsScreen] auto-seed failed:', err)
      }
    }
    setTopics(loaded)
  }, [loadClusters])

  const loadItems = useCallback(async (clusterId: string) => {
    const res = await window.auralith.invoke('news.listItems', {
      clusterId,
      limit: 30,
      offset: 0,
      unreadOnly: false,
      savedOnly: false,
    })
    if (res.ok) setItems((res.data as { items: NewsItem[]; total: number }).items)
  }, [])

  useEffect(() => {
    void loadTopics()
  }, [loadTopics])

  useEffect(() => {
    void loadClusters(activeTopic?.id)
    void loadRawItems()
  }, [activeTopic, loadClusters, loadRawItems])

  useEffect(() => {
    if (activeCluster) void loadItems(activeCluster.id)
  }, [activeCluster, loadItems])

  async function handleTriggerFetch() {
    setFetching(true)
    try {
      await window.auralith.invoke('news.triggerFetch', {})
      toast.success('Fetch started — refreshing…')
      let attempts = 0
      const poll = setInterval(() => {
        attempts++
        void loadClusters(activeTopic?.id).catch(() => {
          clearInterval(poll)
          setFetching(false)
          toast.error('Refresh failed. Try again.')
        })
        void loadRawItems()
        if (attempts >= 12) {
          clearInterval(poll)
          setFetching(false)
        }
      }, 5_000)
    } catch {
      setFetching(false)
      toast.error('Could not start feed refresh.')
    }
  }

  function patchItem<T extends { id: string }>(
    id: string,
    patch: Partial<T>,
    setFn: (fn: (prev: T[]) => T[]) => void,
  ) {
    setFn((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  async function handleMarkRead(item: NewsItem) {
    if (item.readAt) return
    await window.auralith.invoke('news.markRead', { itemId: item.id })
    const patch = { readAt: Date.now() }
    patchItem(item.id, patch, setItems)
    patchItem(item.id, patch, setRawItems)
    if (activeItem?.id === item.id) setActiveItem({ ...item, ...patch })
  }

  async function handleToggleSave(item: NewsItem) {
    const saved = !item.saved
    await window.auralith.invoke('news.saveItem', { itemId: item.id, saved })
    patchItem(item.id, { saved }, setItems)
    patchItem(item.id, { saved }, setRawItems)
    if (activeItem?.id === item.id) setActiveItem({ ...item, saved })
    toast.success(saved ? 'Saved' : 'Unsaved')
  }

  async function handleCreateTopic() {
    const name = newTopicName.trim()
    if (!name) return
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const res = await window.auralith.invoke('news.createTopic', { name, slug })
    if (res.ok) {
      toast.success('Topic created')
      setNewTopicName('')
      setAddingTopic(false)
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

  return (
    <div data-testid="news-screen" className="flex flex-col h-full overflow-hidden">
      {/* Header + topic filter rail */}
      <div
        style={{
          borderBottom: '1px solid var(--color-border-hairline)',
          background: 'rgba(14,14,20,0.60)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '16px 24px 0',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <h2
            className="text-sm font-semibold flex-1"
            style={{ color: 'var(--color-text-primary)' }}
          >
            News
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void handleTriggerFetch()}
              disabled={fetching}
              className="flex items-center gap-1.5 text-xs transition disabled:opacity-40 focus-visible:outline-none"
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid var(--color-border-hairline)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                cursor: 'default',
                fontFamily: 'var(--font-sans)',
              }}
              aria-label="Refresh feeds"
            >
              <RefreshCw className={['h-3 w-3', fetching ? 'animate-spin' : ''].join(' ')} />
              Refresh
            </button>
            <button
              onClick={() => {
                setAddingTopic((v) => !v)
                setNewTopicName('')
              }}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition"
              style={{
                border: '1px solid var(--color-border-hairline)',
                background: addingTopic ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: addingTopic ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
                cursor: 'default',
              }}
              aria-label="New topic"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Topic filter pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
          {[{ id: null, name: 'All' }, ...topics].map((t) => {
            const isActive = t.id === null ? activeTopic === null : activeTopic?.id === t.id
            return (
              <button
                key={t.id ?? 'all'}
                onClick={() =>
                  setActiveTopic(t.id === null ? null : (topics.find((x) => x.id === t.id) ?? null))
                }
                className="transition-all shrink-0"
                style={{
                  padding: '5px 14px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 500,
                  border: `1px solid ${isActive ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                  background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: isActive ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
                  cursor: 'default',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {t.name}
              </button>
            )
          })}
        </div>

        {/* Inline new-topic input */}
        {addingTopic && (
          <div className="flex items-center gap-2 pb-3">
            <input
              autoFocus
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateTopic()
                if (e.key === 'Escape') {
                  setAddingTopic(false)
                  setNewTopicName('')
                }
              }}
              placeholder="Topic name…"
              className="flex-1 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-[#F4F4F8] outline-none placeholder:text-[#5F5F6F] border border-white/[0.08] focus:border-violet-500/50 transition"
            />
            <button
              onClick={() => void handleCreateTopic()}
              disabled={!newTopicName.trim()}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => {
                setAddingTopic(false)
                setNewTopicName('')
              }}
              className="rounded-lg px-2 py-1.5 text-xs text-[#6F6F80] transition hover:text-[#F4F4F8]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Main content — clusters feed on left + article reader on right */}
      <div className="flex flex-1 overflow-hidden">
        {/* Cluster + article list (scrollable) */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-3 max-w-[720px] mx-auto">
            {clusters.length === 0 && rawItems.length > 0 ? (
              // Items fetched but not yet clustered — show them in a media-rich grid
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rawItems.map((item) => (
                  <NewsItemCard
                    key={item.id}
                    item={item}
                    onSelect={(i) => setActiveItem(activeItem?.id === i.id ? null : i)}
                    onToggleSave={handleToggleSave}
                    onMarkRead={handleMarkRead}
                  />
                ))}
              </div>
            ) : clusters.length === 0 ? (
              <div className="flex h-full items-center justify-center py-20">
                <div className="text-center">
                  <Newspaper
                    size={28}
                    className="mx-auto mb-3"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  />
                  <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    No stories yet. Refresh feeds to load news.
                  </p>
                </div>
              </div>
            ) : (
              clusters.map((c) => (
                <div key={c.id}>
                  {/* Cluster header */}
                  <button
                    onClick={() => setActiveCluster(activeCluster?.id === c.id ? null : c)}
                    className="w-full text-left transition-all"
                    style={{
                      padding: '14px 16px',
                      borderRadius: 14,
                      border: `1px solid ${activeCluster?.id === c.id ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                      background:
                        activeCluster?.id === c.id
                          ? 'rgba(139,92,246,0.08)'
                          : 'rgba(20,20,28,0.80)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      cursor: 'default',
                      display: 'flex',
                      gap: 12,
                    }}
                    onMouseEnter={(e) => {
                      if (activeCluster?.id !== c.id)
                        e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                    }}
                    onMouseLeave={(e) => {
                      if (activeCluster?.id !== c.id)
                        e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium leading-snug mb-1.5"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {c.summary}
                      </p>
                      <div className="flex items-center gap-2">
                        <Layers
                          className="h-3 w-3"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        />
                        <span
                          className="text-[11px]"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {c.itemCount} articles · {timeAgo(c.createdAt)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 transition-transform ${activeCluster?.id === c.id ? 'rotate-90' : ''}`}
                      style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}
                    />
                  </button>

                  {/* Articles for this cluster */}
                  <AnimatePresence>
                    {activeCluster?.id === c.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pl-4">
                          {items.map((item) => (
                            <NewsItemCard
                              key={item.id}
                              item={item}
                              onSelect={(i) => setActiveItem(activeItem?.id === i.id ? null : i)}
                              onToggleSave={handleToggleSave}
                              onMarkRead={handleMarkRead}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Article reader panel */}
        <AnimatePresence>
          {activeItem && (
            <motion.aside
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22, ease: [0, 0, 0.2, 1] }}
              className="w-80 shrink-0 overflow-y-auto p-5"
              style={{
                borderLeft: '1px solid var(--color-border-hairline)',
                background: 'rgba(14,14,20,0.85)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              }}
            >
              {/* Hero image */}
              {activeItem.imageUrl && (
                <div className="relative -mx-5 -mt-5 mb-4 overflow-hidden" style={{ height: 160 }}>
                  <img
                    src={activeItem.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                </div>
              )}

              <div className="flex items-start justify-between gap-2 mb-4">
                <p
                  className="flex-1 text-sm font-semibold leading-snug"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {activeItem.title}
                </p>
                <button
                  onClick={() => void handleToggleSave(activeItem)}
                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'default',
                    color: activeItem.saved
                      ? 'var(--color-accent-mid)'
                      : 'var(--color-text-tertiary)',
                  }}
                  aria-label={activeItem.saved ? 'Unsave' : 'Save'}
                >
                  {activeItem.saved ? (
                    <BookmarkCheck className="h-4 w-4" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Metadata strip */}
              <div
                className="flex items-center gap-2 mb-3 text-[10px]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {activeItem.author && (
                  <span className="truncate max-w-[120px]">{activeItem.author}</span>
                )}
                {activeItem.author && <span>·</span>}
                <span>
                  {activeItem.publishedAt
                    ? new Date(activeItem.publishedAt).toLocaleDateString()
                    : 'Unknown date'}
                </span>
                {activeItem.readingTimeMin && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {activeItem.readingTimeMin}m
                    </span>
                  </>
                )}
              </div>

              {activeItem.summary ? (
                <div
                  className="mb-4 text-xs leading-relaxed"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--color-border-hairline)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase mb-1.5"
                    style={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.06em' }}
                  >
                    Summary
                  </p>
                  {activeItem.summary}
                </div>
              ) : (
                <p className="mb-4 text-xs italic" style={{ color: 'var(--color-text-tertiary)' }}>
                  No summary — Ollama may be offline.
                </p>
              )}

              {activeItem.analysis && (
                <div
                  className="mb-4 text-xs leading-relaxed"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(52,211,153,0.20)',
                    background: 'rgba(52,211,153,0.05)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase mb-1.5"
                    style={{ color: 'var(--color-state-success)', letterSpacing: '0.06em' }}
                  >
                    AI Analysis · not established fact
                  </p>
                  {activeItem.analysis}
                </div>
              )}

              <a
                href={activeItem.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs transition-colors"
                style={{ color: 'var(--color-accent-mid)' }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Read full article
              </a>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Topic management bar (when a topic is selected) */}
      {activeTopic && (
        <div
          className="flex items-center justify-between px-6 py-2 shrink-0"
          style={{
            borderTop: '1px solid var(--color-border-hairline)',
            background: 'rgba(14,14,20,0.60)',
          }}
        >
          <button
            onClick={() => void handleToggleAnalysis(activeTopic)}
            className="flex items-center gap-1.5 text-[11px] transition-colors"
            style={{ color: 'var(--color-text-tertiary)', cursor: 'default' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
            }}
          >
            <FlaskConical className="h-3 w-3" />
            {activeTopic.analysisOptIn ? 'Disable AI analysis' : 'Enable AI analysis'} for{' '}
            {activeTopic.name}
          </button>
          <button
            onClick={() => void handleDeleteTopic(activeTopic)}
            className="flex items-center gap-1 text-[11px] transition-colors"
            style={{ color: 'var(--color-state-danger)', opacity: 0.6, cursor: 'default' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.6'
            }}
          >
            <Trash2 className="h-3 w-3" /> Remove topic
          </button>
        </div>
      )}
    </div>
  )
}
