import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { X, Maximize2, Zap } from 'lucide-react'

type SuggestionRow = { id: string; title: string; kind: string }

function useTime(): string {
  const [time, setTime] = useState(() => formatTime(new Date()))
  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 10_000)
    return () => clearInterval(id)
  }, [])
  return time
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function useSuggestions(): SuggestionRow[] {
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([])

  useEffect(() => {
    function load(): void {
      void window.auralith.invoke('suggest.list', { status: 'open', limit: 1 }).then((res) => {
        if (res.ok) {
          const data = res.data as { suggestions: SuggestionRow[] }
          setSuggestions(data.suggestions ?? [])
        }
      })
    }

    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  return suggestions
}

export function MiniApp(): ReactElement {
  const time = useTime()
  const suggestions = useSuggestions()
  const topSuggestion = suggestions[0] ?? null

  function handleClose(): void {
    void window.auralith.invoke('system.closeMiniWindow', {})
  }

  function handleExpand(): void {
    // Focus main window
    void window.auralith.invoke('palette.open', {})
  }

  function handleAccept(): void {
    if (!topSuggestion) return
    void window.auralith.invoke('suggest.accept', { id: topSuggestion.id })
  }

  function handleDismiss(): void {
    if (!topSuggestion) return
    void window.auralith.invoke('suggest.dismiss', { id: topSuggestion.id })
  }

  return (
    <div
      className="flex h-full w-full flex-col rounded-2xl border border-white/10 bg-[rgba(14,14,20,0.88)] backdrop-blur-strong shadow-2xl overflow-hidden"
      style={{ backdropFilter: 'blur(24px)' }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <span className="font-mono text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
          {time}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExpand}
            aria-label="Open command palette"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <Maximize2 size={12} />
          </button>
          <button
            onClick={handleClose}
            aria-label="Close mini window"
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-tertiary)] hover:text-red-400 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center px-3 pb-2.5">
        {topSuggestion ? (
          <div className="flex w-full items-center gap-2 min-w-0">
            <Zap size={13} className="shrink-0 text-violet-400" />
            <p className="flex-1 truncate text-xs text-[var(--color-text-secondary)]">
              {topSuggestion.title}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleAccept}
                className="rounded-md bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300 hover:bg-violet-500/30 transition-colors"
              >
                Do it
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-md px-2 py-0.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-tertiary)]">No active suggestions</p>
        )}
      </div>
    </div>
  )
}
