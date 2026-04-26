import type { ReactElement } from 'react'

type Props = {
  count?: number
  height?: string
}

export function LoadingRows({ count = 4, height = 'h-10' }: Props): ReactElement {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${height} skeleton rounded-xl`}
          style={{ opacity: 1 - i * 0.18 }}
        />
      ))}
    </div>
  )
}
