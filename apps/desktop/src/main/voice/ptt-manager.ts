import { globalShortcut, BrowserWindow } from 'electron'

export type PttState = 'idle' | 'listening' | 'transcribing'

type PttCallbacks = {
  onStart: () => void
  onStop: () => void
  onStateChange: (state: PttState) => void
}

export class PttManager {
  private currentBinding = 'CommandOrControl+Shift+Space'
  private state: PttState = 'idle'
  private callbacks: PttCallbacks
  private registered = false
  private enabled = false
  private lastToggleAt = 0

  constructor(callbacks: PttCallbacks) {
    this.callbacks = callbacks
  }

  get currentState(): PttState {
    return this.state
  }

  enable(binding?: string): { conflict: boolean } {
    if (binding) this.currentBinding = binding
    if (this.registered) this.unregister()

    const ok = globalShortcut.register(this.currentBinding, () => {
      this.handleHotkey()
    })

    if (!ok) {
      console.warn(`[ptt-manager] hotkey conflict: ${this.currentBinding}`)
      this.registered = false
      this.enabled = false
      return { conflict: true }
    }

    this.registered = true
    this.enabled = true
    return { conflict: false }
  }

  disable(): void {
    this.unregister()
    this.enabled = false
    if (this.state !== 'idle') {
      this.setState('idle')
    }
  }

  updateBinding(newBinding: string): { conflict: boolean } {
    const wasEnabled = this.enabled
    if (wasEnabled) this.disable()
    this.currentBinding = newBinding
    if (wasEnabled) return this.enable(newBinding)
    return { conflict: false }
  }

  setState(newState: PttState): void {
    if (this.state === newState) return
    this.state = newState
    this.callbacks.onStateChange(newState)
    this.broadcastState()
  }

  private handleHotkey(): void {
    if (!this.enabled) return

    // Debounce: ignore rapid-fire key-repeat from OS (< 300ms between toggles)
    const now = Date.now()
    if (now - this.lastToggleAt < 300) return
    this.lastToggleAt = now

    if (this.state === 'idle') {
      this.setState('listening')
      this.callbacks.onStart()
    } else if (this.state === 'listening') {
      this.setState('transcribing')
      this.callbacks.onStop()
    }
    // If transcribing, ignore — let it finish
  }

  private broadcastState(): void {
    const wins = BrowserWindow.getAllWindows()
    for (const win of wins) {
      win.webContents.send('voice:state', { state: this.state })
    }
  }

  private unregister(): void {
    if (this.registered) {
      try {
        globalShortcut.unregister(this.currentBinding)
      } catch {
        // ignore
      }
      this.registered = false
    }
  }

  dispose(): void {
    this.unregister()
  }
}
