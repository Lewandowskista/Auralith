import { utilityProcess, app, webContents } from 'electron'
import type { UtilityProcess } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { listInstalledPiperVoices, resolvePiperVoicePath } from './piper-voice-catalogue'
import type { TtsVoice } from '@auralith/core-voice'

type PiperWorkerOut =
  | { type: 'ready' }
  | { type: 'pcm'; id: string; chunk: number[]; sampleRate: number }
  | { type: 'done'; id: string }
  | { type: 'error'; id?: string; message: string }
  | { type: 'pong' }

type QueueEntry = {
  id: string
  text: string
  lengthScale?: number
  resolve: () => void
  reject: (err: Error) => void
}

const IDLE_TIMEOUT_MS = 120_000

export class PiperTtsService extends EventEmitter {
  private proc: UtilityProcess | null = null
  private queue: QueueEntry[] = []
  private speaking = false
  private cancelFlag = false
  private currentVoiceId: string | null = null
  private currentSampleRate = 22050
  private _available = false
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  // Pending resolve/reject keyed by synthesis id
  private pending = new Map<string, { resolve: () => void; reject: (e: Error) => void }>()

  // Playback completion resolvers keyed by synthesis id (resolved when renderer buffer drains)
  private playbackResolvers = new Map<string, () => void>()

  constructor() {
    super()
    this._available = this.checkBinaryExists()
  }

  get available(): boolean {
    return this._available
  }

  private checkBinaryExists(): boolean {
    return existsSync(this.getBinPath())
  }

  private getBinPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'piper', 'piper.exe')
      : join(app.getAppPath(), 'resources/piper/piper.exe')
  }

  private getWorkerPath(): string {
    return join(__dirname, 'workers/piper/index.js')
  }

  private spawnWorker(): boolean {
    if (this.proc) return true
    const workerPath = this.getWorkerPath()
    if (!existsSync(workerPath) && !workerPath.endsWith('.ts')) {
      return false
    }

    this.proc = utilityProcess.fork(workerPath, [], {
      serviceName: 'piper-tts',
      stdio: 'pipe',
    })

    this.proc.on('message', (msg: PiperWorkerOut) => {
      switch (msg.type) {
        case 'ready':
          this.resetIdleTimer()
          break

        case 'pcm': {
          // Forward raw PCM to all renderer windows via broadcast channel
          const buf = Buffer.from(msg.chunk)
          for (const wc of webContents.getAllWebContents()) {
            if (!wc.isDestroyed()) {
              wc.send('voice:tts-pcm', {
                id: msg.id,
                chunk: buf.toString('base64'),
                sampleRate: msg.sampleRate,
              })
            }
          }
          break
        }

        case 'done': {
          const entry = this.pending.get(msg.id)
          if (entry) {
            this.pending.delete(msg.id)
            entry.resolve()
          }
          this.resetIdleTimer()
          break
        }

        case 'error': {
          const entry = msg.id ? this.pending.get(msg.id) : null
          if (entry && msg.id) {
            this.pending.delete(msg.id)
            entry.reject(new Error(msg.message))
          }
          console.error('[piper-tts]', msg.message)
          this.resetIdleTimer()
          break
        }

        case 'pong':
          break
      }
    })

    this.proc.on('exit', () => {
      this.proc = null
      // Reject any pending synthesis
      for (const [, entry] of this.pending) {
        entry.reject(new Error('piper worker exited unexpectedly'))
      }
      this.pending.clear()
    })

    // Tell worker the binary path
    this.proc.postMessage({ type: 'setBinPath', binPath: this.getBinPath() })
    return true
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

  /** Pre-warm the worker with the given voice so first utterance has no cold-start. */
  async prewarm(voiceId: string): Promise<void> {
    if (!this._available) return
    const modelPath = resolvePiperVoicePath(voiceId)
    if (!modelPath) return

    if (!this.spawnWorker()) return
    await this.setVoice(voiceId)
  }

  async setVoice(voiceId: string): Promise<void> {
    const modelPath = resolvePiperVoicePath(voiceId)
    if (!modelPath) throw new Error(`Piper voice not installed: ${voiceId}`)

    if (!this.spawnWorker()) throw new Error('Failed to spawn piper worker')

    // Parse sample rate from voice JSON
    const jsonPath = `${modelPath}.json`
    let sampleRate = 22050
    if (existsSync(jsonPath)) {
      try {
        const meta = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
          audio?: { sample_rate?: number }
        }
        sampleRate = meta.audio?.sample_rate ?? 22050
      } catch {
        /* ignore */
      }
    }

    this.currentVoiceId = voiceId
    this.currentSampleRate = sampleRate

    this.proc?.postMessage({
      type: 'setVoice',
      modelPath,
      sampleRate,
      binPath: this.getBinPath(),
    })
  }

  async speak(text: string, voiceId?: string, lengthScale?: number): Promise<void> {
    if (!this._available) throw new Error('Piper TTS not available')

    if (voiceId && voiceId !== this.currentVoiceId) {
      await this.setVoice(voiceId)
    } else if (!this.currentVoiceId) {
      // Fall back to first installed voice
      const voices = listInstalledPiperVoices()
      const firstVoice = voices[0]
      if (!firstVoice) throw new Error('No Piper voices installed')
      await this.setVoice(firstVoice.id)
    }

    return new Promise((resolve, reject) => {
      const entry: QueueEntry = { id: randomUUID(), text, resolve, reject }
      if (lengthScale !== undefined) entry.lengthScale = lengthScale
      this.queue.push(entry)
      if (!this.speaking) void this.drainQueue()
    })
  }

  cancel(): void {
    this.cancelFlag = true
    // Cancel all queued items
    for (const entry of this.queue) {
      if (this.proc) {
        this.proc.postMessage({ type: 'cancel', id: entry.id })
      }
      entry.resolve()
    }
    this.queue = []

    // Cancel any currently-pending synthesis in the worker
    for (const [id, entry] of this.pending) {
      if (this.proc) {
        this.proc.postMessage({ type: 'cancel', id })
      }
      entry.resolve()
    }
    this.pending.clear()

    // Tell renderers to flush their audio buffers
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) {
        wc.send('voice:tts-cancel', {})
      }
    }
  }

  async listVoices(): Promise<TtsVoice[]> {
    return listInstalledPiperVoices()
  }

  private async drainQueue(): Promise<void> {
    this.speaking = true
    while (this.queue.length > 0) {
      const entry = this.queue.shift()
      if (!entry) break
      if (this.cancelFlag) {
        entry.resolve()
        this.cancelFlag = false
        continue
      }
      try {
        await this.synthesizeOne(entry)
        entry.resolve()
      } catch (err) {
        entry.reject(err instanceof Error ? err : new Error('Piper TTS error'))
      }
    }
    this.speaking = false
    this.cancelFlag = false
  }

  private synthesizeOne(entry: QueueEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.proc) {
        if (!this.spawnWorker()) {
          reject(new Error('Failed to start piper worker'))
          return
        }
      }

      this.pending.set(entry.id, { resolve, reject })
      this.proc?.postMessage({
        type: 'synthesize',
        id: entry.id,
        text: entry.text,
        lengthScale: entry.lengthScale,
      })

      // Emit so orchestrator can transition to speaking state
      this.emit('speak-start', entry.id)
    })
  }

  /**
   * Start synthesis of a text chunk without blocking on playback completion.
   * Returns two promises:
   *   pcmDone    — resolves when all PCM has been sent to the renderer (synthesis done)
   *   playbackDone — resolves when the renderer's ring buffer drains for this synthesis id
   *
   * playbackDone is resolved by notifyPlaybackDone() called from the IPC handler
   * when the renderer sends back voice:tts-buffer-empty with matching id.
   */
  synthesizeAsync(
    text: string,
    voiceId?: string,
    lengthScale?: number,
  ): { id: string; pcmDone: Promise<void>; playbackDone: Promise<void> } {
    const id = randomUUID()

    let resolvePcm!: () => void
    let rejectPcm!: (e: Error) => void
    const pcmDone = new Promise<void>((res, rej) => {
      resolvePcm = res
      rejectPcm = rej
    })

    let resolvePlayback!: () => void
    const playbackDone = new Promise<void>((res) => {
      resolvePlayback = res
    })

    this.playbackResolvers.set(id, resolvePlayback)

    // Kick off voice setup and synthesis without awaiting here
    void (async () => {
      try {
        if (voiceId && voiceId !== this.currentVoiceId) {
          await this.setVoice(voiceId)
        } else if (!this.currentVoiceId) {
          const voices = listInstalledPiperVoices()
          const firstVoice = voices[0]
          if (!firstVoice) throw new Error('No Piper voices installed')
          await this.setVoice(firstVoice.id)
        }

        if (!this.proc && !this.spawnWorker()) throw new Error('Failed to start piper worker')

        await new Promise<void>((resolve, reject) => {
          this.pending.set(id, { resolve, reject })
          this.proc?.postMessage({ type: 'synthesize', id, text, lengthScale })
          this.emit('speak-start', id)
        })

        resolvePcm()
      } catch (err) {
        this.playbackResolvers.delete(id)
        resolvePlayback() // don't leave caller hanging
        rejectPcm(err instanceof Error ? err : new Error('Piper synthesis error'))
      }
    })()

    return { id, pcmDone, playbackDone }
  }

  /** Called by the IPC handler when the renderer reports that a synthesis id's buffer drained. */
  notifyPlaybackDone(id: string): void {
    const resolve = this.playbackResolvers.get(id)
    if (resolve) {
      this.playbackResolvers.delete(id)
      resolve()
    }
  }

  dispose(): void {
    this.cancel()
    this.stopWorker()
  }
}
