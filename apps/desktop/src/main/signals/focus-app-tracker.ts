import { execFile } from 'child_process'
import type { AuditRepo } from '@auralith/core-db'
import type { FocusAppBucket } from '@auralith/core-suggest'

// Opt-in foreground app tracker — records only a coarse enum bucket.
// Privacy guarantee: never records window titles, URLs, or file paths.
// Uses a PowerShell one-liner to get the foreground process name on Windows.

const IDE_PROCESSES = new Set([
  'code',
  'code - insiders',
  'cursor',
  'devenv',
  'idea64',
  'webstorm64',
  'pycharm64',
  'clion64',
  'rider64',
  'notepad++',
  'vim',
  'nvim',
  'emacs',
  'sublime_text',
  'atom',
])

const BROWSER_PROCESSES = new Set([
  'chrome',
  'firefox',
  'msedge',
  'brave',
  'opera',
  'vivaldi',
  'safari',
  'iexplore',
  'arc',
])

const EXPLORER_PROCESSES = new Set(['explorer', 'files', 'totalcmd', 'doublecmd', 'freecommander'])

function classifyProcess(name: string): FocusAppBucket {
  const lower = name
    .toLowerCase()
    .replace(/\.exe$/, '')
    .trim()
  if (IDE_PROCESSES.has(lower)) return 'ide'
  if (BROWSER_PROCESSES.has(lower)) return 'browser'
  if (EXPLORER_PROCESSES.has(lower)) return 'explorer'
  return 'other'
}

function getForegroundProcessName(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(Get-Process -Id (Get-WmiObject Win32_ForegroundWindowProcess).ProcessId -ErrorAction SilentlyContinue).Name',
      ],
      { timeout: 2000 },
      (_err, stdout) => {
        resolve(stdout.trim() || null)
      },
    )
  })
}

export class FocusAppTracker {
  private enabled = false
  private pollHandle: ReturnType<typeof setInterval> | null = null
  private lastBucket: FocusAppBucket | null = null
  private auditRepo: AuditRepo | null = null

  setEnabled(enabled: boolean, auditRepo?: AuditRepo): void {
    this.enabled = enabled
    if (auditRepo) this.auditRepo = auditRepo

    if (enabled && !this.pollHandle) {
      this.poll()
      this.pollHandle = setInterval(() => this.poll(), 60_000)
    } else if (!enabled && this.pollHandle !== null) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
      this.lastBucket = null
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getBucket(): FocusAppBucket | null {
    return this.enabled ? this.lastBucket : null
  }

  private poll(): void {
    if (!this.enabled) return
    void getForegroundProcessName().then((processName) => {
      if (!processName || !this.enabled) return
      const bucket = classifyProcess(processName)
      this.lastBucket = bucket
      // Audit log — only the bucket enum value, never the process name or titles
      this.auditRepo?.write({
        kind: 'signals.focusapp.bucket',
        actor: 'system',
        subject: bucket,
        meta: {},
      })
    })
  }

  dispose(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
  }
}
