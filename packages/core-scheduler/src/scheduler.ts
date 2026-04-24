export type JobDef = {
  name: string
  cronHour: number // 0-23 local hour to run
  cronMinute?: number // default 0
  jitterMs?: number // random delay added to prevent thundering herd, default 0
  quietStart?: number // quiet-hours start (local hour, e.g. 22)
  quietEnd?: number // quiet-hours end (local hour, e.g. 7)
  run: () => Promise<void>
}

type JobState = {
  def: JobDef
  timer: ReturnType<typeof setTimeout> | null
  lastRunAt: number | null
}

export class Scheduler {
  private jobs = new Map<string, JobState>()
  private running = false

  register(def: JobDef): void {
    this.jobs.set(def.name, { def, timer: null, lastRunAt: null })
    if (this.running) this.scheduleNext(def.name)
  }

  start(): void {
    this.running = true
    for (const name of this.jobs.keys()) {
      this.scheduleNext(name)
    }
  }

  stop(): void {
    this.running = false
    for (const state of this.jobs.values()) {
      if (state.timer) clearTimeout(state.timer)
      state.timer = null
    }
  }

  // Force-run a job immediately (used by briefing trigger, tests)
  async trigger(name: string): Promise<void> {
    const state = this.jobs.get(name)
    if (!state) throw new Error(`Job not registered: ${name}`)
    await state.def.run()
    state.lastRunAt = Date.now()
    if (this.running) this.scheduleNext(name)
  }

  private scheduleNext(name: string): void {
    const state = this.jobs.get(name)
    if (!state) return

    const ms = this.msUntilNextRun(state.def)
    state.timer = setTimeout(() => {
      void this.runJob(name)
    }, ms)
  }

  private async runJob(name: string): Promise<void> {
    const state = this.jobs.get(name)
    if (!state) return

    try {
      await state.def.run()
      state.lastRunAt = Date.now()
    } catch (err) {
      console.error(`[scheduler] job ${name} failed:`, err)
    }

    if (this.running) this.scheduleNext(name)
  }

  private msUntilNextRun(def: JobDef): number {
    const now = new Date()
    const target = new Date()
    target.setHours(def.cronHour, def.cronMinute ?? 0, 0, 0)

    // If we've passed today's run time, schedule for tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }

    // Skip if in quiet hours
    if (def.quietStart !== undefined && def.quietEnd !== undefined) {
      const targetHour = target.getHours()
      if (this.inQuietHours(targetHour, def.quietStart, def.quietEnd)) {
        // Push to after quiet-hours end
        target.setHours(def.quietEnd, 0, 0, 0)
        if (target.getTime() <= now.getTime()) {
          target.setDate(target.getDate() + 1)
          target.setHours(def.quietEnd, 0, 0, 0)
        }
      }
    }

    const jitter = def.jitterMs ? Math.random() * def.jitterMs : 0
    return Math.max(0, target.getTime() - now.getTime() + jitter)
  }

  private inQuietHours(hour: number, start: number, end: number): boolean {
    if (start <= end) return hour >= start && hour < end
    // Wraps midnight: e.g. 22–7
    return hour >= start || hour < end
  }
}

// Singleton
let _scheduler: Scheduler | null = null

export function getScheduler(): Scheduler {
  if (!_scheduler) _scheduler = new Scheduler()
  return _scheduler
}
