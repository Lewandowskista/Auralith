// Elevation levels: shadow + border combination per level
export const elevation = {
  0: {
    shadow: 'none',
    border: 'none',
  },
  1: {
    shadow: '0 1px 3px rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  2: {
    shadow: '0 4px 16px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.09)',
  },
  3: {
    // Glass panels — command palette, drawers, toasts
    shadow: '0 8px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdrop: 'blur(24px)',
    bg: 'rgba(20, 20, 28, 0.55)',
  },
} as const

export type ElevationToken = typeof elevation
