import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import type { AppUsageRepo, AppUsageBucket, EventsRepo } from '@auralith/core-db'
import type { ActivityEvent } from '@auralith/core-events'

// Extended bucket classification covering media and productivity apps.
// Privacy guarantee: only the bucket enum is persisted — never the window title or URL.

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
  'zed',
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

const MEDIA_PROCESSES = new Set([
  'vlc',
  'mpv',
  'mpc-hc64',
  'mpc-be64',
  'spotify',
  'groove',
  'wmplayer',
  'itunes',
  'winamp',
  'aimp',
  'foobar2000',
  'potplayer64',
  'daum potplayer',
])

const PRODUCTIVITY_PROCESSES = new Set([
  'winword',
  'excel',
  'powerpnt',
  'onenote',
  'outlook',
  'soffice',
  'notion',
  'obsidian',
  'typora',
  'marktext',
  'slack',
  'teams',
  'zoom',
  'discord',
  'telegram',
  'signal',
])

function classifyProcess(name: string): AppUsageBucket {
  const lower = name
    .toLowerCase()
    .replace(/\.exe$/, '')
    .trim()
  if (IDE_PROCESSES.has(lower)) return 'ide'
  if (BROWSER_PROCESSES.has(lower)) return 'browser'
  if (EXPLORER_PROCESSES.has(lower)) return 'explorer'
  if (MEDIA_PROCESSES.has(lower)) return 'media'
  if (PRODUCTIVITY_PROCESSES.has(lower)) return 'productivity'
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

const POLL_INTERVAL_MS = 60_000
const MIN_SESSION_MS = 10_000

export class AppSessionTracker {
  private enabled = false
  private repo: AppUsageRepo | null = null
  private eventsRepo: EventsRepo | null = null
  private pollHandle: ReturnType<typeof setInterval> | null = null
  private currentSessionId: string | null = null
  private currentBucket: AppUsageBucket | null = null
  private currentProcess: string | null = null
  private sessionStartedAt: number | null = null

  setEnabled(enabled: boolean, repo?: AppUsageRepo, eventsRepo?: EventsRepo): void {
    this.enabled = enabled
    if (repo) this.repo = repo
    if (eventsRepo) this.eventsRepo = eventsRepo

    if (enabled && !this.pollHandle) {
      void this.poll()
      this.pollHandle = setInterval(() => {
        void this.poll()
      }, POLL_INTERVAL_MS)
    } else if (!enabled && this.pollHandle !== null) {
      this.closeCurrentSession()
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  private async poll(): Promise<void> {
    if (!this.enabled || !this.repo) return
    const processName = await getForegroundProcessName()
    if (!processName) return

    const bucket = classifyProcess(processName)
    const now = Date.now()

    if (bucket !== this.currentBucket || processName.toLowerCase() !== this.currentProcess) {
      this.closeCurrentSession()
      this.currentBucket = bucket
      this.currentProcess = processName.toLowerCase()
      this.currentSessionId = randomUUID()
      this.sessionStartedAt = now
      this.writeFocusEvent(bucket, processName, now)
      this.repo.insert({
        id: this.currentSessionId,
        startedAt: now,
        bucket,
        processName: processName.toLowerCase().replace(/\.exe$/, ''),
      })
    }
  }

  private closeCurrentSession(): void {
    if (!this.currentSessionId || !this.repo || !this.sessionStartedAt) return
    const duration = Date.now() - this.sessionStartedAt
    if (duration >= MIN_SESSION_MS) {
      this.repo.close(this.currentSessionId, new Date())
    }
    this.currentSessionId = null
    this.currentBucket = null
    this.currentProcess = null
    this.sessionStartedAt = null
  }

  dispose(): void {
    this.closeCurrentSession()
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle)
      this.pollHandle = null
    }
  }

  private writeFocusEvent(bucket: AppUsageBucket, processName: string, ts: number): void {
    if (!this.eventsRepo) return
    const event: ActivityEvent = {
      id: randomUUID(),
      ts: new Date(ts),
      kind: 'app.focus',
      source: 'signal',
      path: processName.toLowerCase().replace(/\.exe$/, ''),
      actor: 'system',
      payloadJson: JSON.stringify({
        bucket,
        processName: processName.toLowerCase().replace(/\.exe$/, ''),
      }),
    }
    this.eventsRepo.writeEvent(event)
  }
}
