import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import {
  Plus,
  Trash2,
  Rss,
  Tag,
  ChevronDown,
  ChevronRight,
  Brain,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

type Topic = {
  id: string
  name: string
  slug: string
  analysisOptIn: boolean
}

type Feed = {
  id: string
  url: string
  title: string
  enabled: boolean
  fetchInterval: number
}

type TopicFeedLink = { topicId: string; feedId: string }

const CURATED_TOPICS = [
  'Technology',
  'Science',
  'Business',
  'World News',
  'Health',
  'AI & Machine Learning',
  'Design',
  'Finance',
  'Culture',
  'Sports',
  'Cooking',
  'Film & TV',
  'Books',
  'Games',
]

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): ReactElement {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
        checked ? 'bg-violet-500' : 'bg-white/20',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

function TopicRow({
  topic,
  feeds,
  onDelete,
  onToggleAnalysis,
  onAddFeed,
  onRemoveFeed,
}: {
  topic: Topic
  feeds: Feed[]
  onDelete: (id: string) => void
  onToggleAnalysis: (id: string, v: boolean) => void
  onAddFeed: (topicId: string, url: string, title: string) => void
  onRemoveFeed: (feedId: string) => void
}): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const [addingFeed, setAddingFeed] = useState(false)
  const [feedUrl, setFeedUrl] = useState('')
  const [feedTitle, setFeedTitle] = useState('')

  function submitFeed() {
    const url = feedUrl.trim()
    const title = feedTitle.trim()
    if (!url || !title) return
    onAddFeed(topic.id, url, title)
    setFeedUrl('')
    setFeedTitle('')
    setAddingFeed(false)
  }

  return (
    <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 overflow-hidden">
      {/* Topic header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left focus-visible:outline-none"
          aria-expanded={expanded}
        >
          <span className="text-[var(--color-text-tertiary)]">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <Tag size={13} className="text-violet-400 shrink-0" />
          <span className="text-sm font-medium text-[var(--color-text-primary)]">{topic.name}</span>
          <span className="text-xs text-[var(--color-text-tertiary)] ml-1">
            {feeds.length} {feeds.length === 1 ? 'feed' : 'feeds'}
          </span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Brain size={12} className="text-[var(--color-text-tertiary)]" />
            <span className="text-xs text-[var(--color-text-tertiary)]">Analysis</span>
            <Toggle
              checked={topic.analysisOptIn}
              onChange={(v) => onToggleAnalysis(topic.id, v)}
              label={`Toggle AI analysis for ${topic.name}`}
            />
          </div>
          <button
            onClick={() => onDelete(topic.id)}
            className="rounded-md p-1 text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label={`Delete topic ${topic.name}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded feeds */}
      {expanded && (
        <div className="border-t border-[var(--color-border-hairline)] px-4 pb-3 pt-2 space-y-1.5">
          {feeds.length === 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)] py-1">
              No feeds linked to this topic yet.
            </p>
          )}
          {feeds.map((feed) => (
            <div key={feed.id} className="flex items-center gap-2 group">
              <Rss size={12} className="text-violet-400/60 shrink-0" />
              <span className="flex-1 text-xs text-[var(--color-text-secondary)] truncate">
                {feed.title}
              </span>
              <span className="text-xs text-[var(--color-text-tertiary)] truncate max-w-[180px] hidden group-hover:block">
                {feed.url}
              </span>
              <button
                onClick={() => onRemoveFeed(feed.id)}
                className="ml-auto shrink-0 rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:outline-none"
                aria-label={`Remove feed ${feed.title}`}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}

          {addingFeed ? (
            <div className="mt-2 space-y-1.5">
              <input
                type="text"
                placeholder="Feed title"
                value={feedTitle}
                onChange={(e) => setFeedTitle(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-hairline)] bg-[var(--color-bg-1)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-violet-500/60 focus:outline-none"
              />
              <input
                type="url"
                placeholder="https://example.com/feed.xml"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitFeed()}
                className="w-full rounded-lg border border-[var(--color-border-hairline)] bg-[var(--color-bg-1)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-violet-500/60 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={submitFeed}
                  className="rounded-lg bg-violet-500/20 px-3 py-1 text-xs font-medium text-violet-300 hover:bg-violet-500/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setAddingFeed(false)
                    setFeedUrl('')
                    setFeedTitle('')
                  }}
                  className="rounded-lg px-3 py-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-white/5 transition-colors focus-visible:outline-none"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingFeed(true)}
              className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-violet-400 transition-colors focus-visible:outline-none"
            >
              <Plus size={11} />
              Add RSS feed
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function NewsSection(): ReactElement {
  const [topics, setTopics] = useState<Topic[]>([])
  const [feedMap, setFeedMap] = useState<Map<string, Feed>>(new Map())
  const [links, setLinks] = useState<TopicFeedLink[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)

  function feedsForTopic(topicId: string): Feed[] {
    return links
      .filter((l) => l.topicId === topicId)
      .map((l) => feedMap.get(l.feedId))
      .filter((f): f is Feed => f !== undefined)
  }

  async function loadData() {
    setLoading(true)
    const [topicsRes, feedsRes, linksRes] = await Promise.all([
      window.auralith.invoke('news.listTopics', {}),
      window.auralith.invoke('news.listFeeds', {}),
      window.auralith.invoke('news.listTopicFeeds', {}),
    ])

    if (topicsRes.ok) {
      setTopics((topicsRes.data as { topics: Topic[] }).topics)
    }
    if (feedsRes.ok) {
      const allFeeds = (feedsRes.data as { feeds: Feed[] }).feeds
      setFeedMap(new Map(allFeeds.map((f) => [f.id, f])))
    }
    if (linksRes.ok) {
      setLinks((linksRes.data as { links: TopicFeedLink[] }).links)
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [])

  async function handleCreateTopic(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const res = await window.auralith.invoke('news.createTopic', { name: trimmed, slug })
    if (res.ok) {
      setTopics((prev) => [...prev, (res.data as { topic: Topic }).topic])
      setNewTopicName('')
      setAddingTopic(false)
      toast.success(`Topic "${trimmed}" created`)
    } else {
      toast.error('Failed to create topic')
    }
  }

  async function handleDeleteTopic(id: string) {
    const topic = topics.find((t) => t.id === id)
    const res = await window.auralith.invoke('news.deleteTopic', { id })
    if (res.ok) {
      setTopics((prev) => prev.filter((t) => t.id !== id))
      setLinks((prev) => prev.filter((l) => l.topicId !== id))
      toast.success(`Topic "${topic?.name ?? ''}" removed`)
    } else {
      toast.error('Failed to delete topic')
    }
  }

  async function handleToggleAnalysis(topicId: string, optIn: boolean) {
    const res = await window.auralith.invoke('news.setTopicAnalysisOptIn', { topicId, optIn })
    if (res.ok) {
      setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, analysisOptIn: optIn } : t)))
    }
  }

  async function handleAddFeed(topicId: string, url: string, title: string) {
    const res = await window.auralith.invoke('news.addFeed', { url, title, topicId })
    if (res.ok) {
      const feed = (res.data as { feed: Feed }).feed
      setFeedMap((prev) => new Map(prev).set(feed.id, feed))
      setLinks((prev) => {
        const exists = prev.some((l) => l.topicId === topicId && l.feedId === feed.id)
        return exists ? prev : [...prev, { topicId, feedId: feed.id }]
      })
      toast.success(`Feed "${title}" added`)
    } else {
      toast.error('Failed to add feed')
    }
  }

  async function handleRemoveFeed(feedId: string) {
    const feed = feedMap.get(feedId)
    const res = await window.auralith.invoke('news.removeFeed', { id: feedId })
    if (res.ok) {
      setFeedMap((prev) => {
        const m = new Map(prev)
        m.delete(feedId)
        return m
      })
      setLinks((prev) => prev.filter((l) => l.feedId !== feedId))
      toast.success(`Feed "${feed?.title ?? ''}" removed`)
    } else {
      toast.error('Failed to remove feed')
    }
  }

  async function handleSeedTopics(topicNames: string[]) {
    setSeeding(true)
    const res = await window.auralith.invoke('news.seedTopics', { topics: topicNames })
    if (res.ok) {
      toast.success(
        `Seeded ${topicNames.length} topic${topicNames.length > 1 ? 's' : ''} with curated feeds`,
      )
      await loadData()
    } else {
      toast.error('Seeding failed')
    }
    setSeeding(false)
  }

  const existingSlugs = new Set(topics.map((t) => t.slug))
  const availableCurated = CURATED_TOPICS.filter(
    (name) => !existingSlugs.has(name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
  )

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[var(--color-text-primary)]">News</h2>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Configure topics and RSS feeds. The pipeline fetches and clusters articles from these
          sources.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
          <Loader2 size={14} className="animate-spin" />
          Loading news configuration…
        </div>
      ) : (
        <>
          {/* Topics list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Topics</h3>
              <button
                onClick={() => setAddingTopic(true)}
                className="flex items-center gap-1.5 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <Plus size={12} />
                Add topic
              </button>
            </div>

            {topics.length === 0 && !addingTopic && (
              <div className="rounded-xl border border-dashed border-[var(--color-border-hairline)] p-6 text-center">
                <Tag size={20} className="mx-auto mb-2 text-[var(--color-text-tertiary)]" />
                <p className="text-sm text-[var(--color-text-secondary)]">No topics yet</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                  Add topics manually or seed from curated presets below.
                </p>
              </div>
            )}

            {topics.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                feeds={feedsForTopic(topic.id)}
                onDelete={handleDeleteTopic}
                onToggleAnalysis={handleToggleAnalysis}
                onAddFeed={handleAddFeed}
                onRemoveFeed={handleRemoveFeed}
              />
            ))}

            {addingTopic && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
                <input
                  type="text"
                  placeholder="Topic name (e.g. Technology)"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateTopic(newTopicName)
                    if (e.key === 'Escape') {
                      setAddingTopic(false)
                      setNewTopicName('')
                    }
                  }}
                  autoFocus
                  className="w-full rounded-lg border border-[var(--color-border-hairline)] bg-[var(--color-bg-1)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-violet-500/60 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleCreateTopic(newTopicName)}
                    className="rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setAddingTopic(false)
                      setNewTopicName('')
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-white/5 transition-colors focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Curated presets */}
          {availableCurated.length > 0 && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                  Curated presets
                </h3>
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                  One-click topic seeds with hand-picked RSS feeds included.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableCurated.map((name) => (
                  <button
                    key={name}
                    onClick={() => void handleSeedTopics([name])}
                    disabled={seeding}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:border-violet-500/40 hover:text-violet-300 hover:bg-violet-500/8 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  >
                    {seeding ? <Loader2 size={10} className="animate-spin" /> : <Rss size={10} />}
                    {name}
                  </button>
                ))}
              </div>
              {availableCurated.length > 1 && (
                <button
                  onClick={() => void handleSeedTopics(availableCurated)}
                  disabled={seeding}
                  className="flex items-center gap-2 rounded-lg border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:border-violet-500/40 hover:text-violet-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  {seeding ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  Seed all {availableCurated.length} remaining topics
                </button>
              )}
            </div>
          )}

          {/* Pipeline note */}
          <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/20 p-4 space-y-1">
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">How it works</p>
            <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
              When you trigger a fetch from the News screen, Auralith pulls articles from every
              enabled feed, stores them locally, and optionally runs Ollama summarization and topic
              clustering. AI Analysis must be opted in per topic above.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
