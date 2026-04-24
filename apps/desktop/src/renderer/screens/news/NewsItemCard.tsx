import { useState } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { Bookmark, BookmarkCheck, Clock, ExternalLink } from 'lucide-react'
import { Surface } from '@auralith/design-system'

export type NewsItemData = {
  id: string
  feedId: string
  title: string
  url: string
  publishedAt?: number
  summary?: string
  analysis?: string
  clusterId?: string
  fetchedAt: number
  readAt?: number
  saved: boolean
  imageUrl?: string
  videoUrl?: string
  mediaType?: string
  author?: string
  categories?: string[]
  readingTimeMin?: number
}

type NewsItemCardProps = {
  item: NewsItemData
  onSelect: (item: NewsItemData) => void
  onToggleSave: (item: NewsItemData) => void
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

export function NewsItemCard({
  item,
  onSelect,
  onToggleSave,
  onMarkRead,
}: NewsItemCardProps): ReactElement {
  const [imgError, setImgError] = useState(false)
  const hasImage = item.imageUrl && !imgError

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => {
        onSelect(item)
        onMarkRead(item)
      }}
      className="cursor-pointer"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Surface
        variant="card"
        className={`overflow-hidden group transition-all duration-150 hover:border-white/[0.15] ${item.readAt ? 'opacity-60' : ''}`}
      >
        {/* Hero image */}
        {hasImage && (
          <div className="relative w-full aspect-[16/7] overflow-hidden bg-white/5">
            <img
              src={item.imageUrl}
              alt=""
              onError={() => setImgError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
            {/* Gradient overlay for legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          </div>
        )}

        {/* Content */}
        <div className="p-3 space-y-2">
          {/* Categories */}
          {item.categories && item.categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.categories.slice(0, 2).map((cat) => (
                <span
                  key={cat}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-low/15 text-accent-mid border border-accent-low/20"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <p className="text-sm font-medium text-text-primary leading-snug line-clamp-2 group-hover:text-white transition-colors">
            {item.title}
          </p>

          {/* Summary */}
          {item.summary && (
            <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
              {item.summary}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
              {item.author && <span className="truncate max-w-[100px]">{item.author}</span>}
              {item.author && (item.publishedAt || item.readingTimeMin) && <span>·</span>}
              {item.publishedAt && <span>{timeAgo(item.publishedAt)}</span>}
              {item.readingTimeMin && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <Clock size={10} />
                    {item.readingTimeMin}m
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSave(item)
                }}
                className="p-1 rounded text-text-tertiary hover:text-accent-mid hover:bg-accent-low/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-low"
                aria-label={item.saved ? 'Unsave' : 'Save'}
              >
                {item.saved ? (
                  <BookmarkCheck size={13} className="text-accent-mid" />
                ) : (
                  <Bookmark size={13} />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  window.auralith.invoke('system.openPath', { path: item.url }).catch(() => {})
                  window.open(item.url, '_blank')
                }}
                className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-low"
                aria-label="Open in browser"
              >
                <ExternalLink size={13} />
              </button>
            </div>
          </div>
        </div>
      </Surface>
    </motion.div>
  )
}
