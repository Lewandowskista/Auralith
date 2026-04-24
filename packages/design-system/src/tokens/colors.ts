export const colors = {
  // Backgrounds
  bg: {
    0: '#07070B', // app canvas
    1: '#0E0E14', // nav rail, solid panels
    2: '#14141C', // cards
  },

  // Glass surface: use as rgba + backdrop-blur
  glass: {
    bg: 'rgba(20, 20, 28, 0.55)',
    blur: '24px',
    border: 'rgba(255, 255, 255, 0.08)',
  },

  // Accent — iridescent violet
  accent: {
    low: '#8B5CF6',
    mid: '#A78BFA',
    high: '#C084FC',
    // CSS gradient for hero moments
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #C084FC 50%, #60A5FA 100%)',
  },

  // Text
  text: {
    primary: '#F4F4F8',
    secondary: '#A6A6B3',
    tertiary: '#6F6F80',
    inverse: '#07070B',
  },

  // Borders
  border: {
    hairline: 'rgba(255, 255, 255, 0.06)',
    subtle: 'rgba(255, 255, 255, 0.09)',
    strong: 'rgba(255, 255, 255, 0.12)',
    accent: 'rgba(139, 92, 246, 0.4)',
  },

  // Semantic states
  state: {
    success: '#34D399',
    successBg: 'rgba(52, 211, 153, 0.12)',
    warning: '#FBBF24',
    warningBg: 'rgba(251, 191, 36, 0.12)',
    danger: '#F87171',
    dangerBg: 'rgba(248, 113, 113, 0.12)',
    info: '#60A5FA',
    infoBg: 'rgba(96, 165, 250, 0.12)',
  },
} as const

export type ColorToken = typeof colors
