import { useState } from 'react'
import type { ReactElement } from 'react'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { StepProps } from '../OnboardingFlow'

type PingState = 'idle' | 'checking' | 'ok' | 'error'

export function StepOllama({ data, onChange, onNext, onSkip }: StepProps): ReactElement {
  const [pingState, setPingState] = useState<PingState>('idle')

  async function checkOllama() {
    setPingState('checking')
    try {
      const res = await fetch(`${data.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(4000) })
      if (res.ok) setPingState('ok')
      else setPingState('error')
    } catch {
      setPingState('error')
    }
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
        Local AI setup
      </h2>
      <p className="mb-6 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        Auralith uses Ollama to run models locally. Make sure Ollama is running.
      </p>

      {/* Ollama URL */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium text-[#A6A6B3]">Ollama endpoint</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={data.ollamaUrl}
            onChange={(e) => onChange({ ollamaUrl: e.target.value })}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F4F4F8] outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
          />
          <button
            onClick={() => void checkOllama()}
            disabled={pingState === 'checking'}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#A6A6B3] hover:bg-white/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            {pingState === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
          </button>
        </div>
        {pingState === 'ok' && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" /> Connected
          </div>
        )}
        {pingState === 'error' && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
            <XCircle className="h-3.5 w-3.5" /> Not reachable — is Ollama running?
          </div>
        )}
      </div>

      {/* Model fields */}
      {(['classifierModel', 'chatModel', 'embedModel'] as const).map((field) => (
        <div key={field} className="mb-3">
          <label className="mb-1 block text-xs font-medium text-[#A6A6B3]">
            {field === 'classifierModel'
              ? 'Classifier model'
              : field === 'chatModel'
                ? 'Chat model'
                : 'Embed model'}
          </label>
          <input
            type="text"
            value={data[field]}
            onChange={(e) => onChange({ [field]: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F4F4F8] outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
          />
        </div>
      ))}

      <div className="mt-6 flex gap-3">
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
            Set up later
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
          Continue
        </button>
      </div>
    </div>
  )
}
