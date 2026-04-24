import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { Clipboard, Monitor, Shield, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type ClipboardSettings = { enabled: boolean }
type AppUsageSettings = { enabled: boolean }

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      style={{ background: on ? 'var(--color-accent-mid)' : 'rgba(255,255,255,0.12)' }}
    >
      <span
        className="pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? 'translateX(18px)' : 'translateX(3px)' }}
      />
    </button>
  )
}

export function ActivitySection(): ReactElement {
  const [clipSettings, setClipSettings] = useState<ClipboardSettings>({ enabled: false })
  const [appSettings, setAppSettings] = useState<AppUsageSettings>({ enabled: false })
  const [clipRedact, setClipRedact] = useState(true)
  const [clearingClip, setClearingClip] = useState(false)

  useEffect(() => {
    void window.auralith.invoke('clipboard.getSettings', {}).then((res) => {
      if (res.ok) setClipSettings(res.data as ClipboardSettings)
    })
    void window.auralith.invoke('appUsage.getSettings', {}).then((res) => {
      if (res.ok) setAppSettings(res.data as AppUsageSettings)
    })
    void window.auralith.invoke('settings.get', { key: 'activity.clipboardRedact' }).then((res) => {
      if (res.ok) {
        const d = res.data as { value: unknown }
        if (typeof d.value === 'boolean') setClipRedact(d.value)
      }
    })
  }, [])

  async function toggleClipboard(): Promise<void> {
    const next = !clipSettings.enabled
    const res = await window.auralith.invoke('clipboard.setEnabled', { enabled: next })
    if (res.ok) {
      setClipSettings({ enabled: next })
      toast.success(next ? 'Clipboard history enabled' : 'Clipboard history disabled')
    }
  }

  async function toggleRedact(): Promise<void> {
    const next = !clipRedact
    const res = await window.auralith.invoke('clipboard.setRedact', { redact: next })
    if (res.ok) {
      setClipRedact(next)
      toast.success(next ? 'Sensitive content will be redacted' : 'Redaction disabled')
    }
  }

  async function toggleAppUsage(): Promise<void> {
    const next = !appSettings.enabled
    const res = await window.auralith.invoke('appUsage.setEnabled', { enabled: next })
    if (res.ok) {
      setAppSettings({ enabled: next })
      toast.success(next ? 'App usage tracking enabled' : 'App usage tracking disabled')
    }
  }

  async function clearClipboard(): Promise<void> {
    setClearingClip(true)
    try {
      const res = await window.auralith.invoke('clipboard.clear', {})
      if (res.ok) {
        const { deleted } = res.data as { deleted: number }
        toast.success(`Cleared ${deleted} clipboard entries`)
      }
    } finally {
      setClearingClip(false)
    }
  }

  return (
    <div className="max-w-lg space-y-8" data-testid="activity-section">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[var(--color-text-primary)]">
          Activity Tracking
        </h2>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Opt-in features that add clipboard history and app usage sessions to your activity
          timeline. All data stays on this device.
        </p>
      </div>

      {/* Clipboard history */}
      <div className="space-y-4" data-testid="clipboard-section">
        <div className="flex items-center gap-2">
          <Clipboard size={14} className="text-[var(--color-text-tertiary)]" />
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
            Clipboard history
          </h3>
        </div>

        <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 divide-y divide-[var(--color-border-hairline)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">Enable clipboard history</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Watches clipboard for text changes every 1.5 seconds
              </p>
            </div>
            <Toggle on={clipSettings.enabled} onToggle={() => void toggleClipboard()} />
          </div>

          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ opacity: clipSettings.enabled ? 1 : 0.5 }}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <Shield size={12} className="text-violet-400" />
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Redact sensitive content
                </p>
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Detects passwords, tokens, emails, and credit card patterns — stores char count only
              </p>
            </div>
            <Toggle on={clipRedact} onToggle={() => void toggleRedact()} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">What is stored</p>
          {[
            'Text content (after redaction check)',
            'Character count of each copy',
            'Timestamp and session association',
          ].map((item) => (
            <p
              key={item}
              className="flex items-start gap-1.5 text-xs text-[var(--color-text-tertiary)]"
            >
              <span className="mt-0.5 shrink-0 text-violet-400">·</span>
              {item}
            </p>
          ))}
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-text-tertiary)]">
            <span className="mt-0.5 shrink-0 text-[var(--color-text-tertiary)]">·</span>
            Images and files — <em>not captured (text only)</em>
          </p>
        </div>

        <button
          onClick={() => void clearClipboard()}
          disabled={clearingClip}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/5 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <Trash2 size={14} />
          {clearingClip ? 'Clearing…' : 'Clear clipboard history'}
        </button>
      </div>

      {/* App usage */}
      <div className="space-y-4" data-testid="app-usage-section">
        <div className="flex items-center gap-2">
          <Monitor size={14} className="text-[var(--color-text-tertiary)]" />
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
            App usage sessions
          </h3>
        </div>

        <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 divide-y divide-[var(--color-border-hairline)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">Track app focus sessions</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Records which app category you were in, polled every 60 seconds
              </p>
            </div>
            <Toggle on={appSettings.enabled} onToggle={() => void toggleAppUsage()} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">Privacy model</p>
          {[
            'Only a coarse category is stored: IDE, browser, explorer, media, productivity, or other',
            'Never records window titles, URLs, or file paths',
            'Process name is lowercased and .exe stripped before storage',
            'Sessions shorter than 10 seconds are discarded',
          ].map((item) => (
            <p
              key={item}
              className="flex items-start gap-1.5 text-xs text-[var(--color-text-tertiary)]"
            >
              <span className="mt-0.5 shrink-0 text-violet-400">·</span>
              {item}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
