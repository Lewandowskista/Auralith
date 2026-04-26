import { useState } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, WandSparkles, Search, Mic, Sun, Moon } from 'lucide-react'
import { Tooltip } from '@auralith/design-system'
import { useTheme } from '../context/ThemeContext'

type Props = {
  notificationCount: number
  activeSection: string
  onOpenNotifications: () => void
  onOpenPalette: () => void
  onOpenSpotlight: () => void
  onOpenVoice?: () => void
}

const ROUTE_LABELS: Record<string, string> = {
  home: 'Home',
  assistant: 'Assistant',
  activity: 'Activity',
  knowledge: 'Knowledge',
  news: 'News',
  weather: 'Weather',
  automations: 'Automations',
  settings: 'Settings',
}

export function TitleBar({
  notificationCount,
  activeSection,
  onOpenNotifications,
  onOpenPalette,
  onOpenSpotlight,
  onOpenVoice,
}: Props): ReactElement {
  const [hovered, setHovered] = useState(false)
  const { mode, setMode } = useTheme()

  const toggleTheme = () => {
    setMode(mode === 'dark' ? 'light' : 'dark')
  }

  const routeLabel = ROUTE_LABELS[activeSection] ?? 'Home'

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50 flex items-center gap-3"
      style={{
        height: 40,
        // @ts-expect-error Electron-specific CSS property
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(14,14,20,0.86)',
        backdropFilter: 'blur(28px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {/* Window controls — left side */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <TrafficLight
          color="close"
          hovered={hovered}
          onClick={() => void window.auralith.invoke('window.close', {})}
          aria-label="Close"
        />
        <TrafficLight
          color="minimize"
          hovered={hovered}
          onClick={() => void window.auralith.invoke('window.minimize', {})}
          aria-label="Minimize"
        />
        <TrafficLight
          color="maximize"
          hovered={hovered}
          onClick={() => void window.auralith.invoke('window.maximize', {})}
          aria-label="Maximize"
        />
      </div>

      {/* Brand + route */}
      <div
        className="flex items-center gap-2 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center justify-center rounded-[5px]"
          style={{
            width: 18,
            height: 18,
            background:
              'linear-gradient(135deg, oklch(0.60 0.22 262), oklch(0.76 0.18 282) 50%, oklch(0.72 0.16 322) 100%)',
            boxShadow: '0 0 12px rgba(139,92,246,0.42)',
          }}
          aria-hidden="true"
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L11 3.5V8.5L6 11L1 8.5V3.5L6 1Z" fill="rgba(255,255,255,0.92)" />
            <circle cx="6" cy="6" r="2" fill="rgba(255,255,255,0.28)" />
          </svg>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '0.01em',
          }}
        >
          Auralith
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
          — {routeLabel}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search bar */}
      <button
        onClick={onOpenPalette}
        className="flex items-center gap-2 rounded-[10px] transition-all"
        style={{
          height: 26,
          padding: '0 10px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(20,20,30,0.38)',
          color: 'var(--color-text-tertiary)',
          fontSize: 12,
          minWidth: 240,
          maxWidth: 380,
          flexShrink: 1,
          flexGrow: 0,
          cursor: 'text',
          // @ts-expect-error WebKit-specific CSS property
          WebkitAppRegion: 'no-drag',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
          e.currentTarget.style.background = 'rgba(18,18,26,0.62)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.background = 'rgba(20,20,30,0.38)'
        }}
        aria-label="Search (⌘K)"
      >
        <Search size={12} />
        <span className="flex-1 text-left">Search anything…</span>
        <kbd
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Action buttons */}
      <div
        className="flex items-center gap-0.5 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <TitleBarButton
          onClick={onOpenSpotlight}
          aria-label="Ask Auralith"
          tooltip="Spotlight (⌘⇧A)"
        >
          <WandSparkles size={14} />
        </TitleBarButton>

        {onOpenVoice && (
          <TitleBarButton onClick={onOpenVoice} aria-label="Voice" tooltip="Voice input">
            <Mic size={14} />
          </TitleBarButton>
        )}

        <TitleBarButton
          onClick={onOpenNotifications}
          aria-label="Open notifications"
          tooltip="Notifications"
        >
          <Bell size={14} />
          <AnimatePresence>
            {notificationCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="absolute flex items-center justify-center rounded-full text-white font-bold"
                style={{
                  top: 2,
                  right: 3,
                  minWidth: 14,
                  height: 14,
                  padding: '0 3px',
                  fontSize: 9,
                  background: 'var(--color-accent-low)',
                  boxShadow: '0 0 0 2px rgba(7,7,11,0.9)',
                }}
              >
                {notificationCount > 9 ? '9+' : notificationCount}
              </motion.span>
            )}
          </AnimatePresence>
        </TitleBarButton>

        <TitleBarButton
          onClick={toggleTheme}
          aria-label="Toggle theme"
          tooltip={mode === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {mode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </TitleBarButton>
      </div>
    </div>
  )
}

// ── Traffic light button ──────────────────────────────────────────────────────

type TrafficLightColor = 'close' | 'minimize' | 'maximize'

const TRAFFIC_COLORS: Record<TrafficLightColor, { active: string; hover: string }> = {
  close: { active: '#ff5f57', hover: '#ff453a' },
  minimize: { active: '#febc2e', hover: '#f5a623' },
  maximize: { active: '#28c840', hover: '#24b53a' },
}

const TRAFFIC_ICONS: Record<TrafficLightColor, ReactElement> = {
  close: (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
      <path d="M1 1l4 4M5 1L1 5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  minimize: (
    <svg width="6" height="2" viewBox="0 0 6 2" fill="none">
      <path d="M0.5 1h5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  maximize: (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
      <path
        d="M1 5L5 1M3 1h2v2"
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
}

function TrafficLight({
  color,
  hovered,
  onClick,
  'aria-label': ariaLabel,
}: {
  color: TrafficLightColor
  hovered: boolean
  onClick: () => void
  'aria-label': string
}): ReactElement {
  const { active } = TRAFFIC_COLORS[color]
  return (
    <motion.button
      onClick={onClick}
      aria-label={ariaLabel}
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.9 }}
      className="relative flex items-center justify-center focus:outline-none"
      style={{
        width: 11,
        height: 11,
        borderRadius: '50%',
        background: hovered ? active : 'rgba(255,255,255,0.14)',
        border: hovered ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.07)',
        transition: 'background 120ms, border-color 120ms',
      }}
    >
      <AnimatePresence>
        {hovered && (
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.1 }}
            className="absolute flex items-center justify-center"
          >
            {TRAFFIC_ICONS[color]}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

// ── Title bar action button ───────────────────────────────────────────────────

function TitleBarButton({
  children,
  onClick,
  'aria-label': ariaLabel,
  tooltip,
}: {
  children: React.ReactNode
  onClick: () => void
  'aria-label': string
  tooltip: string
}): ReactElement {
  return (
    <Tooltip content={tooltip}>
      <motion.button
        onClick={onClick}
        aria-label={ariaLabel}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        className="relative flex h-[26px] w-[28px] items-center justify-center rounded-[6px]"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.color = 'var(--color-text-primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--color-text-secondary)'
        }}
      >
        {children}
      </motion.button>
    </Tooltip>
  )
}
