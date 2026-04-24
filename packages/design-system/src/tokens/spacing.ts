// Spacing scale in px — maps to Tailwind's spacing system
export const spacing = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  14: '56px',
  18: '72px',
  24: '96px',
  32: '128px',
} as const

export const radius = {
  none: '0px',
  sm: '4px',
  base: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  full: '9999px',
} as const

export const blur = {
  soft: '12px',
  medium: '24px',
  strong: '36px',
} as const

export type SpacingToken = typeof spacing
export type RadiusToken = typeof radius
export type BlurToken = typeof blur
