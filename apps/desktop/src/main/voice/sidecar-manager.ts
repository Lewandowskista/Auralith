import { EventEmitter } from 'events'
import { execSync, spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// Max crashes within the tracking window before the sidecar is disabled.
const MAX_CRASHES = 3
const CRASH_WINDOW_MS = 60_000

type SidecarMessage = Record<string, unknown> & { module: string; type?: string }

type ModuleListener = (msg: SidecarMessage) => void

/**
 * Manages the lifecycle of the unified Python voice sidecar process.
 * Communicates via newline-delimited JSON on stdio.
 *
 * Emits:
 *  - 'ready'  : sidecar process started and sent its started message
 *  - 'error'  : a non-recoverable error occurred (sidecar disabled)
 *  - 'exit'   : the sidecar process exited (may auto-restart)
 */
export class SidecarManager extends EventEmitter {
  private process: ChildProcess | null = null
  private lineBuffer = ''
  private moduleListeners = new Map<string, Set<ModuleListener>>()
  private crashTimestamps: number[] = []
  private disabled = false

  /** True once the sidecar has confirmed it started. */
  ready = false

  start(): void {
    if (this.disabled) return
    if (this.process) return

    const pythonPath = this.resolvePythonPath()
    const scriptPath = this.resolveScriptPath()

    if (!pythonPath || !scriptPath) {
      console.warn('[sidecar] Python or sidecar script not found — voice sidecar unavailable.')
      return
    }

    console.warn(`[sidecar] Starting: ${pythonPath} ${scriptPath}`)

    this.process = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    this.process.stdout?.setEncoding('utf8')
    this.process.stdout?.on('data', (chunk: string) => {
      this.lineBuffer += chunk
      const lines = this.lineBuffer.split('\n')
      this.lineBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const msg = JSON.parse(trimmed) as SidecarMessage
          this.dispatch(msg)
        } catch {
          console.warn('[sidecar] Failed to parse line:', trimmed)
        }
      }
    })

    this.process.stderr?.setEncoding('utf8')
    this.process.stderr?.on('data', (chunk: string) => {
      console.warn('[sidecar] stderr:', chunk.trim())
    })

    this.process.on('exit', (code) => {
      console.warn(`[sidecar] Process exited (code ${code})`)
      this.ready = false
      this.process = null
      this.emit('exit', code)

      const now = Date.now()
      this.crashTimestamps = this.crashTimestamps.filter((t) => now - t < CRASH_WINDOW_MS)
      this.crashTimestamps.push(now)

      if (this.crashTimestamps.length >= MAX_CRASHES) {
        this.disabled = true
        console.error('[sidecar] Crashed too many times — disabling until app restart.')
        this.emit('error', new Error('Voice sidecar crashed repeatedly and has been disabled.'))
        return
      }

      // Auto-restart with a short delay
      setTimeout(() => {
        if (!this.disabled) this.start()
      }, 1500)
    })
  }

  stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.ready = false
  }

  sendCommand(cmd: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) return
    try {
      this.process.stdin.write(JSON.stringify(cmd) + '\n')
    } catch (err) {
      console.warn('[sidecar] Failed to send command:', err)
    }
  }

  /** Register a listener for messages from a specific module (e.g. 'stt', 'wake'). */
  onModule(module: string, listener: ModuleListener): () => void {
    let listeners = this.moduleListeners.get(module)
    if (!listeners) {
      listeners = new Set()
      this.moduleListeners.set(module, listeners)
    }
    listeners.add(listener)
    return () => {
      this.moduleListeners.get(module)?.delete(listener)
    }
  }

  private dispatch(msg: SidecarMessage): void {
    const module = msg.module

    if (module === 'sidecar' && msg.type === 'started') {
      this.ready = true
      this.emit('ready')
      return
    }

    if (module === 'pong') {
      this.emit('pong')
      return
    }

    const listeners = this.moduleListeners.get(module)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(msg)
        } catch (err) {
          console.error(`[sidecar] Listener error for module '${module}':`, err)
        }
      }
    }
  }

  private resolvePythonPath(): string | null {
    // Production: frozen executable sits next to the sidecar script.
    const frozenExe = app.isPackaged
      ? join(process.resourcesPath, 'sidecar', 'voice_sidecar.exe')
      : null

    if (frozenExe && existsSync(frozenExe)) return frozenExe

    // Development: look for a venv Python, then fall back to system Python.
    const venvPaths = [
      join(app.getAppPath(), 'resources/sidecar/.venv/Scripts/python.exe'), // Windows venv
      join(app.getAppPath(), 'resources/sidecar/.venv/bin/python'), // Unix venv
    ]
    for (const p of venvPaths) {
      if (existsSync(p)) return p
    }

    // Fall back to system Python
    for (const name of ['python3', 'python']) {
      try {
        const result = (
          execSync(`where ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) as string
        ).trim()
        const first = result.split('\n')[0]
        if (first) return first.trim()
      } catch {
        // Not found — try next
      }
    }

    return null
  }

  private resolveScriptPath(): string | null {
    // Production uses the frozen exe — script path is irrelevant (the exe is self-contained).
    const frozenExe = app.isPackaged
      ? join(process.resourcesPath, 'sidecar', 'voice_sidecar.exe')
      : null
    if (frozenExe && existsSync(frozenExe)) return frozenExe

    // Development
    const scriptPath = join(app.getAppPath(), 'resources/sidecar/voice_sidecar.py')
    return existsSync(scriptPath) ? scriptPath : null
  }
}
