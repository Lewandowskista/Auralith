import type { ReactElement } from 'react'
import { Check, MapPin } from 'lucide-react'
import type { StepProps } from '../OnboardingFlow'

const STARTER_TOPICS = [
  'Technology',
  'Science',
  'Business',
  'World news',
  'Health',
  'AI & machine learning',
  'Design',
  'Finance',
  'Culture',
  'Sports',
]

const LEISURE_TOPICS = ['Cooking', 'Film & TV', 'Books', 'Games']

export function StepNewsWeather({ data, onChange, onNext, onSkip }: StepProps): ReactElement {
  const selected = new Set(data.newsTopics)

  function toggleTopic(topic: string) {
    const next = new Set(selected)
    if (next.has(topic)) next.delete(topic)
    else next.add(topic)
    onChange({ newsTopics: Array.from(next) })
  }

  function requestLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          weatherLat: pos.coords.latitude.toFixed(4),
          weatherLon: pos.coords.longitude.toFixed(4),
        })
      },
      () => {
        // User denied or unavailable — leave empty
      },
    )
  }

  return (
    <div
      style={{
        background: 'rgba(14,14,20,0.80)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--color-border-strong)',
        borderRadius: 20,
        padding: '40px 40px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}
    >
      <h2
        className="mb-1 text-xl font-semibold"
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
      >
        News & Weather
      </h2>
      <p className="mb-5 text-sm text-[#6F6F80]">
        Pick topics for your news feed, and optionally share coarse location for weather.
      </p>

      {/* Topics */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-medium text-[#A6A6B3]">News topics</p>
        <div className="flex flex-wrap gap-2">
          {[...STARTER_TOPICS, ...LEISURE_TOPICS].map((t) => {
            const on = selected.has(t)
            return (
              <button
                key={t}
                onClick={() => toggleTopic(t)}
                className={[
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                  on
                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
                    : 'border-white/10 bg-white/[0.03] text-[#A6A6B3] hover:bg-white/[0.06]',
                ].join(' ')}
              >
                {on && <Check className="h-3 w-3" />}
                {t}
              </button>
            )
          })}
        </div>
      </div>

      {/* Briefing toggle */}
      <div className="mb-5 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-[#F4F4F8]">Morning briefing</p>
          <p className="text-xs text-[#6F6F80]">Daily digest at 07:00</p>
        </div>
        <button
          onClick={() => onChange({ briefingEnabled: !data.briefingEnabled })}
          role="switch"
          aria-checked={data.briefingEnabled}
          className={[
            'relative h-6 w-11 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
            data.briefingEnabled
              ? 'border-violet-500 bg-violet-600'
              : 'border-white/20 bg-white/10',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
              data.briefingEnabled ? 'left-[calc(100%-1.375rem)]' : 'left-0.5',
            ].join(' ')}
          />
        </button>
      </div>

      {/* Weather location */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-medium text-[#A6A6B3]">Location (for weather)</p>
        {data.weatherLat && data.weatherLon ? (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <MapPin className="h-3.5 w-3.5" />
            {data.weatherLat}, {data.weatherLon}
          </div>
        ) : (
          <button
            onClick={requestLocation}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#A6A6B3] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <MapPin className="h-3.5 w-3.5" /> Use my location (coarse)
          </button>
        )}
      </div>

      <div className="flex gap-3">
        {onSkip && (
          <button
            onClick={onSkip}
            className="flex-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              border: '1px solid var(--color-border-subtle)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--color-text-secondary)',
              cursor: 'default',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Skip
          </button>
        )}
        <button
          onClick={onNext}
          className="flex-1 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          style={{
            padding: '10px 16px',
            borderRadius: 12,
            background: 'var(--color-accent-gradient)',
            boxShadow: '0 4px 16px rgba(139,92,246,0.30)',
            border: 'none',
            cursor: 'default',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Finish setup
        </button>
      </div>
    </div>
  )
}
