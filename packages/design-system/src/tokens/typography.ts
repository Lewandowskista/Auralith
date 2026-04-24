export const typography = {
  fontFamily: {
    sans: "'Geist', 'Inter', system-ui, -apple-system, sans-serif",
    mono: "'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace",
    display: "'Fraunces', 'Georgia', serif",
  },

  fontSize: {
    // Display (hero moments only, Fraunces)
    display2xl: '56px',
    displayXl: '48px',
    displayLg: '40px',
    // Headings (Geist)
    h1: '32px',
    h2: '24px',
    h3: '18px',
    h4: '16px',
    // Body
    lg: '16px',
    base: '14px',
    sm: '13px',
    xs: '12px',
    // Mono
    mono: '13px',
    monoSm: '11px',
  },

  lineHeight: {
    tight: '1.2',
    snug: '1.35',
    normal: '1.55',
    relaxed: '1.7',
  },

  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  letterSpacing: {
    tight: '-0.04em',
    snug: '-0.02em',
    normal: '0',
    wide: '0.04em',
    caps: '0.08em',
  },
} as const

export type TypographyToken = typeof typography
