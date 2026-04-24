import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import {
  Home,
  MessageSquare,
  Activity,
  BookOpen,
  Newspaper,
  CloudSun,
  Settings,
  Zap,
} from 'lucide-react'
import { cn } from '@auralith/design-system'
import { motionDuration, motionEasing } from '@auralith/design-system'

export type NavSection =
  | 'home'
  | 'assistant'
  | 'activity'
  | 'knowledge'
  | 'news'
  | 'weather'
  | 'automations'
  | 'settings'

type NavItem = {
  id: NavSection
  label: string
  icon: ReactElement
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: <Home size={18} strokeWidth={1.75} /> },
  { id: 'assistant', label: 'Assistant', icon: <MessageSquare size={18} strokeWidth={1.75} /> },
  { id: 'activity', label: 'Activity', icon: <Activity size={18} strokeWidth={1.75} /> },
  { id: 'knowledge', label: 'Knowledge', icon: <BookOpen size={18} strokeWidth={1.75} /> },
  { id: 'news', label: 'News', icon: <Newspaper size={18} strokeWidth={1.75} /> },
  { id: 'weather', label: 'Weather', icon: <CloudSun size={18} strokeWidth={1.75} /> },
  { id: 'automations', label: 'Automations', icon: <Zap size={18} strokeWidth={1.75} /> },
]

type NavRailProps = {
  active: NavSection
  onNavigate: (section: NavSection) => void
}

export function NavRail({ active, onNavigate }: NavRailProps): ReactElement {
  return (
    <nav
      data-testid="nav-rail"
      className="flex flex-col items-center gap-1 py-3 w-14 h-full border-r border-white/[0.06]"
      style={{ background: 'rgba(14,14,20,0.85)', backdropFilter: 'blur(12px)' }}
      aria-label="Main navigation"
    >
      {/* Logo mark */}
      <div
        className="flex items-center justify-center w-8 h-8 rounded-[10px] mb-3 shrink-0"
        style={{
          background: 'var(--color-accent-gradient)',
          boxShadow: '0 4px 16px rgba(139,92,246,0.35)',
        }}
        aria-hidden="true"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1L13 4.5V10L7 13L1 10V4.5L7 1Z"
            fill="rgba(255,255,255,0.9)"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.5"
          />
          <circle cx="7" cy="7" r="2.5" fill="rgba(255,255,255,0.3)" />
        </svg>
      </div>

      {/* Main nav items */}
      <div className="flex flex-col items-center gap-0.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id
          return (
            <NavRailButton key={item.id} item={item} isActive={isActive} onNavigate={onNavigate} />
          )
        })}
      </div>

      {/* Settings — pinned to bottom */}
      <NavRailButton
        item={{
          id: 'settings',
          label: 'Settings',
          icon: <Settings size={18} strokeWidth={1.75} />,
        }}
        isActive={active === 'settings'}
        onNavigate={onNavigate}
      />
    </nav>
  )
}

type NavRailButtonProps = {
  item: NavItem
  isActive: boolean
  onNavigate: (id: NavSection) => void
}

function NavRailButton({ item, isActive, onNavigate }: NavRailButtonProps): ReactElement {
  return (
    <motion.button
      data-testid={`nav-${item.id}`}
      className={cn(
        'group relative flex items-center justify-center w-9 h-9 rounded-lg',
        'transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-low focus-visible:ring-offset-1 focus-visible:ring-offset-bg-1',
        isActive
          ? 'text-accent-mid bg-accent-low/15'
          : 'text-text-tertiary hover:text-text-secondary hover:bg-white/6',
      )}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: motionDuration.instant / 1000, ease: motionEasing.standard }}
      onClick={() => onNavigate(item.id)}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
    >
      {item.icon}

      {/* Active indicator bar */}
      {isActive && (
        <span
          className="absolute top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-accent-mid"
          style={{ left: -9 }}
        />
      )}

      {/* Tooltip */}
      <span
        className={cn(
          'pointer-events-none absolute left-full ml-2.5 px-2 py-1 rounded-md z-50',
          'text-xs text-text-primary whitespace-nowrap',
          'bg-bg-1 border border-white/[0.09] shadow-lg',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-fast',
          'translate-x-1 group-hover:translate-x-0 transition-transform duration-fast',
        )}
        role="tooltip"
      >
        {item.label}
      </span>
    </motion.button>
  )
}
