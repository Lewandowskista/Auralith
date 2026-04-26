import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { staggerListVariants, staggerItemVariants } from '@auralith/design-system'
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
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { toast } from 'sonner'
import { NewsItemCard } from './NewsItemCard'
import type { NewsItemData } from './NewsItemCard'
import { ScreenShell } from '../../components/ScreenShell'
import { renderMarkdown } from '../../lib/markdown'

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

function FullArticleRenderer({ html }: { html: string }): ReactElement {
  const text = useMemo(() => {
    const d = document.createElement('div')
    d.innerHTML = html
    return d.textContent ?? ''
  }, [html])
  return (
    <div
      className="article-body"
      style={{
        color: 'var(--color-text-secondary)',
        fontSize: 14,
        lineHeight: 1.75,
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
    </div>
  )
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
  const [readerExpanded, setReaderExpanded] = useState(false)
  const [readPct, setReadPct] = useState(0)

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

  useEffect(() => {
    const unsub = window.auralith.on('news:fetch-complete', () => {
      void loadClusters(activeTopic?.id)
      void loadRawItems()
      setFetching(false)
    })
    return unsub
  }, [activeTopic, loadClusters, loadRawItems])

  // Reset progress when a new item is opened
  useEffect(() => {
    setReadPct(0)
    setReaderExpanded(false)
  }, [activeItem?.id])

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

  function handleReaderScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const pct = el.scrollTop / (el.scrollHeight - el.clientHeight)
    setReadPct(Math.min(1, isNaN(pct) ? 0 : pct))
  }

  return (
    <ScreenShell
      title="News"
      variant="split"
      actions={
        <>
          <button
            onClick={() => void handleTriggerFetch()}
            disabled={fetching}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-hairline)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-low)]"
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
            className="flex items-center justify-center h-7 w-7 rounded-lg border border-[var(--color-border-hairline)] transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-low)]"
            style={{
              background: addingTopic ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: addingTopic ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
            }}
            aria-label="New topic"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      }
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topic filter rail */}
        <div
          className="shrink-0 px-6 pt-3"
          style={{
            borderBottom: '1px solid var(--color-border-hairline)',
            background: 'rgba(14,14,20,0.40)',
          }}
        >
          <div className="flex gap-1.5 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
            {[{ id: null, name: 'All' }, ...topics].map((t) => {
              const isActive = t.id === null ? activeTopic === null : activeTopic?.id === t.id
              return (
                <motion.button
                  key={t.id ?? 'all'}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() =>
                    setActiveTopic(
                      t.id === null ? null : (topics.find((x) => x.id === t.id) ?? null),
                    )
                  }
                  className="shrink-0 focus-visible:outline-none"
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
                </motion.button>
              )
            })}
          </div>

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
                className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-violet-500/50 transition"
              />
              <button
                onClick={() => void handleCreateTopic()}
                disabled={!newTopicName.trim()}
                className="rounded-lg bg-[var(--color-accent-low)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAddingTopic(false)
                  setNewTopicName('')
                }}
                className="rounded-lg px-2 py-1.5 text-xs text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-primary)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Cluster + article list */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex flex-col gap-3 max-w-[720px] mx-auto">
              {clusters.length === 0 && rawItems.length > 0 ? (
                <motion.div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  variants={staggerListVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {rawItems.map((item) => (
                    <motion.div key={item.id} variants={staggerItemVariants}>
                      <NewsItemCard
                        item={item}
                        variant="standard"
                        onSelect={(i) => setActiveItem(activeItem?.id === i.id ? null : i)}
                        onToggleSave={handleToggleSave}
                        onMarkRead={handleMarkRead}
                      />
                    </motion.div>
                  ))}
                </motion.div>
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
                <motion.div
                  className="flex flex-col gap-3"
                  variants={staggerListVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {clusters.map((c) => (
                    <motion.div key={c.id} variants={staggerItemVariants}>
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
                          <div
                            className="text-sm font-medium leading-snug mb-1.5"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {renderMarkdown(c.summary)}
                          </div>
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

                      <AnimatePresence>
                        {activeCluster?.id === c.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-1.5 mt-2 pl-4">
                              {items.map((item, index) => (
                                <NewsItemCard
                                  key={item.id}
                                  item={item}
                                  variant={index === 0 ? 'featured' : 'compact'}
                                  onSelect={(i) =>
                                    setActiveItem(activeItem?.id === i.id ? null : i)
                                  }
                                  onToggleSave={handleToggleSave}
                                  onMarkRead={handleMarkRead}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          </div>

          {/* Article reader panel */}
          <AnimatePresence>
            {activeItem && (
              <motion.aside
                key={activeItem.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
                className={`shrink-0 flex flex-col overflow-hidden relative ${readerExpanded ? 'w-full' : 'w-[560px]'}`}
                style={{
                  borderLeft: '1px solid var(--color-border-hairline)',
                  background: 'rgba(12,12,18,0.92)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  transition: 'width 0.22s ease',
                }}
              >
                {/* Reading progress bar */}
                <div
                  className="absolute top-0 left-0 h-[2px] z-10 pointer-events-none"
                  style={{
                    width: `${readPct * 100}%`,
                    background:
                      'linear-gradient(90deg, var(--color-accent-low), var(--color-accent-mid))',
                    transition: 'width 0.1s linear',
                  }}
                />

                {/* Sticky header */}
                <div
                  className="shrink-0 flex items-center justify-between gap-2 px-5 py-3"
                  style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {activeItem.sourceName && (
                      <span
                        className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(139,92,246,0.12)',
                          border: '1px solid rgba(139,92,246,0.25)',
                          color: 'var(--color-accent-mid)',
                        }}
                      >
                        {activeItem.sourceName}
                      </span>
                    )}
                    <span
                      className="text-[11px] truncate"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {activeItem.publishedAt
                        ? new Date(activeItem.publishedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Unknown date'}
                    </span>
                    {activeItem.readingTimeMin && (
                      <span
                        className="flex items-center gap-0.5 text-[11px] shrink-0"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        <Clock className="h-3 w-3" />
                        {activeItem.readingTimeMin}m
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setReaderExpanded((v) => !v)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/[0.06]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      aria-label={readerExpanded ? 'Collapse reader' : 'Expand reader'}
                    >
                      {readerExpanded ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => void handleToggleSave(activeItem)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/[0.06]"
                      style={{
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
                    <a
                      href={activeItem.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/[0.06]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      aria-label="Open in browser"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto" onScroll={handleReaderScroll}>
                  {/* Hero media */}
                  {activeItem.videoUrl ? (
                    (() => {
                      const isYoutube = /youtu\.?be/.test(activeItem.videoUrl)
                      const embedUrl = isYoutube
                        ? activeItem.videoUrl
                            .replace('watch?v=', 'embed/')
                            .replace('youtu.be/', 'www.youtube.com/embed/')
                        : null
                      return (
                        <div className="w-full aspect-video bg-black">
                          {embedUrl ? (
                            <iframe
                              src={embedUrl}
                              className="w-full h-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              sandbox="allow-scripts allow-same-origin allow-presentation"
                            />
                          ) : (
                            <video
                              src={activeItem.videoUrl}
                              controls
                              className="w-full h-full object-contain"
                              preload="metadata"
                            />
                          )}
                        </div>
                      )
                    })()
                  ) : activeItem.imageUrl ? (
                    <div className="relative w-full overflow-hidden" style={{ maxHeight: 240 }}>
                      <img
                        src={activeItem.imageUrl}
                        alt=""
                        className="w-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(12,12,18,0.7)] to-transparent pointer-events-none" />
                    </div>
                  ) : null}

                  <div className="px-6 pt-5 pb-8 space-y-5">
                    {/* Title */}
                    <h2
                      className="text-base font-semibold leading-snug"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {activeItem.title}
                    </h2>

                    {/* Author */}
                    {activeItem.author && (
                      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        By {activeItem.author}
                      </p>
                    )}

                    {/* Categories */}
                    {activeItem.categories && activeItem.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {activeItem.categories.map((cat) => (
                          <span
                            key={cat}
                            className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'var(--color-text-tertiary)',
                            }}
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Summary block */}
                    {activeItem.summary ? (
                      <div
                        className="rounded-xl p-4 space-y-2"
                        style={{
                          background: 'rgba(255,255,255,0.025)',
                          border: '1px solid var(--color-border-hairline)',
                        }}
                      >
                        <p
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          Summary
                        </p>
                        <div
                          style={{
                            color: 'var(--color-text-secondary)',
                            fontSize: 13,
                            lineHeight: 1.7,
                          }}
                        >
                          {renderMarkdown(activeItem.summary)}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs italic" style={{ color: 'var(--color-text-tertiary)' }}>
                        No summary available — Ollama may be offline.
                      </p>
                    )}

                    {/* AI Analysis block */}
                    {activeItem.analysis && (
                      <div
                        className="rounded-xl p-4 space-y-2"
                        style={{
                          background: 'rgba(52,211,153,0.04)',
                          border: '1px solid rgba(52,211,153,0.18)',
                        }}
                      >
                        <p
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--color-state-success)' }}
                        >
                          AI Analysis · not established fact
                        </p>
                        <div
                          style={{
                            color: 'var(--color-text-secondary)',
                            fontSize: 13,
                            lineHeight: 1.7,
                          }}
                        >
                          {renderMarkdown(activeItem.analysis)}
                        </div>
                      </div>
                    )}

                    {/* Full article content (fetched from source) */}
                    {activeItem.fullContent && (
                      <div className="space-y-2">
                        <div
                          style={{
                            borderTop: '1px solid var(--color-border-hairline)',
                            paddingTop: 16,
                          }}
                        >
                          <p
                            className="text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            Full Article
                          </p>
                        </div>
                        <FullArticleRenderer html={activeItem.fullContent} />
                      </div>
                    )}

                    {/* RSS Excerpt (always shown; labeled contextually) */}
                    {activeItem.rawText && (
                      <div className="space-y-2">
                        <div
                          className="flex items-center gap-2"
                          style={{
                            borderTop: '1px solid var(--color-border-hairline)',
                            paddingTop: 16,
                          }}
                        >
                          <p
                            className="text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {activeItem.fullContent ? 'RSS Excerpt' : 'Article'}
                          </p>
                        </div>
                        <div
                          className="leading-relaxed"
                          style={{
                            color: 'var(--color-text-secondary)',
                            fontSize: 13,
                            lineHeight: 1.75,
                          }}
                        >
                          {renderMarkdown(activeItem.rawText)}
                        </div>
                      </div>
                    )}

                    {/* Open in browser CTA */}
                    <a
                      href={activeItem.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 w-full justify-center rounded-xl py-2.5 text-xs font-medium transition-all"
                      style={{
                        background: 'rgba(139,92,246,0.10)',
                        border: '1px solid rgba(139,92,246,0.22)',
                        color: 'var(--color-accent-mid)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(139,92,246,0.18)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(139,92,246,0.10)'
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open full article in browser
                    </a>
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* Topic management bar */}
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
    </ScreenShell>
  )
}
