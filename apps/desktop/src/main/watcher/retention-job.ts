import type { EventsRepo } from '@auralith/core-db'
import type { SettingsRepo } from '@auralith/core-db'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000 // once per day
const DEFAULT_RETENTION_DAYS = 90

export class RetentionJob {
  private eventsRepo: EventsRepo
  private settingsRepo: SettingsRepo
  private sqlite: Database.Database | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(eventsRepo: EventsRepo, settingsRepo: SettingsRepo, sqlite?: Database.Database) {
    this.eventsRepo = eventsRepo
    this.settingsRepo = settingsRepo
    this.sqlite = sqlite ?? null
  }

  start(): void {
    if (this.timer) return
    this.run()
    this.timer = setInterval(() => this.run(), RUN_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private run(): void {
    try {
      const days = this.getRetentionDays()
      if (days === -1) return // "forever"

      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      this.eventsRepo.deleteOlderThan(cutoff)
      this.eventsRepo.deleteOrphanSessions()
      this.pruneVoiceTranscripts(cutoff)
    } catch (err) {
      console.error('[retention-job] error:', err)
    }
  }

  private pruneVoiceTranscripts(cutoff: Date): void {
    if (!this.sqlite) return
    try {
      const stmt = this.sqlite.prepare('DELETE FROM voice_transcripts WHERE ts < ?')
      stmt.run(cutoff.getTime())
    } catch {
      // table may not exist yet on first run before migration — ignore silently
    }
  }

  private getRetentionDays(): number {
    try {
      const val = this.settingsRepo.get('activity.retentionDays', z.number())
      return val ?? DEFAULT_RETENTION_DAYS
    } catch {
      return DEFAULT_RETENTION_DAYS
    }
  }
}
