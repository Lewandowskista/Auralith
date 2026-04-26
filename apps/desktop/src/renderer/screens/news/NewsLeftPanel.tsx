import { useState, useRef, useEffect } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw,
  Plus,
  X,
  Trash2,
  FlaskConical,
  Headphones,
  BookmarkCheck,
  Eye,
} from 'lucide-react'

type Topic = { id: string; name: string; slug: string; analysisOptIn: boolean }

type Props = {
  topics: Topic[]
  activeTopic: Topic | null
  fetching: boolean
  lastRefreshedAt: number | null
  filterUnread: boolean
  filterSaved: boolean
  clusterCountByTopicId: Map<string, number>
  onSetActiveTopic: (topic: Topic | null) => void
  onSetFilterUnread: (v: boolean) => void
  onSetFilterSaved: (v: boolean) => void
  onTriggerFetch: () => void
  onTriggerBriefing: () => void
  onCreateTopic: (name: string) => Promise<void>
  onDeleteTopic: (topic: Topic) => Promise<void>
  onToggleAnalysis: (topic: Topic) => Promise<void>
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function SectionLabel({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <p
      className="text-[10px] font-semibold uppercase tracking-widest mb-2"
      style={{ color: 'var(--color-text-tertiary)' }}
    >
      {children}
    </p>
  )
}

function FilterToggle({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactElement
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left"
      style={{
        background: active ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? 'rgba(139,92,246,0.28)' : 'var(--color-border-hairline)'}`,
        color: active ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
      }}
    >
      <span style={{ color: active ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)' }}>
        {icon}
      </span>
      {label}
      {active && (
        <span
          className="ml-auto w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--color-accent-mid)' }}
        />
      )}
    </button>
  )
}

export function NewsLeftPanel({
  topics,
  activeTopic,
  fetching,
  lastRefreshedAt,
  filterUnread,
  filterSaved,
  clusterCountByTopicId,
  onSetActiveTopic,
  onSetFilterUnread,
  onSetFilterSaved,
  onTriggerFetch,
  onTriggerBriefing,
  onCreateTopic,
  onDeleteTopic,
  onToggleAnalysis,
}: Props): ReactElement {
  const [addingTopic, setAddingTopic] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingTopic) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [addingTopic])

  async function handleCreate() {
    const name = newTopicName.trim()
    if (!name) return
    setCreating(true)
    try {
      await onCreateTopic(name)
      setNewTopicName('')
      setAddingTopic(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="shrink-0 flex flex-col h-full overflow-hidden"
      style={{
        width: 260,
        background: 'var(--color-bg-1)',
        borderRight: '1px solid var(--color-border-hairline)',
      }}
    >
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* Topics */}
        <div>
          <SectionLabel>Topics</SectionLabel>
          <div className="space-y-1">
            {/* All */}
            <button
              onClick={() => onSetActiveTopic(null)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all text-left"
              style={{
                background: activeTopic === null ? 'rgba(139,92,246,0.14)' : 'transparent',
                border: `1px solid ${activeTopic === null ? 'rgba(139,92,246,0.28)' : 'transparent'}`,
                color:
                  activeTopic === null ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (activeTopic !== null)
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={(e) => {
                if (activeTopic !== null) e.currentTarget.style.background = 'transparent'
              }}
            >
              <span>All topics</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {topics.length}
              </span>
            </button>

            {topics.map((topic) => {
              const isActive = activeTopic?.id === topic.id
              const count = clusterCountByTopicId.get(topic.id) ?? 0
              return (
                <button
                  key={topic.id}
                  onClick={() => onSetActiveTopic(isActive ? null : topic)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all text-left group"
                  style={{
                    background: isActive ? 'rgba(139,92,246,0.14)' : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(139,92,246,0.28)' : 'transparent'}`,
                    color: isActive ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span className="truncate flex-1 text-left">{topic.name}</span>
                  {count > 0 && (
                    <span
                      className="shrink-0 ml-2 text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: isActive ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                        color: isActive ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}

            {/* Add topic */}
            <AnimatePresence>
              {addingTopic ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden pt-1"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={inputRef}
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleCreate()
                        if (e.key === 'Escape') {
                          setAddingTopic(false)
                          setNewTopicName('')
                        }
                      }}
                      placeholder="Topic name…"
                      className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none transition"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--color-border-subtle)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                    <button
                      onClick={() => void handleCreate()}
                      disabled={creating || !newTopicName.trim()}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-white transition disabled:opacity-40"
                      style={{ background: 'var(--color-accent-gradient)' }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setAddingTopic(false)
                        setNewTopicName('')
                      }}
                      className="flex items-center justify-center w-7 h-7 rounded-lg transition hover:bg-white/[0.06]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <button
                  onClick={() => setAddingTopic(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-tertiary)'
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Add topic
                </button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Filters */}
        <div>
          <SectionLabel>Filter</SectionLabel>
          <div className="space-y-1.5">
            <FilterToggle
              active={filterUnread}
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Unread only"
              onClick={() => onSetFilterUnread(!filterUnread)}
            />
            <FilterToggle
              active={filterSaved}
              icon={<BookmarkCheck className="h-3.5 w-3.5" />}
              label="Saved only"
              onClick={() => onSetFilterSaved(!filterSaved)}
            />
          </div>
        </div>

        {/* Manage (visible when topic selected) */}
        <AnimatePresence>
          {activeTopic && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <SectionLabel>Manage</SectionLabel>
              <div className="space-y-1">
                <button
                  onClick={() => void onToggleAnalysis(activeTopic)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-tertiary)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                  {activeTopic.analysisOptIn ? 'Disable' : 'Enable'} AI analysis
                </button>
                <button
                  onClick={() => void onDeleteTopic(activeTopic)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left"
                  style={{ color: 'var(--color-state-danger)', opacity: 0.7 }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1'
                    e.currentTarget.style.background = 'rgba(248,113,113,0.06)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.7'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  Delete "{activeTopic.name}"
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div
        className="shrink-0 px-4 py-4 space-y-2"
        style={{ borderTop: '1px solid var(--color-border-hairline)' }}
      >
        <button
          onClick={onTriggerBriefing}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--color-border-hairline)',
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
          }}
        >
          <Headphones className="h-3.5 w-3.5" style={{ color: 'var(--color-accent-mid)' }} />
          Play briefing
        </button>

        <button
          onClick={onTriggerFetch}
          disabled={fetching}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
          style={{
            background: 'rgba(139,92,246,0.10)',
            border: '1px solid rgba(139,92,246,0.22)',
            color: 'var(--color-accent-mid)',
          }}
          onMouseEnter={(e) => {
            if (!fetching) e.currentTarget.style.background = 'rgba(139,92,246,0.18)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(139,92,246,0.10)'
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} />
          {fetching ? 'Refreshing…' : 'Refresh feeds'}
        </button>

        <p
          className="text-center text-[10px]"
          style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}
        >
          {lastRefreshedAt ? `Refreshed ${timeAgo(lastRefreshedAt)}` : 'Never refreshed'}
        </p>
      </div>
    </div>
  )
}
