import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { cn } from './utils'

const buttonVariants = cva(
  // Base
  [
    'inline-flex items-center justify-center gap-2 rounded-md font-medium',
    'transition-all duration-fast ease-standard',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-low focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0',
    'disabled:pointer-events-none disabled:opacity-40',
    'select-none cursor-default',
  ],
  {
    variants: {
      variant: {
        // Primary — filled accent
        primary: ['bg-accent-low text-white', 'hover:bg-accent-mid active:scale-[0.98]'],
        // Secondary — subtle glass surface
        secondary: [
          'bg-white/6 text-text-primary border border-white/[0.09]',
          'hover:bg-white/10 active:scale-[0.98]',
        ],
        // Ghost — no background
        ghost: [
          'text-text-secondary',
          'hover:bg-white/6 hover:text-text-primary active:scale-[0.98]',
        ],
        // Destructive
        destructive: [
          'bg-state-danger/20 text-state-danger border border-state-danger/30',
          'hover:bg-state-danger/30 active:scale-[0.98]',
        ],
        // Link
        link: ['text-accent-mid underline-offset-4 hover:underline', 'h-auto p-0'],
      },
      size: {
        sm: 'h-7 px-3 text-xs',
        base: 'h-8 px-4 text-sm',
        lg: 'h-10 px-5 text-base',
        icon: 'h-8 w-8 p-0',
        'icon-sm': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'base',
    },
  },
)

export type ButtonVariant = VariantProps<typeof buttonVariants>['variant']
export type ButtonSize = VariantProps<typeof buttonVariants>['size']

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
