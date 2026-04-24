import type { Config } from 'tailwindcss'
import auralithPreset from '@auralith/design-system/src/tailwind-preset'

export default {
  presets: [auralithPreset as Config],
  content: ['./src/renderer/**/*.{ts,tsx,html}', '../../packages/design-system/src/**/*.{ts,tsx}'],
  plugins: [],
} satisfies Config
