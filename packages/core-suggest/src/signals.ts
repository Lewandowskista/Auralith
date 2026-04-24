// Signal provider interfaces — injected by the main process into the suggestion engine.
// Keeps core-suggest free of Electron/OS dependencies.

export type FocusAppBucket = 'explorer' | 'browser' | 'ide' | 'other'

export type SignalProviders = {
  // Idle time in milliseconds from powerMonitor.getSystemIdleTime()
  getIdleMs?: () => number
  // Active foreground app bucket (opt-in)
  getFocusAppBucket?: () => FocusAppBucket | null
  // Next upcoming calendar event within a given lookahead window
  getNextCalendarEvent?: (
    withinMs: number,
  ) => { title: string; startAt: Date; location?: string } | null
}
