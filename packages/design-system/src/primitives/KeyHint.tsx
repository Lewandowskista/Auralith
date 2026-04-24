import type { HTMLAttributes } from 'react'
import { cn } from './utils'

// Renders a keyboard shortcut hint chip, e.g. <KeyHint keys={['Ctrl', 'K']} />
type KeyHintProps = HTMLAttributes<HTMLSpanElement> & {
  keys: string[]
}

export function KeyHint({ keys, className, ...props }: KeyHintProps) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} {...props}>
      {keys.map((k, i) => (
        <kbd
          key={i}
          className={cn(
            'inline-flex items-center justify-center',
            'min-w-[18px] h-[18px] px-1 rounded-sm',
            'text-[10px] font-mono text-text-tertiary',
            'bg-white/5 border border-white/[0.09]',
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}
