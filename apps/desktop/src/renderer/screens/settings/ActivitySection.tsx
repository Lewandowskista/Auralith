import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { Clipboard, Monitor, Shield, Trash2, FolderOpen, Plus, X } from 'lucide-react'
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
  const [watchedFolders, setWatchedFolders] = useState<string[]>([])
  const [savingFolders, setSavingFolders] = useState(false)
  const [newFolderPath, setNewFolderPath] = useState('')

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
    void window.auralith.invoke('activity.getWatchedFolders', {}).then((res) => {
      if (res.ok) setWatchedFolders((res.data as { folders: string[] }).folders)
    })
  }, [])

  function addFolder(): void {
    const trimmed = newFolderPath.trim()
    if (!trimmed || watchedFolders.includes(trimmed)) return
    setWatchedFolders((prev) => [...prev, trimmed])
    setNewFolderPath('')
  }

  function removeFolder(path: string): void {
    setWatchedFolders((prev) => prev.filter((f) => f !== path))
  }

  async function saveWatchedFolders(): Promise<void> {
    setSavingFolders(true)
    try {
      const res = await window.auralith.invoke('activity.setWatchedFolders', {
        folders: watchedFolders,
      })
      if (res.ok) {
        toast.success(
          watchedFolders.length > 0
            ? `Now watching ${watchedFolders.length} folder${watchedFolders.length !== 1 ? 's' : ''}`
            : 'File watching stopped',
        )
      }
    } finally {
      setSavingFolders(false)
    }
  }

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

      {/* File watching */}
      <div className="space-y-4" data-testid="file-watching-section">
        <div className="flex items-center gap-2">
          <FolderOpen size={14} className="text-[var(--color-text-tertiary)]" />
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Watched folders</h3>
        </div>

        <p className="text-xs text-[var(--color-text-tertiary)]">
          Files created, edited, moved, or deleted in these folders appear in your activity
          timeline.
        </p>

        {watchedFolders.length > 0 && (
          <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 divide-y divide-[var(--color-border-hairline)]">
            {watchedFolders.map((folder) => (
              <div key={folder} className="flex items-center gap-3 px-4 py-2.5">
                <FolderOpen size={12} className="shrink-0 text-[var(--color-text-tertiary)]" />
                <span className="flex-1 truncate font-mono text-xs text-[var(--color-text-secondary)]">
                  {folder}
                </span>
                <button
                  onClick={() => removeFolder(folder)}
                  className="shrink-0 rounded p-1 text-[var(--color-text-tertiary)] hover:bg-white/5 hover:text-red-400 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
                  aria-label="Remove folder"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newFolderPath}
            onChange={(e) => setNewFolderPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addFolder()
            }}
            placeholder="Paste a folder path…"
            className="flex-1 rounded-lg border border-[var(--color-border-hairline)] bg-white/[0.04] px-3 py-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
          />
          <button
            onClick={addFolder}
            disabled={!newFolderPath.trim()}
            className="flex items-center gap-1 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-white/5 disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Plus size={12} />
            Add
          </button>
        </div>

        <button
          onClick={() => void saveWatchedFolders()}
          disabled={savingFolders}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/5 disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          {savingFolders ? 'Saving…' : 'Save watched folders'}
        </button>
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
            <Toggle
              on={clipRedact}
              onToggle={
                clipSettings.enabled
                  ? () => void toggleRedact()
                  : () => {
                      /* disabled when clipboard is off */
                    }
              }
            />
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
