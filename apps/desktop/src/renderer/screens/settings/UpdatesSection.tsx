import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { RefreshCw, Download, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

type UpdaterState = {
  status: UpdaterStatus
  version?: string
  error?: string
}

type AppVersion = {
  version: string
  channel: 'stable' | 'beta'
}

function StatusIcon({ status }: { status: UpdaterStatus }): ReactElement {
  if (status === 'checking' || status === 'downloading')
    return (
      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
    )
  if (status === 'available' || status === 'ready')
    return <CheckCircle size={14} style={{ color: 'var(--color-state-success)' }} />
  if (status === 'error')
    return <AlertTriangle size={14} style={{ color: 'var(--color-state-danger)' }} />
  return <CheckCircle size={14} style={{ color: 'var(--color-text-tertiary)' }} />
}

function statusLabel(state: UpdaterState): string {
  switch (state.status) {
    case 'idle':
      return 'Up to date'
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Update available${state.version ? ` — v${state.version}` : ''}`
    case 'downloading':
      return `Downloading update${state.version ? ` v${state.version}` : ''}…`
    case 'ready':
      return `Ready to install${state.version ? ` v${state.version}` : ''} — restart to apply`
    case 'error':
      return `Update error${state.error ? `: ${state.error}` : ''}`
  }
}

export function UpdatesSection(): ReactElement {
  const [appVersion, setAppVersion] = useState<AppVersion | null>(null)
  const [updater, setUpdater] = useState<UpdaterState>({ status: 'idle' })
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [verRes, statusRes] = await Promise.all([
          window.auralith.invoke('system.getVersion', {}),
          window.auralith.invoke('system.getUpdaterStatus', {}),
        ])
        if (verRes.ok) setAppVersion(verRes.data as AppVersion)
        if (statusRes.ok) setUpdater(statusRes.data as UpdaterState)
      } catch (err) {
        console.error('[UpdatesSection] Failed to load update status:', err)
      }
    })()
  }, [])

  // Listen for updater events broadcast from main process
  useEffect(() => {
    const offAvailable = window.auralith.on('updater:update-available', (data) => {
      const d = data as { version: string }
      setUpdater({ status: 'available', version: d.version })
    })
    const offDownloaded = window.auralith.on('updater:update-downloaded', (data) => {
      const d = data as { version: string }
      setUpdater({ status: 'ready', version: d.version })
    })
    return () => {
      offAvailable()
      offDownloaded()
    }
  }, [])

  async function checkForUpdates(): Promise<void> {
    setUpdater({ status: 'checking' })
    const res = await window.auralith.invoke('system.triggerUpdateCheck', {})
    if (!res.ok) {
      setUpdater({ status: 'error', error: 'Check failed' })
    }
  }

  async function installUpdate(): Promise<void> {
    setInstalling(true)
    try {
      await window.auralith.invoke('system.installUpdate', {})
    } catch {
      toast.error('Failed to start update installation')
      setInstalling(false)
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[#F4F4F8]">Updates</h2>
        <p className="text-sm text-[#6F6F80]">Automatic updates via GitHub Releases.</p>
      </div>

      {/* Version info */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-[#A6A6B3]">Version</span>
          <span className="font-mono text-sm text-[#F4F4F8]">
            {appVersion ? `v${appVersion.version}` : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-[#A6A6B3]">Channel</span>
          <span
            className={[
              'rounded-full px-2 py-0.5 text-xs font-medium',
              appVersion?.channel === 'beta'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-emerald-500/15 text-emerald-300',
            ].join(' ')}
          >
            {appVersion?.channel ?? 'stable'}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-[#A6A6B3]">Status</span>
          <div className="flex items-center gap-1.5">
            <StatusIcon status={updater.status} />
            <span className="text-sm text-[#F4F4F8]">{statusLabel(updater)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => void checkForUpdates()}
          disabled={updater.status === 'checking' || updater.status === 'downloading'}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-[#A6A6B3] hover:bg-white/5 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <RefreshCw size={14} className={updater.status === 'checking' ? 'animate-spin' : ''} />
          Check for updates
        </button>

        {updater.status === 'ready' && (
          <button
            onClick={() => void installUpdate()}
            disabled={installing}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Download size={14} />
            Restart & install
          </button>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-[#6F6F80]">
        Updates are downloaded automatically and applied on the next restart. Auralith never phones
        home beyond update checks — zero telemetry.
      </div>
    </div>
  )
}
