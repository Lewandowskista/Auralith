import { useState } from 'react'
import type { ReactElement } from 'react'
import { Bell, Command, WandSparkles } from 'lucide-react'
import { Tooltip } from '@auralith/design-system'

type Props = {
  notificationCount: number
  onOpenNotifications: () => void
  onOpenPalette: () => void
  onOpenSpotlight: () => void
}

export function TitleBar({
  notificationCount,
  onOpenNotifications,
  onOpenPalette,
  onOpenSpotlight,
}: Props): ReactElement {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center"
      style={{
        height: 36,
        // @ts-expect-error Electron-specific CSS property
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{
          // @ts-expect-error Electron-specific CSS property
          WebkitAppRegion: 'no-drag',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Tooltip content="Open command palette">
          <button
            onClick={onOpenPalette}
            aria-label="Open command palette"
            className="relative flex h-7 w-7 items-center justify-center rounded-full text-[#A6A6B3] transition hover:bg-white/6 hover:text-[#F4F4F8]"
          >
            <Command size={13} />
          </button>
        </Tooltip>

        <Tooltip content="Open spotlight">
          <button
            onClick={onOpenSpotlight}
            aria-label="Open spotlight"
            className="relative flex h-7 w-7 items-center justify-center rounded-full text-[#A6A6B3] transition hover:bg-white/6 hover:text-[#F4F4F8]"
          >
            <WandSparkles size={13} />
          </button>
        </Tooltip>

        <Tooltip content="Open notification center">
          <button
            onClick={onOpenNotifications}
            aria-label="Open notification center"
            className="relative flex h-7 w-7 items-center justify-center rounded-full text-[#A6A6B3] transition hover:bg-white/6 hover:text-[#F4F4F8]"
          >
            <Bell size={13} />
            {notificationCount > 0 && (
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
          </button>
        </Tooltip>

        <button
          onClick={() => void window.auralith.invoke('window.close', {})}
          aria-label="Close"
          className="flex items-center justify-center transition-all focus:outline-none"
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: hovered ? '#ff5f57' : 'rgba(255,255,255,0.15)',
            border: hovered ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.08)',
            cursor: 'default',
          }}
        >
          {hovered && (
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
              <path
                d="M1 1l4 4M5 1L1 5"
                stroke="rgba(0,0,0,0.5)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        <button
          onClick={() => void window.auralith.invoke('window.minimize', {})}
          aria-label="Minimize"
          className="flex items-center justify-center transition-all focus:outline-none"
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: hovered ? '#febc2e' : 'rgba(255,255,255,0.15)',
            border: hovered ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.08)',
            cursor: 'default',
          }}
        >
          {hovered && (
            <svg width="6" height="2" viewBox="0 0 6 2" fill="none">
              <path d="M0.5 1h5" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <button
          onClick={() => void window.auralith.invoke('window.maximize', {})}
          aria-label="Maximize"
          className="flex items-center justify-center transition-all focus:outline-none"
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: hovered ? '#28c840' : 'rgba(255,255,255,0.15)',
            border: hovered ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.08)',
            cursor: 'default',
          }}
        >
          {hovered && (
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
              <path
                d="M1 5L5 1M3 1h2v2"
                stroke="rgba(0,0,0,0.5)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
