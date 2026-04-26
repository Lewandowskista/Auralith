import { useState, useEffect, useRef, useCallback } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Headphones, Video, Play, Pause, SkipBack, SkipForward, Volume2, X } from 'lucide-react'

export type MiniPlayerItem = {
  id: string
  kind: 'audio' | 'video' | 'briefing' | 'voice'
  kindLabel?: string
  title: string
  byline: string
  total?: number
  progress?: number
}

type MiniPlayerProps = {
  item: MiniPlayerItem | null
  onClose: () => void
}

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function MiniPlayer({ item, onClose }: MiniPlayerProps): ReactElement | null {
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(item?.progress ?? 0.34)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const initialRef = useRef<number>(progress)

  const tick = useCallback(() => {
    const dt = (performance.now() - startRef.current) / 1000
    const total = item?.total ?? 240
    const next = Math.min(1, initialRef.current + dt / total)
    setProgress(next)
    if (next < 1) rafRef.current = requestAnimationFrame(tick)
  }, [item?.total])

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!playing || !item) return
    startRef.current = performance.now()
    initialRef.current = progress
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable react-hooks/exhaustive-deps -- tick is memoized on item.total
  }, [playing, item?.id])

  if (!item) return null

  const isVideo = item.kind === 'video'
  const isAudio = item.kind === 'audio' || item.kind === 'briefing' || item.kind === 'voice'
  const total = item.total ?? 240
  const cur = Math.floor(total * progress)

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const next = (e.clientX - r.left) / r.width
    setProgress(Math.max(0, Math.min(1, next)))
    initialRef.current = next
    startRef.current = performance.now()
  }

  return (
    <AnimatePresence>
      <motion.div
        key={item.id}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        style={{
          position: 'fixed',
          bottom: 18,
          right: 18,
          width: 280,
          zIndex: 300,
          borderRadius: 14,
          background: 'rgba(14,14,20,0.94)',
          backdropFilter: 'blur(28px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
          overflow: 'hidden',
        }}
      >
        {/* Top row: art + info + close */}
        <div
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 12px 8px' }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: 8,
              background:
                'linear-gradient(135deg, oklch(0.60 0.22 262), oklch(0.76 0.18 282) 50%, oklch(0.72 0.16 322))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.9)',
              boxShadow: '0 4px 16px rgba(139,92,246,0.35)',
            }}
          >
            {isVideo ? (
              <Video size={16} />
            ) : isAudio ? (
              <Headphones size={16} />
            ) : (
              <Play size={16} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
                marginBottom: 2,
              }}
            >
              {item.kindLabel ?? (isVideo ? 'Video clip' : 'Audio')}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.title}
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--color-text-tertiary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 1,
              }}
            >
              {item.byline}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close player"
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.color = 'var(--color-text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Waveform — audio only */}
        {isAudio && (
          <div
            aria-hidden="true"
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 1.5,
              height: 28,
              padding: '0 12px',
              overflow: 'hidden',
            }}
          >
            {Array.from({ length: 44 }).map((_, i) => {
              const h = 5 + Math.abs(Math.sin(i * 1.9) * 14)
              const faded = i / 44 > progress + 0.02
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: h,
                    borderRadius: 2,
                    background: faded
                      ? 'rgba(255,255,255,0.12)'
                      : 'linear-gradient(180deg, oklch(0.76 0.18 282), oklch(0.60 0.22 262))',
                    opacity: faded ? 0.4 : playing ? 0.9 : 0.45,
                    transition: 'opacity 200ms',
                  }}
                />
              )
            })}
          </div>
        )}

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px 4px',
          }}
        >
          <IconBtn aria-label="Previous" onClick={() => setProgress(Math.max(0, progress - 0.05))}>
            <SkipBack size={13} />
          </IconBtn>
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, oklch(0.60 0.22 262), oklch(0.72 0.16 322))',
              color: 'white',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(139,92,246,0.4)',
              flexShrink: 0,
            }}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <IconBtn aria-label="Next" onClick={() => setProgress(Math.min(1, progress + 0.05))}>
            <SkipForward size={13} />
          </IconBtn>
          <IconBtn aria-label="Volume">
            <Volume2 size={13} />
          </IconBtn>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap',
            }}
          >
            {fmt(cur)} / {fmt(total)}
          </span>
        </div>

        {/* Progress bar */}
        <div
          onClick={handleProgressClick}
          style={{ height: 3, cursor: 'pointer', background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: 'linear-gradient(90deg, oklch(0.60 0.22 262), oklch(0.72 0.16 322))',
              transition: 'width 0.1s linear',
            }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function IconBtn({
  children,
  onClick,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  onClick?: () => void
  'aria-label': string
}): ReactElement {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 26,
        height: 26,
        borderRadius: 6,
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        color: 'var(--color-text-secondary)',
        cursor: 'pointer',
        transition: 'background 120ms, color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
        e.currentTarget.style.color = 'var(--color-text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--color-text-secondary)'
      }}
    >
      {children}
    </button>
  )
}
