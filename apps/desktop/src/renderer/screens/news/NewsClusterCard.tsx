import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers, ChevronRight } from 'lucide-react'
import { NewsItemCard } from './NewsItemCard'
import type { NewsItemData } from './NewsItemCard'

type Cluster = {
  id: string
  topicId: string
  summary: string
  createdAt: number
  itemCount: number
}

type Props = {
  cluster: Cluster
  isExpanded: boolean
  activeItemId: string | null
  onToggle: () => void
  onSelectItem: (item: NewsItemData) => void
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

export function NewsClusterCard({
  cluster,
  isExpanded,
  activeItemId,
  onToggle,
  onSelectItem,
  onToggleSave,
  onMarkRead,
}: Props): ReactElement {
  const [localItems, setLocalItems] = useState<NewsItemData[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isExpanded || localItems.length > 0) return
    setLoading(true)
    window.auralith
      .invoke('news.listItems', {
        clusterId: cluster.id,
        limit: 30,
        offset: 0,
        unreadOnly: false,
        savedOnly: false,
      })
      .then((res) => {
        if (res.ok) setLocalItems((res.data as { items: NewsItemData[]; total: number }).items)
      })
      .catch((err) => console.error('[NewsClusterCard] items fetch failed:', err))
      .finally(() => setLoading(false))
  }, [isExpanded, cluster.id, localItems.length])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="overflow-hidden"
      style={{
        borderRadius: 14,
        border: `1px solid ${isExpanded ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
        background: isExpanded ? 'rgba(139,92,246,0.06)' : 'rgba(14,14,22,0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        transition: 'border-color 140ms ease, background 140ms ease',
      }}
      onMouseEnter={(e) => {
        if (!isExpanded) e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
      }}
      onMouseLeave={(e) => {
        if (!isExpanded) e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
      }}
    >
      {/* Header button */}
      <button onClick={onToggle} className="w-full p-4 text-left">
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg mt-0.5"
            style={{
              background: isExpanded ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isExpanded ? 'rgba(139,92,246,0.3)' : 'var(--color-border-hairline)'}`,
            }}
          >
            <Layers
              className="h-3.5 w-3.5"
              style={{
                color: isExpanded ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p
              className="text-[13px] font-semibold leading-snug mb-1.5"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {cluster.summary}
            </p>
            <div
              className="flex items-center gap-2 text-[11px]"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--color-border-hairline)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {cluster.itemCount}
              </span>
              <span>articles</span>
              <span>·</span>
              <span>{timeAgo(cluster.createdAt)}</span>
            </div>
          </div>

          <ChevronRight
            className="h-4 w-4 shrink-0 transition-transform duration-200 mt-2"
            style={{
              color: 'var(--color-text-tertiary)',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          />
        </div>
      </button>

      {/* Expanded items */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div
              className="p-3 pt-0 space-y-1.5"
              style={{ borderTop: '1px solid var(--color-border-hairline)' }}
            >
              {loading && (
                <div className="py-4 flex items-center justify-center">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                    style={{
                      borderColor: 'var(--color-accent-mid)',
                      borderTopColor: 'transparent',
                    }}
                  />
                </div>
              )}
              {!loading &&
                localItems.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      outline:
                        activeItemId === item.id ? '1px solid var(--color-border-accent)' : 'none',
                      borderRadius: 10,
                    }}
                  >
                    <NewsItemCard
                      item={item}
                      variant={index === 0 ? 'featured' : 'compact'}
                      onSelect={onSelectItem}
                      onToggleSave={onToggleSave}
                      onMarkRead={onMarkRead}
                    />
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
