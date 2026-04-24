import type { ReactElement } from 'react'
import { BookOpen } from 'lucide-react'
import type { StepProps } from '../OnboardingFlow'

export function StepSpaces({ data, onChange, onNext, onSkip }: StepProps): ReactElement {
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
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15">
        <BookOpen className="h-5 w-5 text-violet-400" />
      </div>
      <h2
        className="mb-1 mt-3 text-xl font-semibold"
        style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
      >
        Create a Space
      </h2>
      <p className="mb-6 text-sm text-[#6F6F80]">
        Spaces organise your knowledge. Point one at a folder and Auralith will index the documents
        inside.
      </p>

      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-medium text-[#A6A6B3]">Space name</label>
        <input
          type="text"
          placeholder="e.g. Work notes"
          value={data.firstSpaceName}
          onChange={(e) => onChange({ firstSpaceName: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F4F4F8] placeholder-[#6F6F80] outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
        />
      </div>

      <div className="mb-6">
        <label className="mb-1.5 block text-xs font-medium text-[#A6A6B3]">Folder path</label>
        <input
          type="text"
          placeholder="C:\Users\You\Documents\Notes"
          value={data.firstSpacePath}
          onChange={(e) => onChange({ firstSpacePath: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-[#F4F4F8] placeholder-[#6F6F80] outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
        />
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
            Skip for now
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
          {data.firstSpaceName ? 'Create Space' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
