import { useState, useRef, useCallback } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Clock,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react'
import type { NewsItemData } from './NewsItemCard'

type Props = {
  item: NewsItemData
  onClose: () => void
  onToggleSave: (item: NewsItemData) => Promise<void>
  onPatchItem: (id: string, patch: Partial<NewsItemData>) => void
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

function sanitizeContent(html: string): string {
  // Strip all tags except a safe structural allowlist; attributes are dropped entirely
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/\shref\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, '')
}

export function NewsArticleReader({
  item,
  onClose,
  onToggleSave,
  onPatchItem,
}: Props): ReactElement {
  const [readPct, setReadPct] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [fetchingContent, setFetchingContent] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const pct = el.scrollTop / (el.scrollHeight - el.clientHeight)
    setReadPct(Math.min(1, isNaN(pct) ? 0 : pct))
  }, [])

  async function handleFetchFullContent() {
    setFetchingContent(true)
    try {
      const res = await window.auralith.invoke('news.fetchItemFullContent', { itemId: item.id })
      if (res.ok) {
        const { fullContent } = res.data as { fetched: boolean; fullContent: string | null }
        if (fullContent) {
          onPatchItem(item.id, { fullContent, fullContentFetchedAt: Date.now() })
        }
      }
    } finally {
      setFetchingContent(false)
    }
  }

  const isYoutube = item.videoUrl ? /youtu\.?be/.test(item.videoUrl) : false
  const embedUrl =
    isYoutube && item.videoUrl
      ? item.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')
      : null

  return (
    <motion.aside
      key={item.id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.22, ease: [0, 0, 0.2, 1] }}
      className="relative flex flex-col overflow-hidden shrink-0"
      style={{
        width: expanded ? '100%' : 520,
        borderLeft: '1px solid var(--color-border-hairline)',
        background: 'rgba(10,10,16,0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        transition: 'width 0.22s ease',
      }}
    >
      {/* Reading progress bar */}
      <div
        className="absolute top-0 left-0 h-[2px] z-10 pointer-events-none"
        style={{
          width: `${readPct * 100}%`,
          background: 'linear-gradient(90deg, var(--color-accent-low), var(--color-accent-mid))',
          transition: 'width 0.1s linear',
        }}
      />

      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between gap-2 px-5 py-3"
        style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {item.sourceName && (
            <span
              className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(139,92,246,0.12)',
                border: '1px solid rgba(139,92,246,0.25)',
                color: 'var(--color-accent-mid)',
              }}
            >
              {item.sourceName}
            </span>
          )}
          {item.publishedAt && (
            <span className="text-[11px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
              {new Date(item.publishedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
          {item.readingTimeMin && (
            <span
              className="flex items-center gap-0.5 text-[11px] shrink-0"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <Clock className="h-3 w-3" />
              {item.readingTimeMin}m
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--color-text-tertiary)' }}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => void onToggleSave(item)}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/[0.06]"
            style={{ color: item.saved ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)' }}
            title={item.saved ? 'Unsave' : 'Save'}
          >
            {item.saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--color-text-tertiary)' }}
            title="Open in browser"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--color-text-tertiary)' }}
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {/* Media */}
        {item.videoUrl ? (
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
                src={item.videoUrl}
                controls
                className="w-full h-full object-contain"
                preload="metadata"
              />
            )}
          </div>
        ) : item.imageUrl ? (
          <div className="relative w-full overflow-hidden" style={{ maxHeight: 240 }}>
            <img src={item.imageUrl} alt="" className="w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,10,16,0.8)] to-transparent pointer-events-none" />
          </div>
        ) : null}

        <div className="px-6 pt-5 pb-10 space-y-5">
          {/* Title */}
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              color: 'var(--color-text-primary)',
            }}
          >
            {item.title}
          </h2>

          {/* Author + categories */}
          {(item.author || (item.categories && item.categories.length > 0)) && (
            <div className="space-y-2">
              {item.author && (
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  By {item.author}
                </p>
              )}
              {item.categories && item.categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.categories.map((cat) => (
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
            </div>
          )}

          {/* AI Summary */}
          {item.summary ? (
            <div
              className="rounded-xl p-4 space-y-2"
              style={{
                background: 'rgba(139,92,246,0.06)',
                border: '1px solid rgba(139,92,246,0.18)',
              }}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-accent-mid)' }}
              >
                AI Summary
              </p>
              <div
                className="text-[13px] leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(item.summary) }}
              />
            </div>
          ) : (
            <p className="text-xs italic" style={{ color: 'var(--color-text-tertiary)' }}>
              No summary — Ollama may be offline.
            </p>
          )}

          {/* AI Analysis */}
          {item.analysis && (
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
                className="text-[13px] leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(item.analysis) }}
              />
            </div>
          )}

          {/* Article content */}
          {item.fullContent ? (
            <div className="space-y-2">
              <div style={{ borderTop: '1px solid var(--color-border-hairline)', paddingTop: 16 }}>
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider mb-3"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  Full Article
                </p>
              </div>
              <div
                className="article-body"
                dangerouslySetInnerHTML={{ __html: sanitizeContent(item.fullContent) }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {item.rawText && (
                <div className="space-y-2">
                  <div
                    style={{ borderTop: '1px solid var(--color-border-hairline)', paddingTop: 16 }}
                  >
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider mb-3"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      RSS Excerpt
                    </p>
                  </div>
                  <div
                    style={{ color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.75 }}
                  >
                    {item.rawText}
                  </div>
                </div>
              )}
              {!item.fullContentFetchedAt && (
                <button
                  onClick={() => void handleFetchFullContent()}
                  disabled={fetchingContent}
                  className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(139,92,246,0.08)',
                    border: '1px solid rgba(139,92,246,0.2)',
                    color: 'var(--color-accent-mid)',
                  }}
                  onMouseEnter={(e) => {
                    if (!fetchingContent) e.currentTarget.style.background = 'rgba(139,92,246,0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(139,92,246,0.08)'
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${fetchingContent ? 'animate-spin' : ''}`} />
                  {fetchingContent ? 'Fetching…' : 'Fetch full article'}
                </button>
              )}
              {item.fullContentFetchedAt && !item.fullContent && (
                <p className="text-xs italic" style={{ color: 'var(--color-text-tertiary)' }}>
                  Full article unavailable for this source.
                </p>
              )}
            </div>
          )}

          {/* Open in browser */}
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 w-full justify-center rounded-xl py-2.5 text-xs font-medium transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in browser
          </a>
        </div>
      </div>
    </motion.aside>
  )
}
