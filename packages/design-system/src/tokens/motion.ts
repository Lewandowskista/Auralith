// Motion tokens — medium-low intensity, purposeful
export const motionDuration = {
  instant: 80,
  fast: 120,
  standard: 180,
  emphasized: 260,
  enterExit: 220,
  slow: 400,
} as const

export const motionEasing = {
  standard: [0.2, 0.8, 0.2, 1] as const,
  decelerate: [0.0, 0.0, 0.2, 1] as const,
  accelerate: [0.4, 0.0, 1.0, 1] as const,
  spring: { type: 'spring', stiffness: 400, damping: 30 } as const,
  springGentle: { type: 'spring', stiffness: 200, damping: 24 } as const,
} as const

// Framer Motion variant presets
export const variants = {
  fadeRise: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
  },
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  scale98: {
    initial: { scale: 1 },
    hover: { scale: 1.02 },
    tap: { scale: 0.98 },
  },
  slideInRight: {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 24 },
  },
  slideInUp: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
  },
} as const

export type MotionDurationToken = typeof motionDuration
export type MotionEasingToken = typeof motionEasing
