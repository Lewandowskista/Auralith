import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { Newspaper, RefreshCw } from 'lucide-react'
import { staggerListVariants, staggerItemVariants } from '@auralith/design-system'
import { NewsHeroCard } from './NewsHeroCard'
import { NewsClusterCard } from './NewsClusterCard'
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
  clusters: Cluster[]
  heroItem: NewsItemData | null
  rawItems: NewsItemData[]
  activeItemId: string | null
  expandedClusterIds: Set<string>
  fetching: boolean
  onToggleCluster: (id: string) => void
  onSelectItem: (item: NewsItemData) => void
  onToggleSave: (item: NewsItemData) => Promise<void>
  onMarkRead: (item: NewsItemData) => void
  onTriggerFetch: () => void
}

function HeroSkeleton(): ReactElement {
  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: 20,
        border: '1px solid var(--color-border-hairline)',
        background: 'rgba(14,14,22,0.8)',
        height: 340,
      }}
    >
      <div
        style={{
          height: 220,
          background:
            'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s ease infinite',
        }}
      />
      <div className="p-6 space-y-3">
        <div
          className="h-3 w-24 rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)', animation: 'shimmer 1.4s ease infinite' }}
        />
        <div
          className="h-6 w-3/4 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.05)', animation: 'shimmer 1.4s ease infinite' }}
        />
        <div
          className="h-4 w-full rounded"
          style={{ background: 'rgba(255,255,255,0.04)', animation: 'shimmer 1.4s ease infinite' }}
        />
      </div>
    </div>
  )
}

export function NewsFeed({
  clusters,
  heroItem,
  rawItems,
  activeItemId,
  expandedClusterIds,
  fetching,
  onToggleCluster,
  onSelectItem,
  onToggleSave,
  onMarkRead,
  onTriggerFetch,
}: Props): ReactElement {
  const heroCluster = clusters[0] ?? null
  const restClusters = clusters.slice(1)

  // Empty state
  if (clusters.length === 0 && rawItems.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 py-24">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--color-border-hairline)',
            }}
          >
            <Newspaper className="h-7 w-7" style={{ color: 'var(--color-text-tertiary)' }} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              No stories yet
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Refresh feeds to load your news.
            </p>
          </div>
          <button
            onClick={onTriggerFetch}
            disabled={fetching}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => {
              if (!fetching) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Fetching…' : 'Fetch now'}
          </button>
        </div>
      </div>
    )
  }

  // Raw items (pipeline hasn't clustered yet)
  if (clusters.length === 0 && rawItems.length > 0) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <motion.div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
          variants={staggerListVariants}
          initial="hidden"
          animate="visible"
        >
          {rawItems.map((item) => (
            <motion.div key={item.id} variants={staggerItemVariants}>
              <NewsItemCard
                item={item}
                variant="standard"
                onSelect={(i) => onSelectItem(i)}
                onToggleSave={onToggleSave}
                onMarkRead={onMarkRead}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    )
  }

  // Clustered magazine view
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {/* Hero card */}
      {heroCluster &&
        (heroItem ? (
          <NewsHeroCard
            item={heroItem}
            cluster={heroCluster}
            isSelected={activeItemId === heroItem.id}
            onSelect={onSelectItem}
            onToggleSave={onToggleSave}
            onMarkRead={onMarkRead}
          />
        ) : (
          <HeroSkeleton />
        ))}

      {/* Cluster grid */}
      {restClusters.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-baseline gap-3">
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
              }}
            >
              More
            </span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
              }}
            >
              Clusters today
            </span>
            <span
              className="ml-auto text-[11px]"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}
            >
              {restClusters.length} cluster{restClusters.length !== 1 ? 's' : ''}
            </span>
          </div>

          <motion.div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 14,
            }}
            variants={staggerListVariants}
            initial="hidden"
            animate="visible"
          >
            {restClusters.map((c) => (
              <motion.div key={c.id} variants={staggerItemVariants}>
                <NewsClusterCard
                  cluster={c}
                  isExpanded={expandedClusterIds.has(c.id)}
                  activeItemId={activeItemId}
                  onToggle={() => onToggleCluster(c.id)}
                  onSelectItem={onSelectItem}
                  onToggleSave={onToggleSave}
                  onMarkRead={onMarkRead}
                />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  )
}
