import type { CSSProperties, ReactElement, ReactNode } from 'react'

type SplitPaneProps = {
  primary: ReactNode
  secondary: ReactNode
  secondaryWidth?: number
  className?: string
  style?: CSSProperties
}

export function SplitPane({
  primary,
  secondary,
  secondaryWidth = 320,
  className,
  style,
}: SplitPaneProps): ReactElement {
  return (
    <div className={['flex min-h-0 min-w-0', className ?? ''].join(' ')} style={style}>
      <div className="min-w-0 flex-1">{primary}</div>
      <div className="mx-4 w-px shrink-0 bg-white/[0.06]" aria-hidden="true" />
      <div className="shrink-0" style={{ width: secondaryWidth }}>
        {secondary}
      </div>
    </div>
  )
}
