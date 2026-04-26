import { useState } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { Bookmark, BookmarkCheck, ChevronRight, Clock } from 'lucide-react'
import type { NewsItemData } from './NewsItemCard'
import { SourceBadge } from './NewsItemCard'

type Cluster = {
  id: string
  topicId: string
  summary: string
  createdAt: number
  itemCount: number
}

type Props = {
  item: NewsItemData
  cluster: Cluster
  isSelected: boolean
  onSelect: (item: NewsItemData) => void
  onToggleSave: (item: NewsItemData) => Promise<void>
  onMarkRead: (item: NewsItemData) => void
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function HeroCoverImage({ src, isRead }: { src: string; isRead: boolean }): ReactElement {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) return <></>

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 220 }}>
      {!loaded && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s ease infinite',
          }}
        />
      )}
      <img
        src={src}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className="w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.02]"
        style={{
          opacity: loaded ? 1 : 0,
          filter: isRead ? 'saturate(0.3)' : 'none',
        }}
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,10,16,0.9)] via-[rgba(10,10,16,0.2)] to-transparent pointer-events-none" />
    </div>
  )
}

export function NewsHeroCard({
  item,
  cluster,
  isSelected,
  onSelect,
  onToggleSave,
  onMarkRead,
}: Props): ReactElement {
  const isRead = !!item.readAt

  function handleClick() {
    onSelect(item)
    onMarkRead(item)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      onClick={handleClick}
      className="group cursor-pointer relative overflow-hidden"
      style={{
        borderRadius: 20,
        border: `1px solid ${isSelected ? 'var(--color-border-accent)' : 'var(--color-border-subtle)'}`,
        background: isSelected ? 'rgba(139,92,246,0.06)' : 'rgba(14,14,22,0.80)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: isSelected
          ? '0 0 0 1px rgba(139,92,246,0.3), 0 8px 40px rgba(139,92,246,0.12)'
          : '0 4px 24px rgba(0,0,0,0.3)',
        transition: 'all 180ms ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-strong)'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
      }}
    >
      {/* Cover image */}
      {item.imageUrl && (
        <div className="relative">
          <HeroCoverImage src={item.imageUrl} isRead={isRead} />
          {item.sourceName && (
            <div className="absolute bottom-3 left-4">
              <SourceBadge name={item.sourceName} overlay />
            </div>
          )}
          {/* Cluster count chip */}
          <div
            className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
            style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {cluster.itemCount} article{cluster.itemCount !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="p-6 space-y-3">
        {/* "TOP STORY" badge */}
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: 'rgba(139,92,246,0.14)',
              border: '1px solid rgba(139,92,246,0.28)',
              color: 'var(--color-accent-mid)',
            }}
          >
            <motion.span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: 'var(--color-accent-mid)',
                boxShadow: '0 0 6px rgba(139,92,246,0.8)',
              }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            Top story
          </span>
          {!item.imageUrl && item.sourceName && <SourceBadge name={item.sourceName} />}
          <span
            className="ml-auto text-[10px]"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}
          >
            {item.publishedAt ? timeAgo(item.publishedAt) : timeAgo(cluster.createdAt)}
          </span>
        </div>

        {/* Title */}
        <h2
          className="leading-snug line-clamp-3 group-hover:text-white transition-colors duration-150"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: isRead ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
          }}
        >
          {item.title}
        </h2>

        {/* Summary */}
        {item.summary && (
          <p
            className="text-[13px] leading-relaxed line-clamp-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {item.summary}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 pt-1">
          {item.author && (
            <span
              className="text-[11px] truncate max-w-[160px]"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {item.author}
            </span>
          )}
          {item.readingTimeMin && (
            <span
              className="flex items-center gap-1 text-[11px] shrink-0"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <Clock className="h-3 w-3" />
              {item.readingTimeMin}m read
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                void onToggleSave(item)
              }}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/[0.07]"
              style={{
                color: item.saved ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
              }}
              title={item.saved ? 'Unsave' : 'Save'}
            >
              {item.saved ? (
                <BookmarkCheck className="h-4 w-4" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
            </button>
            <div
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium"
              style={{
                background: 'var(--color-accent-gradient)',
                color: 'white',
                boxShadow: '0 2px 10px rgba(139,92,246,0.3)',
              }}
            >
              Read
              <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
