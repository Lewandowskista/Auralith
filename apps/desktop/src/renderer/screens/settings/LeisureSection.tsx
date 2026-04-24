import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { toast } from 'sonner'

type WeekendMode = 'auto' | 'always' | 'off'

export function LeisureSection(): ReactElement {
  const [weekendMode, setWeekendMode] = useState<WeekendMode>('auto')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const res = await window.auralith.invoke('settings.get', { key: 'leisure.weekendMode' })
      if (res.ok) {
        const data = res.data as { value: unknown }
        if (data.value === 'always' || data.value === 'off' || data.value === 'auto') {
          setWeekendMode(data.value)
        }
      }
      setLoading(false)
    })()
  }, [])

  async function saveMode(next: WeekendMode): Promise<void> {
    setWeekendMode(next)
    const res = await window.auralith.invoke('settings.set', {
      key: 'leisure.weekendMode',
      value: next,
    })
    if (!res.ok) {
      setWeekendMode(weekendMode)
      toast.error('Failed to save setting')
    }
  }

  if (loading) {
    return <div className="h-8 w-40 rounded-lg bg-white/5 animate-pulse" />
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[#F4F4F8]">Leisure & Weekend</h2>
        <p className="text-sm text-[#6F6F80]">
          Auralith shifts into a lighter mode on weekends — relaxed briefings, saved reading
          resurfacing, and gentle activity nudges instead of productivity suggestions.
        </p>
      </div>

      {/* Weekend mode selector */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-[#F4F4F8]">Weekend mode</p>
        <p className="text-xs text-[#6F6F80]">
          Controls when leisure suggestions replace the standard productivity rail. Use "Always on"
          if you work irregular hours or prefer leisure suggestions every day.
        </p>

        <div className="space-y-2">
          {(
            [
              { value: 'auto', label: 'Auto-detect', desc: 'Active on Saturday and Sunday' },
              { value: 'always', label: 'Always on', desc: 'Leisure mode every day' },
              { value: 'off', label: 'Off', desc: 'Never show leisure suggestions' },
            ] as Array<{ value: WeekendMode; label: string; desc: string }>
          ).map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => void saveMode(value)}
              className={[
                'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition',
                weekendMode === value
                  ? 'border-violet-500/50 bg-violet-500/10'
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
              ].join(' ')}
            >
              <span
                className={[
                  'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center',
                  weekendMode === value ? 'border-violet-500' : 'border-white/20',
                ].join(' ')}
              >
                {weekendMode === value && <span className="h-2 w-2 rounded-full bg-violet-500" />}
              </span>
              <div>
                <p className="text-sm font-medium text-[#F4F4F8]">{label}</p>
                <p className="text-xs text-[#6F6F80]">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* What leisure mode does */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6F6F80]">
          What changes in leisure mode
        </p>
        <ul className="space-y-1.5 text-xs text-[#6F6F80]">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
            Weekend morning briefing replaces the standard weekday brief
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
            Saved articles older than 7 days are surfaced for re-reading
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />A gentle
            hobby nudge appears in the afternoon
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
            End-of-day recap and downloads cleanup are suppressed
          </li>
        </ul>
      </div>
    </div>
  )
}
