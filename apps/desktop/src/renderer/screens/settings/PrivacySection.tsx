import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { HardDrive, FolderOpen, Download, Trash2, AlertTriangle, Bug, X, Clock } from 'lucide-react'
import { toast } from 'sonner'

type DataDirInfo = { path: string; sizeBytes: number }

type CrashStatSummary = {
  module: string
  crashCount: number
  errorCount: number
  lastTs: number
}

type CrashStatsData = {
  byModule: CrashStatSummary[]
  totalCrashes: number
  totalErrors: number
  windowDays: 30
}

type RetentionOption = { value: number; label: string }

const RETENTION_OPTIONS: RetentionOption[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days (default)' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
  { value: -1, label: 'Keep forever' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function PrivacySection(): ReactElement {
  const [dataDirInfo, setDataDirInfo] = useState<DataDirInfo | null>(null)
  const [exporting, setExporting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [crashStats, setCrashStats] = useState<CrashStatsData | null>(null)
  const [clearingStats, setClearingStats] = useState(false)
  const [retentionDays, setRetentionDays] = useState(90)
  const [purging, setPurging] = useState(false)

  useEffect(() => {
    void window.auralith.invoke('system.getDataDir', {}).then((res) => {
      if (res.ok) setDataDirInfo(res.data as DataDirInfo)
    })
    void window.auralith.invoke('system.getCrashStats', {}).then((res) => {
      if (res.ok) setCrashStats(res.data as CrashStatsData)
    })
    void window.auralith.invoke('settings.get', { key: 'activity.retentionDays' }).then((res) => {
      if (res.ok) {
        const data = res.data as { value: unknown }
        if (typeof data.value === 'number') setRetentionDays(data.value)
      }
    })
  }, [])

  async function handleExportData(): Promise<void> {
    const { shell } = { shell: null }
    void shell

    setExporting(true)
    try {
      const destPath = dataDirInfo ? dataDirInfo.path.split(/[\\/]/).slice(0, -1).join('\\') : ''

      const res = await window.auralith.invoke('system.exportData', { destPath })
      if (res.ok) {
        const { exportedPath } = res.data as { exportedPath: string }
        toast.success(`Exported to ${exportedPath}`)
        await window.auralith.invoke('system.openDataDir', {})
      } else {
        toast.error('Export failed')
      }
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteAll(): Promise<void> {
    if (deleteConfirm !== 'DELETE') return
    setDeleting(true)
    try {
      const res = await window.auralith.invoke('system.deleteAllData', { confirm: 'DELETE' })
      if (res.ok) {
        toast.success('All data deleted — restarting…')
      } else {
        toast.error('Deletion failed')
        setDeleting(false)
      }
    } catch {
      toast.error('Deletion failed')
      setDeleting(false)
    }
  }

  async function handleClearCrashStats(): Promise<void> {
    setClearingStats(true)
    try {
      const res = await window.auralith.invoke('system.clearCrashStats', {})
      if (res.ok) {
        setCrashStats({ byModule: [], totalCrashes: 0, totalErrors: 0, windowDays: 30 })
        toast.success('Crash stats cleared')
      }
    } finally {
      setClearingStats(false)
    }
  }

  async function handleRetentionChange(days: number): Promise<void> {
    setRetentionDays(days)
    await window.auralith.invoke('settings.set', { key: 'activity.retentionDays', value: days })
    const label = RETENTION_OPTIONS.find((o) => o.value === days)?.label ?? String(days)
    toast.success(`Retention set to ${label}`)
  }

  async function handlePurgeNow(): Promise<void> {
    setPurging(true)
    try {
      // Purge old audit entries using the existing audit.purge op
      const cutoff =
        retentionDays === -1 ? undefined : Date.now() - retentionDays * 24 * 60 * 60 * 1000
      const res = await window.auralith.invoke('audit.purge', { before: cutoff })
      if (res.ok) {
        const { deleted } = res.data as { deleted: number }
        toast.success(`Purged ${deleted} old audit entries`)
        // Refresh data dir size
        const dirRes = await window.auralith.invoke('system.getDataDir', {})
        if (dirRes.ok) setDataDirInfo(dirRes.data as DataDirInfo)
      }
    } finally {
      setPurging(false)
    }
  }

  const hasCrashStats =
    crashStats !== null && (crashStats.totalCrashes > 0 || crashStats.totalErrors > 0)

  return (
    <div className="max-w-lg space-y-8" data-testid="privacy-section">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[var(--color-text-primary)]">
          Privacy & Data
        </h2>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Your data lives entirely on this machine. No telemetry, no cloud sync.
        </p>
      </div>

      {/* Data directory */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Data directory</h3>
        <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 divide-y divide-[var(--color-border-hairline)]">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-[var(--color-text-secondary)]">Location</span>
            <span className="font-mono text-xs text-[var(--color-text-tertiary)] truncate max-w-[260px]">
              {dataDirInfo?.path ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-[var(--color-text-secondary)]">Size on disk</span>
            <span className="font-mono text-sm text-[var(--color-text-primary)]">
              {dataDirInfo ? formatBytes(dataDirInfo.sizeBytes) : '—'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void window.auralith.invoke('system.openDataDir', {})}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <FolderOpen size={14} />
            Open in Explorer
          </button>
          <button
            onClick={() => void handleExportData()}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/5 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export data'}
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Export copies your database and crash log to a timestamped folder next to the data
          directory.
        </p>
      </div>

      {/* Advanced retention controls */}
      <div className="space-y-4" data-testid="retention-section">
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-[var(--color-text-tertiary)]" />
          <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Data retention</h3>
        </div>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Activity events, voice transcripts, and audit entries older than the window are pruned
          automatically each day.
        </p>

        {/* Retention window selector */}
        <div>
          <label className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">
            Keep activity data for
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {RETENTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => void handleRetentionChange(opt.value)}
                className={[
                  'rounded-lg border px-2 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                  retentionDays === opt.value
                    ? 'border-violet-500/60 bg-violet-500/10 text-violet-300'
                    : 'border-[var(--color-border-hairline)] text-[var(--color-text-tertiary)] hover:bg-white/5 hover:text-[var(--color-text-secondary)]',
                ].join(' ')}
                aria-pressed={retentionDays === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* What's covered */}
        <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 px-4 py-3 space-y-1.5">
          <p className="text-xs font-medium text-[var(--color-text-secondary)]">
            Covered by retention policy
          </p>
          {[
            'Activity timeline events (file changes, downloads, etc.)',
            'Work session records',
            'Voice transcripts',
            'Audit log entries',
          ].map((item) => (
            <p
              key={item}
              className="text-xs text-[var(--color-text-tertiary)] flex items-start gap-1.5"
            >
              <span className="mt-0.5 shrink-0 text-violet-400">·</span>
              {item}
            </p>
          ))}
          <p className="text-xs text-[var(--color-text-tertiary)] flex items-start gap-1.5">
            <span className="mt-0.5 shrink-0 text-[var(--color-text-tertiary)]">·</span>
            Knowledge index (docs, chunks) — <em>not affected; manage via Knowledge → Spaces</em>
          </p>
        </div>

        <button
          onClick={() => void handlePurgeNow()}
          disabled={purging || retentionDays === -1}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/5 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <Trash2 size={14} />
          {purging ? 'Purging…' : 'Purge old entries now'}
        </button>
      </div>

      {/* Crash & error stats */}
      <div className="space-y-3" data-testid="crash-stats-section">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Bug size={14} className="text-[var(--color-text-tertiary)]" />
            Crash & error log
            <span className="text-xs text-[var(--color-text-tertiary)] font-normal">
              — last 30 days, local only
            </span>
          </h3>
          {hasCrashStats && (
            <button
              onClick={() => void handleClearCrashStats()}
              disabled={clearingStats}
              className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-40"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>

        {!crashStats ? (
          <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 px-4 py-3">
            <span className="text-sm text-[var(--color-text-tertiary)]">Loading…</span>
          </div>
        ) : !hasCrashStats ? (
          <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 px-4 py-3">
            <span className="text-sm text-[var(--color-text-tertiary)]">
              No crashes or errors recorded in the last 30 days.
            </span>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 divide-y divide-[var(--color-border-hairline)]">
            <div className="flex items-center gap-4 px-4 py-3">
              {crashStats.totalCrashes > 0 && (
                <span className="text-xs font-medium text-red-400">
                  {crashStats.totalCrashes} crash{crashStats.totalCrashes !== 1 ? 'es' : ''}
                </span>
              )}
              {crashStats.totalErrors > 0 && (
                <span className="text-xs font-medium text-amber-400">
                  {crashStats.totalErrors} error{crashStats.totalErrors !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {crashStats.byModule.map((entry) => (
              <div key={entry.module} className="flex items-center justify-between px-4 py-2.5">
                <span className="font-mono text-xs text-[var(--color-text-secondary)] truncate max-w-[220px]">
                  {entry.module}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  {entry.crashCount > 0 && (
                    <span className="text-xs text-red-400">{entry.crashCount}×</span>
                  )}
                  {entry.errorCount > 0 && (
                    <span className="text-xs text-amber-400">{entry.errorCount}×</span>
                  )}
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {formatRelativeTime(entry.lastTs)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Stats are kept on this device only. They are never sent anywhere.
        </p>
      </div>

      {/* Delete all data — destructive */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-[var(--color-state-danger)] flex items-center gap-1.5">
          <AlertTriangle size={14} />
          Delete all data
        </h3>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Permanently deletes all Auralith data — database, settings, knowledge index, activity log,
          and crash log. The app will restart. This cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <Trash2 size={14} />
            Delete all data…
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm text-red-300 font-medium">
              Type <span className="font-mono font-bold">DELETE</span> to confirm permanent
              deletion.
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-white/5 px-3 py-2 font-mono text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-red-500/50"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteConfirm('')
                }}
                className="flex-1 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeleteAll()}
                disabled={deleteConfirm !== 'DELETE' || deleting}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40 transition-colors"
              >
                <Trash2 size={14} />
                {deleting ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export { HardDrive }
