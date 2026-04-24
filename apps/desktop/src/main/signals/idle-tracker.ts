import { powerMonitor } from 'electron'

// Wraps Electron's powerMonitor.getSystemIdleTime() as a provider function.
// Returns idle time in milliseconds (Electron returns seconds, we convert).
export class IdleTracker {
  getIdleMs(): number {
    try {
      return powerMonitor.getSystemIdleTime() * 1000
    } catch {
      return 0
    }
  }
}
