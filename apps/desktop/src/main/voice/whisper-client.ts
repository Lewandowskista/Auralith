import { utilityProcess, app } from 'electron'
import type { UtilityProcess } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

type WorkerMsg =
  | { type: 'ready' }
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string }
  | { type: 'error'; message: string }
  | { type: 'pong' }

type TranscriptionCallbacks = {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
}

const IDLE_TIMEOUT_MS = 60_000
const MAX_CRASH_BACKOFF_MS = 30_000
const CRASH_COUNT_WINDOW_MS = 60_000
const MAX_CRASHES_IN_WINDOW = 3

export class WhisperClient {
  private proc: UtilityProcess | null = null
  private modelPath = ''
  private callbacks: TranscriptionCallbacks | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private crashTimes: number[] = []
  private disabled = false
  private onDisabled?: (reason: string) => void
  private onPartialBroadcast?: (text: string) => void

  setOnDisabled(cb: (reason: string) => void): void {
    this.onDisabled = cb
  }

  setOnPartialBroadcast(cb: (text: string) => void): void {
    this.onPartialBroadcast = cb
  }

  get ready(): boolean {
    return !this.disabled && this.proc !== null && this.modelPath !== ''
  }

  get isDisabled(): boolean {
    return this.disabled
  }

  setModelPath(path: string): void {
    this.modelPath = path
  }

  private getWorkerPath(): string {
    return join(__dirname, 'workers/whisper/index.js')
  }

  private getWhisperBinPath(): string {
    const resourcesDir = app.isPackaged
      ? join(process.resourcesPath, 'whisper')
      : join(app.getAppPath(), '../../resources/whisper')
    return join(resourcesDir, 'whisper.exe')
  }

  private spawnWorker(): void {
    const workerPath = this.getWorkerPath()
    if (!existsSync(workerPath) && !workerPath.endsWith('.ts')) {
      console.warn('[whisper-client] worker path not found:', workerPath)
    }

    this.proc = utilityProcess.fork(workerPath, [], {
      serviceName: 'whisper-stt',
      stdio: 'pipe',
    })

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      console.warn('[whisper-client:worker stdout]', chunk.toString('utf8').trim())
    })

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      console.error('[whisper-client:worker stderr]', chunk.toString('utf8').trim())
    })

    this.proc.on('message', (msg: WorkerMsg) => {
      switch (msg.type) {
        case 'ready':
          this.resetIdleTimer()
          break
        case 'partial':
          this.onPartialBroadcast?.(msg.text)
          this.callbacks?.onPartial(msg.text)
          break
        case 'final':
          this.callbacks?.onFinal(msg.text)
          this.callbacks = null
          this.resetIdleTimer()
          break
        case 'error':
          this.callbacks?.onError(msg.message)
          this.callbacks = null
          this.resetIdleTimer()
          break
        case 'pong':
          break
      }
    })

    this.proc.on('exit', (code) => {
      this.proc = null
      if (code !== 0 && code !== null) {
        this.handleCrash()
      }
    })

    // Load model immediately after spawning
    if (this.modelPath) {
      this.send({ type: 'load', modelPath: this.modelPath, binPath: this.getWhisperBinPath() })
    }
  }

  private handleCrash(): void {
    const now = Date.now()
    this.crashTimes = this.crashTimes.filter((t) => now - t < CRASH_COUNT_WINDOW_MS)
    this.crashTimes.push(now)

    if (this.crashTimes.length >= MAX_CRASHES_IN_WINDOW) {
      this.disabled = true
      const reason = `whisper worker crashed ${MAX_CRASHES_IN_WINDOW}× in ${CRASH_COUNT_WINDOW_MS / 1000}s — voice disabled until restart`
      console.error('[whisper-client]', reason)
      this.callbacks?.onError(reason)
      this.callbacks = null
      this.onDisabled?.(reason)
      return
    }

    // Backoff and restart
    const backoff = Math.min(this.crashTimes.length * 2000, MAX_CRASH_BACKOFF_MS)
    console.warn(`[whisper-client] worker crashed, restarting in ${backoff}ms`)
    setTimeout(() => {
      if (!this.disabled) this.spawnWorker()
    }, backoff)
  }

  private send(msg: object): void {
    this.proc?.postMessage(msg)
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.stopWorker()
    }, IDLE_TIMEOUT_MS)
  }

  private stopWorker(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
  }

  ensureRunning(): void {
    if (this.disabled) throw new Error('Whisper is disabled due to repeated crashes')
    if (!this.proc) {
      this.spawnWorker()
    }
  }

  pushChunk(pcm16: Buffer): void {
    if (!this.proc) return
    this.send({ type: 'chunk', pcm16Base64: pcm16.toString('base64') })
  }

  finalize(): Promise<{ text: string }> {
    return new Promise((resolve, reject) => {
      if (!this.proc) {
        reject(new Error('Whisper worker not running'))
        return
      }

      this.callbacks = {
        onPartial: () => {},
        onFinal: (text) => resolve({ text }),
        onError: (message) => reject(new Error(message)),
      }

      this.send({ type: 'end' })
    })
  }

  abort(): void {
    this.callbacks = null
    this.stopWorker()
  }

  dispose(): void {
    this.stopWorker()
  }
}
