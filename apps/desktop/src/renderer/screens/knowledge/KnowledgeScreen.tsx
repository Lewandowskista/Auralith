import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { Search, RefreshCw, FileText, Plus, Trash2, FolderOpen, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { OllamaBanner } from '../../components/OllamaBanner'
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

export function KnowledgeScreen(): ReactElement {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [query, setQuery] = useState('')
  const [creatingSpace, setCreatingSpace] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const ollamaStatus = useOllamaStatus()

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
      return
    }
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

  return (
    <div data-testid="brain-screen" className="flex h-full">
      {/* Left: Spaces + doc list */}
      <aside
        className="w-56 shrink-0 flex flex-col border-r"
        style={{
          borderColor: 'var(--color-border-hairline)',
          background: 'rgba(14,14,20,0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            Spaces
          </span>
          <button
            data-testid="space-create-btn"
            onClick={() => setCreatingSpace(true)}
            className="rounded-lg p-1 text-[#6F6F80] hover:bg-white/5 hover:text-[#A6A6B3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="New space"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {creatingSpace && (
          <div className="px-2 pt-1 pb-0 flex gap-1">
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
              className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-[#F4F4F8] placeholder-[#4A4A5A] outline-none focus:border-violet-500/50"
            />
            <button
              data-testid="space-save-btn"
              onClick={() => void handleCreateSpace()}
              disabled={!newSpaceName.trim()}
              className="px-2 py-1 rounded-md text-xs bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </div>
        )}
        <nav data-testid="spaces-list" className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <button
            onClick={() => setActiveSpaceId(null)}
            className={[
              'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
              activeSpaceId === null
                ? 'bg-violet-500/15 text-violet-300'
                : 'text-[#A6A6B3] hover:bg-white/5 hover:text-[#F4F4F8]',
            ].join(' ')}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" /> All spaces
          </button>
          {spaces.map((s) => (
            <div key={s.id} data-testid="space-row" className="group flex items-center">
              <button
                onClick={() => setActiveSpaceId(s.id)}
                className={[
                  'flex flex-1 min-w-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                  activeSpaceId === s.id
                    ? 'bg-violet-500/15 text-violet-300'
                    : 'text-[#A6A6B3] hover:bg-white/5 hover:text-[#F4F4F8]',
                ].join(' ')}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{s.name}</span>
              </button>
              <button
                onClick={() => void handleDeleteSpace(s.id)}
                className="mr-1 hidden rounded p-0.5 text-[#6F6F80] hover:text-red-400 group-hover:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                aria-label={`Delete ${s.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </nav>
        {/* Doc count */}
        <div className="border-t border-white/[0.06] px-4 py-2 text-xs text-[#6F6F80]">
          {docs.length} document{docs.length !== 1 ? 's' : ''}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {ollamaStatus === 'offline' && <OllamaBanner />}

        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 focus-within:border-violet-500/40 focus-within:ring-1 focus-within:ring-violet-500/20 transition">
            <Search
              className={[
                'h-4 w-4 shrink-0',
                searching ? 'animate-pulse text-violet-400' : 'text-[#6F6F80]',
              ].join(' ')}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search knowledge…"
              className="flex-1 bg-transparent text-sm text-[#F4F4F8] placeholder-[#6F6F80] outline-none"
              aria-label="Search knowledge"
            />
            {ollamaStatus === 'offline' && (
              <span className="text-[10px] text-amber-400">FTS only</span>
            )}
          </div>
          <button
            onClick={() => void handleReindex()}
            disabled={reindexing}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#A6A6B3] hover:bg-white/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <RefreshCw className={['h-3.5 w-3.5', reindexing ? 'animate-spin' : ''].join(' ')} />
            Reindex
          </button>
        </div>

        {/* Results or doc list */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            {query.trim() ? (
              results.length === 0 && !searching ? (
                <p className="py-12 text-center text-sm text-[#6F6F80]">No results found.</p>
              ) : (
                <div className="space-y-2">
                  {results.map((r) => (
                    <button
                      key={r.citation.chunkId}
                      onClick={() => setSelectedResult(r)}
                      className={[
                        'w-full rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                        selectedResult?.citation.chunkId === r.citation.chunkId
                          ? 'border-violet-500/40 bg-violet-500/10'
                          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-[#F4F4F8]">{r.doc.title}</p>
                        <span className="shrink-0 text-[10px] font-mono text-[#6F6F80]">
                          {(r.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      {r.citation.headingPath && (
                        <p className="text-xs text-[#6F6F80]">{r.citation.headingPath}</p>
                      )}
                      <p className="mt-1.5 line-clamp-2 text-xs text-[#A6A6B3]">
                        {r.citation.text}
                      </p>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-1">
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.03] transition"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-[#6F6F80]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#F4F4F8]">{d.title}</p>
                      <p className="truncate font-mono text-[10px] text-[#6F6F80]">{d.path}</p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase text-[#6F6F80]">{d.kind}</span>
                  </div>
                ))}
                {docs.length === 0 && (
                  <EmptyState
                    icon={<BookOpen size={22} />}
                    title="No documents indexed"
                    description="Create a Space, point it at a folder, and click Reindex to start building your knowledge base."
                  />
                )}
              </div>
            )}
          </div>

          {/* Chunk preview panel */}
          {selectedResult && (
            <div className="w-80 shrink-0 overflow-y-auto border-l border-white/[0.06] p-5">
              <p className="mb-1 text-xs font-semibold text-violet-400">Chunk preview</p>
              <p className="mb-0.5 text-sm font-medium text-[#F4F4F8]">
                {selectedResult.doc.title}
              </p>
              {selectedResult.citation.headingPath && (
                <p className="mb-3 text-xs text-[#6F6F80]">{selectedResult.citation.headingPath}</p>
              )}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-xs leading-relaxed text-[#A6A6B3]">
                {selectedResult.citation.text}
              </div>
              {selectedResult.citation.page && (
                <p className="mt-2 text-xs text-[#6F6F80]">Page {selectedResult.citation.page}</p>
              )}
              <p className="mt-3 break-all font-mono text-[10px] text-[#6F6F80]">
                {selectedResult.citation.docPath}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
