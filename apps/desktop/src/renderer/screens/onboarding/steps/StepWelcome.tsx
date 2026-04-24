import type { ReactElement } from 'react'
import { Brain, Activity, Newspaper } from 'lucide-react'
import type { StepProps } from '../OnboardingFlow'

const FEATURES = [
  {
    icon: <Brain className="h-4 w-4" />,
    label: 'Second Brain',
    desc: 'Local knowledge base with semantic search',
  },
  {
    icon: <Activity className="h-4 w-4" />,
    label: 'Activity Timeline',
    desc: 'Desktop activity tracked privately on-device',
  },
  {
    icon: <Newspaper className="h-4 w-4" />,
    label: 'Personalized News',
    desc: 'Curated topics, deduplicated and summarized',
  },
]

export function StepWelcome({ onNext }: StepProps): ReactElement {
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
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div
          className="mb-5 flex items-center justify-center"
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: 'var(--color-accent-gradient)',
            boxShadow: '0 8px 32px rgba(139,92,246,0.5)',
            animation: 'pulse 3s ease-in-out infinite',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1L13 4.5V10L7 13L1 10V4.5L7 1Z"
              fill="rgba(255,255,255,0.9)"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="0.5"
            />
            <circle cx="7" cy="7" r="2.5" fill="rgba(255,255,255,0.3)" />
          </svg>
        </div>

        <h1
          className="mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            fontWeight: 400,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
          }}
        >
          Auralith
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          Your local-first AI command center
        </p>
      </div>

      {/* Feature list */}
      <div className="mb-6 space-y-2">
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-3"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '10px 14px',
            }}
          >
            <div
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: 'rgba(139,92,246,0.15)',
                color: 'var(--color-accent-mid)',
              }}
            >
              {f.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {f.label}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onNext}
        className="w-full text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E14]"
        style={{
          padding: '12px 24px',
          borderRadius: 12,
          background: 'var(--color-accent-gradient)',
          boxShadow: '0 4px 20px rgba(139,92,246,0.35)',
          border: 'none',
          cursor: 'default',
          fontFamily: 'var(--font-sans)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.9'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
      >
        Get started
      </button>
    </div>
  )
}
