import type { HTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { cn } from './utils'

const surfaceVariants = cva('relative overflow-hidden', {
  variants: {
    variant: {
      /** Solid card — use for dense information panels */
      card: [
        'rounded-xl border',
        'bg-[rgba(20,20,28,0.80)] border-white/[0.08]',
        'shadow-[0_2px_16px_rgba(0,0,0,0.35)]',
      ],
      /** Glass panel — use for elevated floating surfaces only */
      glass: [
        'rounded-2xl border',
        'bg-[rgba(14,14,20,0.55)] border-white/[0.10]',
        '[backdrop-filter:blur(24px)]',
        'shadow-[0_4px_32px_rgba(0,0,0,0.45)]',
      ],
      /** Orb — circular ambient indicator */
      orb: [
        'rounded-full',
        'bg-[rgba(14,14,20,0.60)] border border-white/[0.12]',
        '[backdrop-filter:blur(16px)]',
        'shadow-[0_2px_24px_rgba(0,0,0,0.50)]',
      ],
      /** Inset — subtle sunken panel inside another surface */
      inset: ['rounded-lg border', 'bg-black/20 border-white/[0.06]'],
    },
    hoverable: {
      true: 'transition-colors duration-150 hover:border-white/[0.15] hover:bg-white/[0.03] cursor-pointer',
      false: '',
    },
    padding: {
      none: '',
      sm: 'p-3',
      base: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: {
    variant: 'card',
    hoverable: false,
    padding: 'none',
  },
})

export type SurfaceVariant = VariantProps<typeof surfaceVariants>['variant']

type SurfaceProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof surfaceVariants>

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, variant, hoverable, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(surfaceVariants({ variant, hoverable, padding }), className)}
      {...props}
    />
  ),
)
Surface.displayName = 'Surface'

/** Convenience aliases */
export const Card = forwardRef<HTMLDivElement, Omit<SurfaceProps, 'variant'>>((props, ref) => (
  <Surface ref={ref} variant="card" {...props} />
))
Card.displayName = 'Card'

export const GlassPanel = forwardRef<HTMLDivElement, Omit<SurfaceProps, 'variant'>>(
  (props, ref) => <Surface ref={ref} variant="glass" {...props} />,
)
GlassPanel.displayName = 'GlassPanel'
