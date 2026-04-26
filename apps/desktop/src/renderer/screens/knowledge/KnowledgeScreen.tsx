import { useState, useEffect, useCallback, useRef, type ReactElement } from 'react'
import {
  Search,
  RefreshCw,
  FileText,
  Plus,
  FolderOpen,
  BookOpen,
  LayoutGrid,
  List,
  Headphones,
  Video,
  Image,
  Filter,
  X,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { OllamaBanner } from '../../components/OllamaBanner'
import { renderMarkdown } from '../../lib/markdown'
import { useOllamaStatus } from '../../hooks/useOllamaStatus'
import { EmptyState } from '../../components/EmptyState'

type Space = { id: string; name: string; slug: string; createdAt: number }
type Doc = {
  id: string
  path: string
  kind: string
  title: string
  size: number
  mtime: number
  indexedAt?: number
  spaceId?: string
}
type SearchResult = {
  doc: { id: string; path: string; kind: string; title: string; size: number; mtime: number }
  citation: {
    chunkId: string
    docPath: string
    headingPath: string
    charStart: number
    charEnd: number
    page?: number
    text: string
  }
  score: number
}

function GhostBtn({
  children,
  icon,
  onClick,
  disabled,
  active,
  style,
}: {
  children?: React.ReactNode
  icon?: ReactElement
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  style?: React.CSSProperties
}): ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: children ? '6px 12px' : '6px 8px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 500,
        border: `1px solid ${active ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
        background: active ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
        color: active ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 140ms ease',
        fontFamily: 'var(--font-sans)',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = active
            ? 'rgba(139,92,246,0.18)'
            : 'rgba(255,255,255,0.07)'
          e.currentTarget.style.color = 'var(--color-text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = active
            ? 'rgba(139,92,246,0.12)'
            : 'rgba(255,255,255,0.04)'
          e.currentTarget.style.color = active
            ? 'var(--color-accent-mid)'
            : 'var(--color-text-secondary)'
        }
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function PrimaryBtn({
  children,
  icon,
  onClick,
  disabled,
}: {
  children?: React.ReactNode
  icon?: ReactElement
  onClick?: () => void
  disabled?: boolean
}): ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        border: '1px solid rgba(139,92,246,0.35)',
        background: 'var(--color-accent-gradient)',
        color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 140ms ease',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

function fmtAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function DocKindIcon({ kind }: { kind: string }): ReactElement {
  const props = { size: 14, style: { opacity: 0.7 } }
  if (kind === 'audio') return <Headphones {...props} />
  if (kind === 'video') return <Video {...props} />
  if (kind === 'image') return <Image {...props} />
  return <FileText {...props} />
}

function DocKindColor(kind: string): string {
  if (kind === 'audio') return '#38bdf8'
  if (kind === 'video') return '#a78bfa'
  if (kind === 'image') return '#34d399'
  return '#6b7280'
}

export function KnowledgeScreen(): ReactElement {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [creatingSpace, setCreatingSpace] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchPending, setSearchPending] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const { status: ollamaStatus, retry: retryOllama } = useOllamaStatus()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const loadSpaces = useCallback(async () => {
    const res = await window.auralith.invoke('brain.listSpaces', {})
    if (res.ok) setSpaces((res.data as { spaces: Space[] }).spaces)
  }, [])

  const loadDocs = useCallback(async (spaceId: string | null) => {
    const res = await window.auralith.invoke('brain.listDocs', {
      spaceId: spaceId ?? undefined,
      limit: 50,
      offset: 0,
    })
    if (res.ok) setDocs((res.data as { docs: Doc[]; total: number }).docs)
  }, [])

  useEffect(() => {
    void loadSpaces()
  }, [loadSpaces])

  useEffect(() => {
    void loadDocs(activeSpaceId)
  }, [activeSpaceId, loadDocs])

  const search = useCallback(async () => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setSearchPending(false)
    setSearching(true)
    try {
      const res = await window.auralith.invoke('brain.search', {
        query,
        spaceId: activeSpaceId ?? undefined,
        topK: 8,
        mode: ollamaStatus === 'offline' ? 'fts' : 'hybrid',
      })
      if (res.ok) {
        setResults((res.data as { results: SearchResult[] }).results)
      } else {
        toast.error('Search failed. Try again.')
      }
    } finally {
      setSearching(false)
    }
  }, [query, activeSpaceId, ollamaStatus])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearchPending(false)
      return
    }
    setSearchPending(true)
    const id = setTimeout(() => {
      void search()
    }, 300)
    return () => clearTimeout(id)
  }, [query, search])

  async function handleReindex() {
    setReindexing(true)
    try {
      const res = await window.auralith.invoke('brain.reindex', {
        spaceId: activeSpaceId ?? undefined,
        force: false,
      })
      if (res.ok) {
        const { queued } = res.data as { queued: number }
        toast.success(`Reindex started — ${queued} files queued`)
      }
    } finally {
      setReindexing(false)
    }
  }

  async function handleDeleteSpace(id: string) {
    const res = await window.auralith.invoke('brain.deleteSpace', { id })
    if (res.ok) {
      toast.success('Space deleted')
      void loadSpaces()
    }
  }

  async function handleCreateSpace() {
    const name = newSpaceName.trim()
    if (!name) return
    const res = await window.auralith.invoke('brain.createSpace', { name })
    if (res.ok) {
      toast.success('Space created')
      setNewSpaceName('')
      setCreatingSpace(false)
      void loadSpaces()
    }
  }

  const activeSpace = spaces.find((s) => s.id === activeSpaceId)

  return (
    <div
      data-testid="brain-screen"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        padding: '28px 28px 0',
      }}
    >
      {/* Narrative header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ marginBottom: 22, flexShrink: 0 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                marginBottom: 6,
                color: 'var(--color-text-primary)',
              }}
            >
              <em style={{ fontStyle: 'italic', color: 'var(--color-accent-mid)' }}>Knowledge</em>
            </h1>
            <p
              style={{
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {docs.length} artifact{docs.length !== 1 ? 's' : ''}
              {spaces.length > 0
                ? ` across ${spaces.length} space${spaces.length !== 1 ? 's' : ''}`
                : ''}
              {activeSpace ? ` · ${activeSpace.name}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 4 }}>
            <GhostBtn
              icon={<Filter size={12} />}
              onClick={() => {
                searchInputRef.current?.focus()
                searchInputRef.current?.select()
              }}
              title="Focus the search bar to filter by content"
            >
              Filter
            </GhostBtn>
            <GhostBtn
              icon={<RefreshCw size={12} className={reindexing ? 'animate-spin' : ''} />}
              onClick={() => void handleReindex()}
              disabled={reindexing}
            >
              Reindex
            </GhostBtn>
            <GhostBtn icon={<FolderOpen size={12} />} onClick={() => setCreatingSpace(true)}>
              New space
            </GhostBtn>
            <PrimaryBtn
              icon={<Plus size={12} />}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('auralith:navigate', { detail: { section: 'assistant' } }),
                )
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('auralith:assistant-prefill', {
                      detail: 'I want to save a note to my knowledge base. ',
                    }),
                  )
                }, 300)
              }}
            >
              Capture
            </PrimaryBtn>
          </div>
        </div>
      </motion.div>

      {ollamaStatus === 'offline' && <OllamaBanner onRetry={retryOllama} />}

      {/* Spaces row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.06, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', flexShrink: 0 }}
      >
        {/* All spaces card */}
        <button
          onClick={() => setActiveSpaceId(null)}
          style={{
            padding: '10px 14px',
            minWidth: 130,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderRadius: 12,
            border: `1px solid ${activeSpaceId === null ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
            background: activeSpaceId === null ? 'rgba(139,92,246,0.10)' : 'rgba(18,18,26,0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            cursor: 'pointer',
            transition: 'all 140ms ease',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background:
                activeSpaceId === null ? 'var(--color-accent-gradient)' : 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BookOpen
              size={14}
              style={{ color: activeSpaceId === null ? '#fff' : 'var(--color-text-tertiary)' }}
            />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color:
                  activeSpaceId === null ? 'var(--color-accent-high)' : 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              All spaces
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {docs.length} items
            </div>
          </div>
        </button>

        {spaces.map((s) => (
          <div key={s.id} className="group" style={{ position: 'relative' }}>
            <button
              onClick={() => setActiveSpaceId(s.id)}
              style={{
                padding: '10px 14px',
                minWidth: 130,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderRadius: 12,
                border: `1px solid ${activeSpaceId === s.id ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                background: activeSpaceId === s.id ? 'rgba(139,92,246,0.10)' : 'rgba(18,18,26,0.6)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                cursor: 'pointer',
                transition: 'all 140ms ease',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background:
                    activeSpaceId === s.id
                      ? 'var(--color-accent-gradient)'
                      : 'rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FolderOpen
                  size={14}
                  style={{ color: activeSpaceId === s.id ? '#fff' : 'var(--color-text-tertiary)' }}
                />
              </div>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      activeSpaceId === s.id
                        ? 'var(--color-accent-high)'
                        : 'var(--color-text-primary)',
                    fontFamily: 'var(--font-sans)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 120,
                  }}
                >
                  {s.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  space
                </div>
              </div>
            </button>
            <button
              onClick={() => void handleDeleteSpace(s.id)}
              aria-label={`Delete ${s.name}`}
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 18,
                height: 18,
                borderRadius: 6,
                background: 'rgba(248,113,113,0.15)',
                border: '1px solid rgba(248,113,113,0.3)',
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#f87171',
              }}
              className="group-hover:!flex"
            >
              <X size={10} />
            </button>
          </div>
        ))}

        {/* New space inline form */}
        <AnimatePresence>
          {creatingSpace && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: -8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, x: -8 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'flex', gap: 6, alignItems: 'center' }}
            >
              <input
                data-testid="space-name-input"
                autoFocus
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreateSpace()
                  if (e.key === 'Escape') {
                    setCreatingSpace(false)
                    setNewSpaceName('')
                  }
                }}
                placeholder="Space name…"
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border-accent)',
                  background: 'rgba(139,92,246,0.08)',
                  color: 'var(--color-text-primary)',
                  fontSize: 12,
                  fontFamily: 'var(--font-sans)',
                  outline: 'none',
                  width: 160,
                }}
              />
              <button
                data-testid="space-save-btn"
                onClick={() => void handleCreateSpace()}
                disabled={!newSpaceName.trim()}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(139,92,246,0.35)',
                  background: 'var(--color-accent-gradient)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: newSpaceName.trim() ? 'pointer' : 'not-allowed',
                  opacity: newSpaceName.trim() ? 1 : 0.5,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Save
              </button>
              <GhostBtn
                onClick={() => {
                  setCreatingSpace(false)
                  setNewSpaceName('')
                }}
                icon={<X size={12} />}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Search + view toggle toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 12,
            border: '1px solid var(--color-border-subtle)',
            background: 'rgba(255,255,255,0.03)',
            transition: 'border-color 140ms ease',
          }}
          onFocusCapture={(e) => {
            e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
          }}
        >
          <Search
            size={14}
            style={{
              color:
                searching || searchPending
                  ? 'var(--color-accent-mid)'
                  : 'var(--color-text-tertiary)',
              transition: 'color 200ms ease',
              flexShrink: 0,
            }}
            className={searching || searchPending ? 'animate-pulse' : ''}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, tags, contents…"
            aria-label="Search knowledge"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13,
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
          />
          {ollamaStatus === 'offline' && (
            <span
              style={{
                fontSize: 10,
                color: '#fbbf24',
                fontFamily: 'var(--font-mono)',
                flexShrink: 0,
              }}
            >
              FTS only
            </span>
          )}
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            borderRadius: 10,
            border: '1px solid var(--color-border-hairline)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <button
            onClick={() => setView('grid')}
            title="Grid view"
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              border: 'none',
              background: view === 'grid' ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: view === 'grid' ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 140ms ease',
            }}
          >
            <LayoutGrid size={13} />
          </button>
          <button
            onClick={() => setView('list')}
            title="List view"
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              border: 'none',
              background: view === 'list' ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: view === 'list' ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 140ms ease',
            }}
          >
            <List size={13} />
          </button>
        </div>
      </motion.div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 16, paddingBottom: 28 }}>
        {/* Doc list / search results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {query.trim() ? (
            /* Search results */
            results.length === 0 && !searching ? (
              <div style={{ paddingTop: 48 }}>
                <EmptyState
                  icon={<Search size={22} />}
                  title="No results found"
                  description={`Nothing matched "${query}"`}
                />
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={query}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {results.map((r) => (
                    <motion.button
                      key={r.citation.chunkId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -1 }}
                      onClick={() =>
                        setSelectedResult(
                          selectedResult?.citation.chunkId === r.citation.chunkId ? null : r,
                        )
                      }
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '14px 16px',
                        borderRadius: 12,
                        border: `1px solid ${selectedResult?.citation.chunkId === r.citation.chunkId ? 'rgba(139,92,246,0.4)' : 'var(--color-border-hairline)'}`,
                        background:
                          selectedResult?.citation.chunkId === r.citation.chunkId
                            ? 'rgba(139,92,246,0.08)'
                            : 'rgba(18,18,26,0.6)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        cursor: 'pointer',
                        transition: 'all 140ms ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          {r.doc.title}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-accent-mid)',
                            background: 'rgba(139,92,246,0.12)',
                            padding: '2px 6px',
                            borderRadius: 6,
                            flexShrink: 0,
                          }}
                        >
                          {(r.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      {r.citation.headingPath && (
                        <p
                          style={{
                            fontSize: 11,
                            color: 'var(--color-text-tertiary)',
                            marginBottom: 4,
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          {r.citation.headingPath}
                        </p>
                      )}
                      <p
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text-secondary)',
                          lineHeight: 1.55,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          fontFamily: 'var(--font-sans)',
                        }}
                      >
                        {r.citation.text}
                      </p>
                    </motion.button>
                  ))}
                </motion.div>
              </AnimatePresence>
            )
          ) : view === 'grid' ? (
            /* Grid view */
            docs.length === 0 ? (
              <div style={{ paddingTop: 48 }}>
                <EmptyState
                  icon={<BookOpen size={22} />}
                  title="No documents indexed"
                  description="Create a Space, point it at a folder, and click Reindex to start building your knowledge base."
                />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: 14,
                }}
              >
                {docs.map((d, i) => {
                  const kindColor = DocKindColor(d.kind)
                  return (
                    <motion.div
                      key={d.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.25 }}
                      whileHover={{ y: -2 }}
                      onClick={() =>
                        void window.auralith.invoke('shell.openPath', { path: d.path })
                      }
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--color-border-hairline)',
                        background: 'rgba(18,18,26,0.72)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'border-color 140ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
                      }}
                    >
                      {/* Kind banner */}
                      <div
                        style={{
                          height: 80,
                          background: `linear-gradient(135deg, ${kindColor}12, ${kindColor}06)`,
                          borderBottom: '1px solid var(--color-border-hairline)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: `${kindColor}18`,
                            border: `1px solid ${kindColor}30`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: kindColor,
                          }}
                        >
                          <DocKindIcon kind={d.kind} />
                        </div>
                        {/* Kind chip */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 8,
                            left: 10,
                            fontSize: 9,
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            letterSpacing: '0.06em',
                            padding: '3px 7px',
                            borderRadius: 6,
                            background: 'rgba(7,7,11,0.65)',
                            backdropFilter: 'blur(8px)',
                            color: kindColor,
                            textTransform: 'uppercase',
                          }}
                        >
                          {d.kind}
                        </div>
                        {/* Size */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 10,
                            fontSize: 9,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          {fmtSize(d.size)}
                        </div>
                      </div>

                      <div style={{ padding: 14 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            marginBottom: 4,
                            lineHeight: 1.35,
                            fontFamily: 'var(--font-sans)',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {d.title}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-text-tertiary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginBottom: 10,
                          }}
                        >
                          {d.path.split(/[\\/]/).pop()}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              color: 'var(--color-text-tertiary)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {fmtAgo(d.mtime)}
                          </span>
                          <ChevronRight
                            size={12}
                            style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
            )
          ) : /* List view */
          docs.length === 0 ? (
            <div style={{ paddingTop: 48 }}>
              <EmptyState
                icon={<BookOpen size={22} />}
                title="No documents indexed"
                description="Create a Space, point it at a folder, and click Reindex to start building your knowledge base."
              />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                borderRadius: 14,
                border: '1px solid var(--color-border-hairline)',
                background: 'rgba(18,18,26,0.72)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                overflow: 'hidden',
              }}
            >
              {docs.map((d, i) => {
                const kindColor = DocKindColor(d.kind)
                return (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.025 }}
                    onClick={() => void window.auralith.invoke('shell.openPath', { path: d.path })}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 1fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '11px 16px',
                      borderBottom:
                        i < docs.length - 1 ? '1px solid var(--color-border-hairline)' : 'none',
                      cursor: 'pointer',
                      transition: 'background 140ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: `${kindColor}14`,
                        border: `1px solid ${kindColor}28`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: kindColor,
                        flexShrink: 0,
                      }}
                    >
                      <DocKindIcon kind={d.kind} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--color-text-primary)',
                          fontFamily: 'var(--font-sans)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {d.title}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-tertiary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {d.path}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          color: kindColor,
                          background: `${kindColor}14`,
                          padding: '2px 6px',
                          borderRadius: 5,
                        }}
                      >
                        {d.kind}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {fmtAgo(d.mtime)}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </div>

        {/* Search result chunk preview panel */}
        <AnimatePresence>
          {selectedResult && (
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              style={{
                width: 300,
                flexShrink: 0,
                overflowY: 'auto',
                borderRadius: 14,
                border: '1px solid var(--color-border-hairline)',
                background: 'rgba(18,18,26,0.8)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                padding: 20,
                alignSelf: 'flex-start',
                maxHeight: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-accent-mid)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Chunk preview
                </span>
                <button
                  onClick={() => setSelectedResult(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-tertiary)',
                    padding: 0,
                  }}
                >
                  <X size={13} />
                </button>
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: 2,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {selectedResult.doc.title}
              </div>
              {selectedResult.citation.headingPath && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                    marginBottom: 12,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {selectedResult.citation.headingPath}
                </div>
              )}

              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid var(--color-border-hairline)',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-sans)',
                  marginBottom: 12,
                }}
              >
                {renderMarkdown(selectedResult.citation.text)}
              </div>

              {selectedResult.citation.page && (
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                    marginBottom: 8,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Page {selectedResult.citation.page}
                </p>
              )}

              <p
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-tertiary)',
                  wordBreak: 'break-all',
                  lineHeight: 1.4,
                }}
              >
                {selectedResult.citation.docPath}
              </p>

              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid var(--color-border-hairline)',
                  display: 'flex',
                  gap: 6,
                }}
              >
                <GhostBtn
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() =>
                    void window.auralith.invoke('shell.openPath', {
                      path: selectedResult.citation.docPath,
                    })
                  }
                >
                  Open file
                </GhostBtn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
