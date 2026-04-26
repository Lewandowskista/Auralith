import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Home,
  MessageSquare,
  Activity,
  BookOpen,
  Newspaper,
  CloudSun,
  Settings,
  Zap,
  Pin,
  PinOff,
} from 'lucide-react'
import { cn } from '@auralith/design-system'
import { motionEasing } from '@auralith/design-system'

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
  badge?: number
}

type NavGroup = {
  group: string
  items: NavItem[]
}

const NAV_SECTIONS: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { id: 'home', label: 'Home', icon: <Home size={18} strokeWidth={1.75} /> },
      { id: 'assistant', label: 'Assistant', icon: <MessageSquare size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    group: 'Context',
    items: [
      { id: 'activity', label: 'Activity', icon: <Activity size={18} strokeWidth={1.75} /> },
      { id: 'news', label: 'News', icon: <Newspaper size={18} strokeWidth={1.75} /> },
      { id: 'weather', label: 'Weather', icon: <CloudSun size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    group: 'Library',
    items: [
      { id: 'knowledge', label: 'Knowledge', icon: <BookOpen size={18} strokeWidth={1.75} /> },
      { id: 'automations', label: 'Automations', icon: <Zap size={18} strokeWidth={1.75} /> },
    ],
  },
]

const COLLAPSED_W = 64
const EXPANDED_W = 232
const EXPAND_TRANSITION = { duration: 0.32, ease: [0.32, 0.72, 0, 1] }
const LABEL_TRANSITION = { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }

type NavRailProps = {
  active: NavSection
  onNavigate: (section: NavSection) => void
  /** Notification badge counts per section */
  badges?: Partial<Record<NavSection, number>>
  /** User info for profile row */
  user?: { name: string; email: string; initials: string }
  pinned?: boolean
  onTogglePin?: () => void
}

export function NavRail({
  active,
  onNavigate,
  badges = {},
  user,
  pinned = false,
  onTogglePin,
}: NavRailProps): ReactElement {
  const [hovered, setHovered] = useState(false)
  const expanded = pinned || hovered

  // Sync CSS variable for the content grid
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--nav-rail-width',
      `${expanded ? EXPANDED_W : COLLAPSED_W}px`,
    )
  }, [expanded])

  return (
    <motion.nav
      data-testid="nav-rail"
      className="flex flex-col h-full overflow-hidden shrink-0"
      animate={{ width: expanded ? EXPANDED_W : COLLAPSED_W }}
      transition={EXPAND_TRANSITION}
      style={{
        borderRight: '1px solid rgba(255,255,255,0.07)',
        background: expanded ? 'rgba(20,20,30,0.82)' : 'rgba(18,18,26,0.62)',
        backdropFilter: 'blur(28px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
        willChange: 'width',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Main navigation"
    >
      {/* Rail head — logo + brand + pin */}
      <div
        className="flex items-center gap-2.5 shrink-0 overflow-hidden"
        style={{
          padding: '10px 8px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          marginBottom: 10,
        }}
      >
        {/* Logo mark */}
        <motion.div
          className="flex items-center justify-center shrink-0 rounded-[9px]"
          style={{
            width: 32,
            height: 32,
            background:
              'linear-gradient(135deg, oklch(0.60 0.22 262), oklch(0.76 0.18 282) 50%, oklch(0.72 0.16 322) 100%)',
            boxShadow: expanded
              ? '0 6px 26px rgba(139,92,246,0.42), inset 0 0 0 1px rgba(255,255,255,0.24)'
              : '0 4px 20px rgba(139,92,246,0.3), inset 0 0 0 1px rgba(255,255,255,0.18)',
          }}
          animate={expanded ? { rotate: -6, scale: 1.04 } : { rotate: 0, scale: 1 }}
          transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
          aria-hidden="true"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" fill="rgba(255,255,255,0.92)" />
            <circle cx="8" cy="8" r="2.6" fill="rgba(255,255,255,0.28)" />
          </svg>
        </motion.div>

        {/* Brand name + subtitle */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <motion.div
            animate={
              expanded
                ? { opacity: 1, x: 0, filter: 'blur(0px)' }
                : { opacity: 0, x: -6, filter: 'blur(3px)' }
            }
            transition={{ ...LABEL_TRANSITION, delay: expanded ? 0.08 : 0 }}
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            Auralith
          </motion.div>
          <motion.div
            animate={
              expanded
                ? { opacity: 1, x: 0, filter: 'blur(0px)' }
                : { opacity: 0, x: -6, filter: 'blur(3px)' }
            }
            transition={{ ...LABEL_TRANSITION, delay: expanded ? 0.12 : 0 }}
            style={{
              fontSize: 10,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
            }}
          >
            v0.4 · local
          </motion.div>
        </div>

        {/* Pin button */}
        {onTogglePin && (
          <motion.button
            onClick={onTogglePin}
            animate={expanded ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -6, scale: 0.9 }}
            transition={{ ...LABEL_TRANSITION, delay: expanded ? 0.12 : 0 }}
            className="flex items-center justify-center shrink-0 rounded-[6px]"
            style={{
              width: 26,
              height: 26,
              border: '1px solid rgba(255,255,255,0.08)',
              background: pinned ? 'var(--color-accent-low)' : 'rgba(255,255,255,0)',
              color: pinned ? 'white' : 'var(--color-text-tertiary)',
              cursor: 'pointer',
            }}
            aria-label={pinned ? 'Unpin navigation' : 'Pin navigation'}
            whileHover={{
              background: pinned ? undefined : 'rgba(255,255,255,0.06)',
              color: 'var(--color-text-primary)',
            }}
          >
            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </motion.button>
        )}
      </div>

      {/* Nav body */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 px-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.group}>
            {/* Group separator gap when collapsed */}
            {si > 0 && !expanded && <div style={{ height: 8 }} />}

            {/* Group label */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, x: -6, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: -6, filter: 'blur(3px)' }}
                  transition={{ ...LABEL_TRANSITION, delay: 0.14 }}
                  style={{
                    padding: '12px 10px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-tertiary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {section.group}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Items */}
            {section.items.map((item) => (
              <NavRailButton
                key={item.id}
                item={item}
                isActive={active === item.id}
                onNavigate={onNavigate}
                expanded={expanded}
                {...((badges[item.id] ?? item.badge) !== undefined
                  ? { badge: badges[item.id] ?? item.badge }
                  : {})}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="shrink-0 flex flex-col gap-0.5 px-2"
        style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <NavRailButton
          item={{
            id: 'settings',
            label: 'Settings',
            icon: <Settings size={18} strokeWidth={1.75} />,
          }}
          isActive={active === 'settings'}
          onNavigate={onNavigate}
          expanded={expanded}
        />

        {/* Profile row */}
        {user && (
          <motion.div
            className="flex items-center gap-2.5 rounded-[10px] cursor-pointer"
            style={{ padding: '8px 10px', marginTop: 6, background: 'rgba(255,255,255,0)' }}
            whileHover={{ background: 'rgba(255,255,255,0.05)', x: 2 }}
            transition={{ duration: 0.12 }}
          >
            <div
              className="flex items-center justify-center shrink-0 rounded-full font-semibold text-white"
              style={{
                width: 28,
                height: 28,
                fontSize: 11,
                background: 'linear-gradient(135deg, oklch(0.65 0.18 50), oklch(0.60 0.22 262))',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
              }}
            >
              {user.initials}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <motion.div
                animate={
                  expanded
                    ? { opacity: 1, x: 0, filter: 'blur(0px)' }
                    : { opacity: 0, x: -6, filter: 'blur(3px)' }
                }
                transition={{ ...LABEL_TRANSITION, delay: expanded ? 0.22 : 0 }}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.name}
              </motion.div>
              <motion.div
                animate={
                  expanded
                    ? { opacity: 1, x: 0, filter: 'blur(0px)' }
                    : { opacity: 0, x: -6, filter: 'blur(3px)' }
                }
                transition={{ ...LABEL_TRANSITION, delay: expanded ? 0.26 : 0 }}
                className="overflow-hidden text-ellipsis"
                style={{ fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}
              >
                {user.email}
              </motion.div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.nav>
  )
}

// ── NavRailButton ─────────────────────────────────────────────────────────────

type NavRailButtonProps = {
  item: NavItem
  isActive: boolean
  onNavigate: (id: NavSection) => void
  expanded: boolean
  badge?: number
}

function NavRailButton({
  item,
  isActive,
  onNavigate,
  expanded,
  badge,
}: NavRailButtonProps): ReactElement {
  return (
    <motion.button
      data-testid={`nav-${item.id}`}
      className={cn(
        'group relative flex items-center gap-3 w-full rounded-[10px] text-left overflow-hidden shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60',
      )}
      style={{
        height: 36,
        padding: '0 10px',
        color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        background: isActive
          ? 'linear-gradient(90deg, rgba(139,92,246,0.22) 0%, rgba(255,255,255,0.02) 100%)'
          : 'transparent',
        boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.08)' : 'none',
        border: 0,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background 220ms, color 220ms, box-shadow 220ms',
        position: 'relative',
      }}
      whileHover={
        isActive
          ? {}
          : {
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--color-text-primary)',
              x: 2,
            }
      }
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: motionEasing.standard }}
      onClick={() => onNavigate(item.id)}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
    >
      {/* Active indicator bar */}
      {isActive && (
        <motion.span
          layoutId="nav-active-indicator"
          className="absolute top-1/2 -translate-y-1/2 rounded-r-full"
          style={{
            left: -8,
            width: 3,
            height: 18,
            background: 'linear-gradient(180deg, oklch(0.72 0.20 262), oklch(0.60 0.22 262))',
            boxShadow: '0 0 10px rgba(139,92,246,0.6)',
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}

      {/* Icon */}
      <span
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 18,
          height: 18,
          color: isActive ? 'var(--color-accent-high)' : 'inherit',
          transition: 'color 220ms, transform 220ms',
        }}
      >
        {item.icon}
      </span>

      {/* Label */}
      <motion.span
        className="flex-1 font-medium"
        style={{ fontSize: 13 }}
        animate={
          expanded
            ? { opacity: 1, x: 0, filter: 'blur(0px)' }
            : { opacity: 0, x: -10, filter: 'blur(4px)' }
        }
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1], delay: expanded ? 0.1 : 0 }}
      >
        {item.label}
      </motion.span>

      {/* Badge */}
      {badge !== undefined && badge > 0 && (
        <motion.span
          className="flex items-center justify-center rounded-full font-semibold"
          style={{
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            fontSize: 10,
            background: isActive ? 'var(--color-accent-low)' : 'rgba(255,255,255,0.08)',
            color: isActive ? 'white' : 'var(--color-text-secondary)',
          }}
          animate={expanded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1], delay: expanded ? 0.18 : 0 }}
        >
          {badge}
        </motion.span>
      )}

      {/* Tooltip — shown only when collapsed */}
      {!expanded && (
        <span
          className={cn(
            'pointer-events-none absolute left-full ml-2.5 px-2.5 py-1.5 rounded-[6px] z-50',
            'text-xs font-medium whitespace-nowrap',
            'opacity-0 group-hover:opacity-100',
            'translate-x-[-6px] group-hover:translate-x-0',
            'transition-all duration-[160ms] delay-[160ms]',
          )}
          style={{
            color: 'var(--color-text-primary)',
            background: 'rgba(20,20,30,0.96)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(16px)',
          }}
          role="tooltip"
        >
          {item.label}
        </span>
      )}
    </motion.button>
  )
}
