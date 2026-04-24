import type { ReactElement } from 'react'

export type BarChartDatum = {
  id: string
  label: string
  value: number
  tone?: 'accent' | 'info' | 'success' | 'warning'
}

type BarChartProps = {
  data: BarChartDatum[]
}

const TONE_MAP: Record<NonNullable<BarChartDatum['tone']>, string> = {
  accent: 'linear-gradient(180deg, rgba(168,85,247,0.95), rgba(109,40,217,0.7))',
  info: 'linear-gradient(180deg, rgba(56,189,248,0.95), rgba(8,145,178,0.7))',
  success: 'linear-gradient(180deg, rgba(52,211,153,0.95), rgba(5,150,105,0.7))',
  warning: 'linear-gradient(180deg, rgba(251,191,36,0.95), rgba(217,119,6,0.7))',
}

export function BarChart({ data }: BarChartProps): ReactElement {
  const max = Math.max(...data.map((item) => item.value), 1)

  return (
    <div className="flex items-end gap-2">
      {data.map((item) => (
        <div key={item.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-28 w-full items-end rounded-2xl bg-white/[0.03] p-1">
            <div
              className="w-full rounded-xl"
              style={{
                height: `${Math.max(10, (item.value / max) * 100)}%`,
                background: TONE_MAP[item.tone ?? 'accent'],
              }}
              title={`${item.label}: ${item.value}`}
            />
          </div>
          <span className="truncate text-[11px] text-[#6F6F80]">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
