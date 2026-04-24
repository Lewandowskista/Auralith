import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { FolderOpen, Check } from 'lucide-react'
import type { StepProps } from '../OnboardingFlow'

const DEFAULT_FOLDERS = ['Downloads', 'Documents', 'Desktop']

type DefaultFolder = {
  name: string
  path: string
}

function getFallbackHome(): string {
  return 'C:\\Users\\User'
}

function getFallbackFolders(): DefaultFolder[] {
  const home = getFallbackHome()
  return DEFAULT_FOLDERS.map((name) => ({ name, path: `${home}\\${name}` }))
}

function readDefaultFolders(data: unknown): DefaultFolder[] | null {
  const folders = (data as { folders?: unknown }).folders
  if (!Array.isArray(folders)) return null

  const parsed = folders.flatMap((folder): DefaultFolder[] => {
    if (
      typeof folder === 'object' &&
      folder !== null &&
      typeof (folder as { name?: unknown }).name === 'string' &&
      typeof (folder as { path?: unknown }).path === 'string'
    ) {
      const { name, path } = folder as DefaultFolder
      return [{ name, path }]
    }
    return []
  })

  return parsed.length > 0 ? parsed : null
}

export function StepFolders({ data, onChange, onNext, onSkip }: StepProps): ReactElement {
  const [folders, setFolders] = useState<DefaultFolder[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(data.watchedFolders))

  useEffect(() => {
    let cancelled = false

    async function loadFolders(): Promise<void> {
      const fallback = getFallbackFolders()
      let nextFolders = fallback

      try {
        const res = await window.auralith.invoke('system.getDefaultFolders', {})
        if (res.ok) {
          nextFolders = readDefaultFolders(res.data) ?? fallback
        }
      } catch {
        nextFolders = fallback
      }

      if (cancelled) return
      setFolders(nextFolders)

      if (data.watchedFolders.length === 0) {
        const defaults = nextFolders.map((folder) => folder.path)
        setSelected(new Set(defaults))
        onChange({ watchedFolders: defaults })
      }
    }

    void loadFolders()
    return () => {
      cancelled = true
    }
  }, [])

  function toggle(path: string) {
    const next = new Set(selected)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelected(next)
    onChange({ watchedFolders: Array.from(next) })
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
        Watched folders
      </h2>
      <p className="mb-2 text-sm text-[#6F6F80]">
        Auralith watches these folders for file activity.
      </p>
      <p className="mb-6 rounded-lg bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
        Only file paths and names are stored — never file contents — unless you opt in via
        Knowledge.
      </p>

      <div className="space-y-2">
        {(folders.length > 0 ? folders : getFallbackFolders()).map(({ name, path }) => {
          const isOn = selected.has(path)
          return (
            <button
              key={name}
              onClick={() => toggle(path)}
              className={[
                'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                isOn
                  ? 'border-violet-500/40 bg-violet-500/10'
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
              ].join(' ')}
            >
              <div
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                  isOn ? 'border-violet-500 bg-violet-500' : 'border-white/20 bg-transparent',
                ].join(' ')}
              >
                {isOn && <Check className="h-3.5 w-3.5 text-white" />}
              </div>
              <FolderOpen
                className={['h-4 w-4 shrink-0', isOn ? 'text-violet-400' : 'text-[#6F6F80]'].join(
                  ' ',
                )}
              />
              <div>
                <p className="text-sm font-medium text-[#F4F4F8]">{name}</p>
                <p className="text-xs text-[#6F6F80] font-mono">{path}</p>
              </div>
            </button>
          )
        })}
      </div>

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
          Continue
        </button>
      </div>
    </div>
  )
}
