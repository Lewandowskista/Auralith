import { utilityProcess, app } from 'electron'
import type { UtilityProcess } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { SidecarManager } from './sidecar-manager'

export type WordTimestamp = { word: string; start: number; end: number }

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

  // Sidecar delegation
  private sidecarManager: SidecarManager | null = null
  private sidecarChunkBuffer: Buffer[] = []
  private lastWordTimestamps: WordTimestamp[] = []
  private sidecarUnsubscribe: (() => void) | null = null

  setOnDisabled(cb: (reason: string) => void): void {
    this.onDisabled = cb
  }

  setOnPartialBroadcast(cb: (text: string) => void): void {
    this.onPartialBroadcast = cb
  }

  setSidecarManager(manager: SidecarManager): void {
    this.sidecarManager = manager
  }

  /** Word-level timestamps from the last faster-whisper transcription (sidecar path only). */
  getWordTimestamps(): WordTimestamp[] {
    return this.lastWordTimestamps
  }

  get ready(): boolean {
    if (this.disabled) return false
    // Ready if sidecar is available, or if the worker process is running
    return (this.sidecarManager?.ready ?? false) || (this.proc !== null && this.modelPath !== '')
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
      : join(app.getAppPath(), 'resources/whisper')
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

  /**
   * Re-enables STT after a crash-induced disable.
   * Resets the crash counter so the worker gets a fresh window.
   */
  reenable(): void {
    this.disabled = false
    this.crashTimes = []
  }

  ensureRunning(): void {
    if (this.disabled) throw new Error('Whisper is disabled due to repeated crashes')
    // When sidecar is available, no worker process is needed
    if (this.sidecarManager?.ready) return
    if (!this.proc) {
      this.spawnWorker()
    }
  }

  pushChunk(pcm16: Buffer): void {
    // Always buffer for sidecar path
    if (this.sidecarManager?.ready) {
      this.sidecarChunkBuffer.push(pcm16)
      return
    }
    if (!this.proc) return
    this.send({ type: 'chunk', pcm16Base64: pcm16.toString('base64') })
  }

  finalize(): Promise<{ text: string }> {
    // ── Sidecar path (faster-whisper) ──────────────────────────────────────
    if (this.sidecarManager?.ready) {
      return this.finalizeViaSidecar()
    }

    // ── Worker path (whisper.cpp) ──────────────────────────────────────────
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

  private finalizeViaSidecar(): Promise<{ text: string }> {
    return new Promise((resolve, reject) => {
      const sidecar = this.sidecarManager
      if (!sidecar) {
        reject(new Error('Sidecar STT is not available'))
        return
      }
      const id = randomUUID()

      // Concatenate all buffered PCM chunks, base64-encode
      const allPcm = Buffer.concat(this.sidecarChunkBuffer)
      this.sidecarChunkBuffer = []

      const timeoutMs = 30_000
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        unsub()
        reject(new Error('Sidecar STT timed out'))
      }, timeoutMs)

      const unsub = sidecar.onModule('stt', (msg) => {
        if (msg['id'] !== id) return
        if (settled) return
        if (msg.type === 'result') {
          settled = true
          clearTimeout(timer)
          unsub()
          const text = (msg['text'] as string | undefined) ?? ''
          const words = (msg['words'] as WordTimestamp[] | undefined) ?? []
          this.lastWordTimestamps = words
          resolve({ text })
        } else if (msg.type === 'error') {
          settled = true
          clearTimeout(timer)
          unsub()
          reject(new Error((msg['message'] as string | undefined) ?? 'Sidecar STT error'))
        }
      })

      sidecar.sendCommand({
        module: 'stt',
        cmd: 'transcribe',
        id,
        audio_b64: allPcm.toString('base64'),
      })
    })
  }

  abort(): void {
    this.sidecarChunkBuffer = []
    this.callbacks = null
    this.stopWorker()
  }

  dispose(): void {
    this.stopWorker()
  }
}
