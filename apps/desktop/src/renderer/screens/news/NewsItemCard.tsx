import { useState } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { Bookmark, BookmarkCheck, Clock, Play, Radio } from 'lucide-react'
import { Surface } from '@auralith/design-system'

export type NewsItemData = {
  id: string
  feedId: string
  sourceName?: string
  title: string
  url: string
  publishedAt?: number
  rawText?: string
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
  fullContent?: string
  fullContentFetchedAt?: number
}

type NewsItemCardProps = {
  item: NewsItemData
  variant?: 'featured' | 'standard' | 'compact'
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

/** Deterministic hue from source name — keeps each source consistently colored */
function sourceHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return 180 + (Math.abs(hash) % 120)
}

function SourceBadge({ name, overlay = false }: { name: string; overlay?: boolean }): ReactElement {
  const hue = sourceHue(name)
  if (overlay) {
    return (
      <div
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          color: `hsl(${hue}, 60%, 78%)`,
          border: `1px solid hsl(${hue}, 40%, 30%)`,
        }}
      >
        <Radio size={8} className="opacity-70 shrink-0" />
        <span className="truncate max-w-[120px]">{name}</span>
      </div>
    )
  }
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
      style={{
        background: `hsla(${hue}, 40%, 15%, 0.7)`,
        border: `1px solid hsl(${hue}, 35%, 28%)`,
        color: `hsl(${hue}, 60%, 72%)`,
      }}
    >
      <Radio size={8} className="shrink-0" />
      <span className="truncate max-w-[100px]">{name}</span>
    </span>
  )
}

function UnreadDot(): ReactElement {
  return (
    <motion.div
      className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full pointer-events-none"
      style={{ background: 'var(--color-accent-mid)' }}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

function HeroImage({
  src,
  hasVideo,
  aspectClass,
  isRead,
}: {
  src: string
  hasVideo: boolean
  aspectClass: string
  isRead: boolean
}): ReactElement {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) return <></>

  return (
    <div className={`relative w-full ${aspectClass} overflow-hidden bg-white/5`}>
      {/* Skeleton shimmer */}
      {!loaded && (
        <div
          className="absolute inset-0 shimmer-bg"
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
        className="w-full h-full object-cover transition-all duration-300 group-hover:scale-[1.02]"
        style={{
          opacity: loaded ? 1 : 0,
          filter: isRead ? 'saturate(0.25)' : 'none',
          transition: 'opacity 0.3s ease, filter 0.3s ease, transform 0.3s ease',
        }}
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />
      {hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          >
            <Play size={14} className="text-white ml-0.5" fill="white" />
          </div>
        </div>
      )}
    </div>
  )
}

function MetaRow({
  item,
  compact = false,
  onToggleSave,
}: {
  item: NewsItemData
  compact?: boolean
  onToggleSave: (item: NewsItemData) => void
}): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div
        className="flex items-center gap-1.5 text-[10px] min-w-0"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {item.author && !compact && <span className="truncate max-w-[90px]">{item.author}</span>}
        {item.author && !compact && (item.publishedAt || item.readingTimeMin) && <span>·</span>}
        {item.publishedAt && <span>{timeAgo(item.publishedAt)}</span>}
        {item.readingTimeMin && (
          <>
            <span>·</span>
            <span className="flex items-center gap-0.5 shrink-0">
              <Clock size={9} />
              {item.readingTimeMin}m
            </span>
          </>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleSave(item)
        }}
        className="p-1 rounded shrink-0 text-text-tertiary hover:text-accent-mid hover:bg-accent-low/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-low"
        aria-label={item.saved ? 'Unsave' : 'Save'}
      >
        {item.saved ? (
          <BookmarkCheck size={12} className="text-accent-mid" />
        ) : (
          <Bookmark size={12} />
        )}
      </button>
    </div>
  )
}

export function NewsItemCard({
  item,
  variant = 'standard',
  onSelect,
  onToggleSave,
  onMarkRead,
}: NewsItemCardProps): ReactElement {
  const hasImage = !!item.imageUrl
  const isRead = !!item.readAt

  function handleClick() {
    onSelect(item)
    onMarkRead(item)
  }

  if (variant === 'compact') {
    return (
      <motion.div
        whileHover={{
          scale: 1.005,
          boxShadow: '0 0 0 1px rgba(139,92,246,0.25), 0 2px 12px rgba(139,92,246,0.08)',
        }}
        whileTap={{ scale: 0.998 }}
        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
        onClick={handleClick}
        className="cursor-pointer relative"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Surface
          variant="card"
          className={`overflow-hidden group transition-all duration-150 hover:border-white/[0.12] ${isRead ? 'opacity-70' : ''}`}
        >
          <div className="flex gap-2.5 p-2.5 items-start">
            {hasImage && (
              <div className="shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-white/5">
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ filter: isRead ? 'saturate(0.25)' : 'none' }}
                  loading="lazy"
                />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              {item.sourceName && <SourceBadge name={item.sourceName} />}
              <p
                className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors"
                style={{
                  color: isRead ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                }}
              >
                {item.title}
              </p>
              <MetaRow item={item} compact onToggleSave={onToggleSave} />
            </div>
          </div>
        </Surface>
        {!isRead && <UnreadDot />}
      </motion.div>
    )
  }

  if (variant === 'featured') {
    return (
      <motion.div
        whileHover={{
          scale: 1.008,
          boxShadow: '0 0 0 1px rgba(139,92,246,0.32), 0 6px 28px rgba(139,92,246,0.12)',
        }}
        whileTap={{ scale: 0.998 }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        onClick={handleClick}
        className="cursor-pointer relative"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Surface
          variant="card"
          className={`overflow-hidden group transition-all duration-150 hover:border-white/[0.15] ${isRead ? 'opacity-75' : ''}`}
        >
          {hasImage ? (
            <>
              <div className="relative">
                <HeroImage
                  src={item.imageUrl ?? ''}
                  hasVideo={!!item.videoUrl}
                  aspectClass="aspect-[16/6]"
                  isRead={isRead}
                />
                {item.sourceName && (
                  <div className="absolute bottom-2 left-2">
                    <SourceBadge name={item.sourceName} overlay />
                  </div>
                )}
              </div>
              <div className="p-4 space-y-2">
                {item.categories && item.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.categories.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
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
                <p
                  className="text-base font-semibold leading-snug line-clamp-2 group-hover:text-white transition-colors"
                  style={{
                    color: isRead ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                  }}
                >
                  {item.title}
                </p>
                {item.summary && (
                  <p
                    className="text-xs leading-relaxed line-clamp-2"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {item.summary}
                  </p>
                )}
                <MetaRow item={item} onToggleSave={onToggleSave} />
              </div>
            </>
          ) : (
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {item.sourceName && <SourceBadge name={item.sourceName} />}
                {item.categories?.slice(0, 2).map((cat) => (
                  <span
                    key={cat}
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
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
              <p
                className="text-base font-semibold leading-snug line-clamp-2 group-hover:text-white transition-colors"
                style={{
                  color: isRead ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                }}
              >
                {item.title}
              </p>
              {item.summary && (
                <p
                  className="text-xs leading-relaxed line-clamp-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {item.summary}
                </p>
              )}
              <MetaRow item={item} onToggleSave={onToggleSave} />
            </div>
          )}
        </Surface>
        {!isRead && <UnreadDot />}
      </motion.div>
    )
  }

  // standard variant
  return (
    <motion.div
      whileHover={{
        scale: 1.01,
        boxShadow: '0 0 0 1px rgba(139,92,246,0.28), 0 4px 20px rgba(139,92,246,0.09)',
      }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      onClick={handleClick}
      className="cursor-pointer relative"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Surface
        variant="card"
        className={`overflow-hidden group transition-all duration-150 hover:border-white/[0.15] ${isRead ? 'opacity-75' : ''}`}
      >
        {hasImage && (
          <div className="relative">
            <HeroImage
              src={item.imageUrl ?? ''}
              hasVideo={!!item.videoUrl}
              aspectClass="aspect-[16/7]"
              isRead={isRead}
            />
            {item.sourceName && (
              <div className="absolute bottom-2 left-2">
                <SourceBadge name={item.sourceName} overlay />
              </div>
            )}
          </div>
        )}

        <div className="p-3 space-y-2">
          {!hasImage && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {item.sourceName && <SourceBadge name={item.sourceName} />}
              {item.categories?.slice(0, 2).map((cat) => (
                <span
                  key={cat}
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
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

          <p
            className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors"
            style={{ color: isRead ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}
          >
            {item.title}
          </p>

          {item.summary && (
            <p
              className="text-xs leading-relaxed line-clamp-3"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {item.summary}
            </p>
          )}

          <MetaRow item={item} onToggleSave={onToggleSave} />
        </div>
      </Surface>
      {!isRead && <UnreadDot />}
    </motion.div>
  )
}
