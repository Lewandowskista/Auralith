import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { Calendar, X } from 'lucide-react'

export type EventPrepPayload = {
  type: 'event-prep'
  eventTitle: string
  startAt: number
  location?: string
}

type Props = {
  payload: EventPrepPayload
  onDismiss: () => void
}

function minutesUntil(startAt: number): number {
  return Math.max(0, Math.round((startAt - Date.now()) / 60_000))
}

export function EventPrepCard({ payload, onDismiss }: Props): ReactElement {
  const mins = minutesUntil(payload.startAt)
  const timeLabel = mins <= 1 ? 'starting now' : `in ${mins} min`

  return (
    <motion.div
      data-testid="event-prep-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mx-6 mb-4 p-5"
      style={{
        borderRadius: 16,
        background: 'rgba(14,14,20,0.80)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft: '3px solid rgba(139,92,246,0.6)',
      }}
    >
      <div className="flex items-start gap-3">
        <Calendar
          size={15}
          className="shrink-0 mt-0.5"
          style={{ color: 'var(--color-accent-mid)' }}
        />
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-medium uppercase tracking-wider mb-1"
            style={{ color: 'var(--color-accent-mid)' }}
          >
            Upcoming event
          </p>
          <p
            className="text-sm font-medium leading-snug truncate"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {payload.eventTitle}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {timeLabel}
            {payload.location && ` · ${payload.location}`}
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss event prep"
          className="p-1 rounded transition-colors shrink-0"
          style={{
            color: 'var(--color-text-tertiary)',
            background: 'none',
            border: 'none',
            cursor: 'default',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-tertiary)'
          }}
        >
          <X size={13} />
        </button>
      </div>
    </motion.div>
  )
}
