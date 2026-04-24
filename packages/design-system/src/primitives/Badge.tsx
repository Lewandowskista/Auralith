import type { HTMLAttributes } from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { cn } from './utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium select-none',
  {
    variants: {
      variant: {
        default: 'bg-white/8 text-text-secondary border border-white/[0.09]',
        accent: 'bg-accent-low/20 text-accent-mid border border-accent-low/30',
        success: 'bg-state-success/15 text-state-success border border-state-success/25',
        warning: 'bg-state-warning/15 text-state-warning border border-state-warning/25',
        danger: 'bg-state-danger/15 text-state-danger border border-state-danger/25',
        info: 'bg-state-info/15 text-state-info border border-state-info/25',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
