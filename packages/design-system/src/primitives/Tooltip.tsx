import { useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'

type TooltipProps = {
  content: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export function Tooltip({ content, children, className, style }: TooltipProps): ReactElement {
  const [open, setOpen] = useState(false)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={[
            'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/[0.08] bg-[rgba(16,16,22,0.96)] px-2 py-1 text-xs text-[#F4F4F8] shadow-xl backdrop-blur-xl',
            className ?? '',
          ].join(' ')}
          style={style}
        >
          {content}
        </span>
      )}
    </span>
  )
}
