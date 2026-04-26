import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import type { NavSection } from './NavRail'

const PANEL_TITLES: Record<NavSection, string> = {
  home: 'At a glance',
  assistant: 'Thread context',
  knowledge: 'Space details',
  news: 'Story context',
  weather: 'Weather details',
  automations: 'Automations',
  activity: 'Activity context',
  settings: 'Settings',
}

function PlaceholderPanel({ route }: { route: NavSection }): ReactElement {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          minHeight: 56,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {PANEL_TITLES[route]}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.6,
          }}
        >
          Context for this screen
          <br />
          appears here.
        </div>
      </div>
    </>
  )
}

// ── Main ContextPanel ─────────────────────────────────────────────────────────

const PANEL_WIDTH = 320

type ContextPanelProps = {
  route: NavSection
  open: boolean
  onToggle: () => void
}

export function ContextPanel({ route, open, onToggle }: ContextPanelProps): ReactElement {
  return (
    <motion.aside
      animate={{ width: open ? PANEL_WIDTH : 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      style={{
        position: 'relative',
        borderLeft: open ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        background: 'rgba(18,18,26,0.62)',
        backdropFilter: 'blur(28px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'border-color 220ms',
      }}
    >
      {/* Toggle button — floats on the left edge */}
      <button
        onClick={onToggle}
        aria-label={open ? 'Close context panel' : 'Open context panel'}
        style={{
          position: 'absolute',
          top: 18,
          left: -14,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(20,20,30,0.96)',
          backdropFilter: 'blur(16px)',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          zIndex: 2,
          transition: 'color 120ms, transform 120ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-text-primary)'
          e.currentTarget.style.transform = 'scale(1.08)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--color-text-secondary)'
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        {open ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Panel content — only render when open to avoid overflow flash */}
      <AnimatePresence mode="wait">
        {open && (
          <motion.div
            key={route}
            className="flex flex-col h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ minWidth: PANEL_WIDTH }}
          >
            <PlaceholderPanel route={route} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}
