import type { Config } from 'tailwindcss'
import { colors } from './tokens/colors'
import { typography } from './tokens/typography'
import { spacing, radius, blur } from './tokens/spacing'
import { motionDuration } from './tokens/motion'

// Tailwind preset — import this in apps/desktop/tailwind.config.ts
// All design token values are sourced from the tokens package.
const preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'bg-0': colors.bg[0],
        'bg-1': colors.bg[1],
        'bg-2': colors.bg[2],
        // Accent
        'accent-low': colors.accent.low,
        'accent-mid': colors.accent.mid,
        'accent-high': colors.accent.high,
        // Text
        'text-primary': colors.text.primary,
        'text-secondary': colors.text.secondary,
        'text-tertiary': colors.text.tertiary,
        // States
        'state-success': colors.state.success,
        'state-warning': colors.state.warning,
        'state-danger': colors.state.danger,
        'state-info': colors.state.info,
      },

      fontFamily: {
        sans: [typography.fontFamily.sans],
        mono: [typography.fontFamily.mono],
        display: [typography.fontFamily.display],
      },

      fontSize: {
        'display-2xl': [
          typography.fontSize.display2xl,
          { lineHeight: typography.lineHeight.tight },
        ],
        'display-xl': [typography.fontSize.displayXl, { lineHeight: typography.lineHeight.tight }],
        'display-lg': [typography.fontSize.displayLg, { lineHeight: typography.lineHeight.snug }],
        h1: [typography.fontSize.h1, { lineHeight: typography.lineHeight.snug }],
        h2: [typography.fontSize.h2, { lineHeight: typography.lineHeight.snug }],
        h3: [typography.fontSize.h3, { lineHeight: typography.lineHeight.snug }],
        h4: [typography.fontSize.h4, { lineHeight: typography.lineHeight.snug }],
        lg: [typography.fontSize.lg, { lineHeight: typography.lineHeight.normal }],
        base: [typography.fontSize.base, { lineHeight: typography.lineHeight.normal }],
        sm: [typography.fontSize.sm, { lineHeight: typography.lineHeight.normal }],
        xs: [typography.fontSize.xs, { lineHeight: typography.lineHeight.normal }],
        mono: [typography.fontSize.mono, { lineHeight: typography.lineHeight.normal }],
        'mono-sm': [typography.fontSize.monoSm, { lineHeight: typography.lineHeight.normal }],
      },

      spacing: {
        '0.5': spacing[0.5],
        '1': spacing[1],
        '1.5': spacing[1.5],
        '2': spacing[2],
        '3': spacing[3],
        '4': spacing[4],
        '5': spacing[5],
        '6': spacing[6],
        '8': spacing[8],
        '10': spacing[10],
        '14': spacing[14],
        '18': spacing[18],
        '24': spacing[24],
        '32': spacing[32],
      },

      borderRadius: {
        none: radius.none,
        sm: radius.sm,
        DEFAULT: radius.base,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
        full: radius.full,
      },

      backdropBlur: {
        soft: blur.soft,
        medium: blur.medium,
        strong: blur.strong,
      },

      transitionDuration: {
        instant: String(motionDuration.instant),
        fast: String(motionDuration.fast),
        standard: String(motionDuration.standard),
        emphasized: String(motionDuration.emphasized),
      },

      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
        accelerate: 'cubic-bezier(0.4, 0.0, 1.0, 1)',
      },
    },
  },
}

export default preset
