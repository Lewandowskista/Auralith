import { randomUUID } from 'crypto'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { WhisperClient } from './whisper-client'
import { PttManager } from './ptt-manager'
import { TtsService } from './tts-service'
import { WakeWordService } from './wake-word-service'
import { VadService } from './vad-service'
import type { SettingsRepo } from '@auralith/core-db'
import type Database from 'better-sqlite3'
import { z } from 'zod'

type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking'

type OrchDeps = {
  settingsRepo: SettingsRepo
  sqlite: Database.Database
  /** Called when a final transcript is ready to be sent as an assistant message */
  sendToAssistant: (text: string) => Promise<{ messageId: string }>
  /** Broadcast to all renderer windows */
  broadcast: (channel: string, data: unknown) => void
}

export class VoiceOrchestrator {
  private whisper: WhisperClient
  private ptt: PttManager
  private tts: TtsService
  private wakeWord: WakeWordService
  private vad: VadService
  private deps: OrchDeps
  private state: VoiceState = 'idle'
  private activeSessions = new Map<string, { startedAt: number }>()
  private enabled = false
  private vadAutoStopSession: string | null = null
  private pttSessionId: string | null = null
  private insertTranscript:
    | ((row: {
        id: string
        ts: number
        durationMs: number
        text: string
        routedTo?: string
      }) => void)
    | null = null

  constructor(deps: OrchDeps) {
    this.deps = deps
    this.whisper = new WhisperClient()
    this.tts = new TtsService()
    this.wakeWord = new WakeWordService()
    this.vad = new VadService()

    // Wake word detection triggers a capture start (same as PTT)
    this.wakeWord.on('detected', () => {
      if (this.enabled && this.state === 'idle') {
        void this.startCapture()
      }
    })

    // VAD: auto-stop when silence detected after speech (natural endpointing)
    this.vad.on('speech-end', () => {
      if (this.state === 'listening' && this.vadAutoStopSession) {
        const sid = this.vadAutoStopSession
        this.vadAutoStopSession = null
        this.vad.stop()
        void this.stopCapture(sid)
      }
    })

    this.ptt = new PttManager({
      onStart: () => {
        // Barge-in: cancel TTS when PTT pressed while speaking
        if (this.state === 'speaking') {
          this.cancelSpeech()
        }
        void this.handlePttStart()
      },
      onStop: () => void this.handlePttStop(),
      onStateChange: (s) => {
        if (s === 'idle') {
          this.setState('idle')
        }
      },
    })

    this.whisper.setOnDisabled((reason) => {
      this.deps.broadcast('voice:error', { message: reason })
      this.setState('idle')
    })

    this.whisper.setOnPartialBroadcast((text) => {
      this.deps.broadcast('voice:partial', { text })
    })

    // Wire up transcript insert statement once sqlite is available
    try {
      const stmt = deps.sqlite.prepare(
        'INSERT INTO voice_transcripts(id,ts,duration_ms,text,routed_to) VALUES(?,?,?,?,?)',
      )
      this.insertTranscript = (row) => {
        stmt.run(row.id, row.ts, row.durationMs, row.text, row.routedTo ?? null)
      }
    } catch {
      // table not yet created — will be available after first migration
    }
  }

  // ─── Public API (used by IPC handler) ─────────────────────────────────────

  getStatus() {
    const micGranted = this.deps.settingsRepo.get('voice.micGranted', z.boolean()) ?? false
    return {
      enabled: this.enabled,
      sttReady: this.whisper.ready,
      ttsReady: this.tts.available,
      micGranted,
      state: this.state,
    }
  }

  async startCapture(): Promise<{ sessionId: string }> {
    if (!this.enabled) throw new Error('Voice is not enabled')
    if (this.whisper.isDisabled) throw new Error('Whisper is disabled due to crashes')
    if (this.state !== 'idle') throw new Error(`Cannot start capture in state: ${this.state}`)

    const sessionId = randomUUID()
    this.activeSessions.set(sessionId, { startedAt: Date.now() })

    this.whisper.ensureRunning()
    this.setState('listening')
    this.deps.broadcast('voice:state', { state: 'listening', sessionId })

    // Start VAD for natural endpointing if enabled
    const vadEnabled = this.deps.settingsRepo.get('voice.vadEnabled', z.boolean()) ?? false
    if (vadEnabled) {
      this.vadAutoStopSession = sessionId
      this.vad.start()
    }

    return { sessionId }
  }

  async stopCapture(sessionId: string): Promise<{ transcript: string; autoSent: boolean }> {
    const session = this.activeSessions.get(sessionId)
    if (!session) throw new Error('No active capture session')

    this.setState('transcribing')
    this.deps.broadcast('voice:state', { state: 'transcribing', sessionId })

    try {
      const { text } = await this.whisper.finalize()
      const durationMs = Date.now() - session.startedAt
      this.activeSessions.delete(sessionId)

      this.deps.broadcast('voice:final', { text, sessionId })

      if (text.trim().length > 0) {
        // Persist transcript
        this.insertTranscript?.({
          id: randomUUID(),
          ts: Date.now(),
          durationMs,
          text,
          routedTo: 'assistant',
        })

        // Route to assistant
        void this.deps.sendToAssistant(text)
        this.setState('idle')
        this.deps.broadcast('voice:state', { state: 'idle', sessionId })
        return { transcript: text, autoSent: true }
      }

      this.setState('idle')
      this.deps.broadcast('voice:state', { state: 'idle', sessionId })
      return { transcript: '', autoSent: false }
    } catch (err) {
      this.activeSessions.delete(sessionId)
      this.setState('idle')
      const message = err instanceof Error ? err.message : 'Transcription failed'
      this.deps.broadcast('voice:error', { message, sessionId })
      throw err
    }
  }

  async cancelCapture(sessionId: string): Promise<void> {
    this.activeSessions.delete(sessionId)
    this.whisper.abort()
    if (this.vadAutoStopSession === sessionId) {
      this.vadAutoStopSession = null
      this.vad.stop()
    }
    this.setState('idle')
    this.deps.broadcast('voice:state', { state: 'idle', sessionId })
  }

  pushAudioChunk(sessionId: string, pcm16Base64: string): void {
    if (!this.activeSessions.has(sessionId)) return
    const pcm16 = Buffer.from(pcm16Base64, 'base64')
    if (pcm16.length === 0) return
    this.whisper.pushChunk(pcm16)
    if (this.vadAutoStopSession === sessionId) {
      this.vad.push(pcm16)
    }
  }

  async speak(text: string, voiceId?: string, rate?: number): Promise<void> {
    if (!this.tts.available) return
    const prevState = this.state
    this.setState('speaking')
    this.deps.broadcast('voice:state', { state: 'speaking' })
    try {
      await this.tts.speak(text, voiceId, rate)
    } finally {
      // Only return to idle if we didn't transition to something else mid-speech
      if (this.state === 'speaking') {
        this.setState(prevState === 'speaking' ? 'idle' : prevState)
        this.deps.broadcast('voice:state', { state: this.state })
      }
    }
  }

  cancelSpeech(): void {
    this.tts.cancel()
    if (this.state === 'speaking') {
      this.setState('idle')
      this.deps.broadcast('voice:state', { state: 'idle' })
    }
  }

  async listTtsVoices() {
    return this.tts.listVoices()
  }

  listSttModels(): Array<{ id: string; name: string; sizeBytes: number; installed: boolean }> {
    const resourcesDir = app.isPackaged
      ? join(process.resourcesPath, 'whisper')
      : join(app.getAppPath(), '../../resources/whisper')

    return [
      {
        id: 'tiny.en',
        name: 'Tiny (English, ~40 MB)',
        sizeBytes: 40_000_000,
        installed: existsSync(join(resourcesDir, 'ggml-tiny.en-q5_1.bin')),
      },
      {
        id: 'base.en',
        name: 'Base (English, ~145 MB)',
        sizeBytes: 145_000_000,
        installed: existsSync(join(resourcesDir, 'ggml-base.en-q5_1.bin')),
      },
      {
        id: 'small.en',
        name: 'Small (English, ~500 MB)',
        sizeBytes: 500_000_000,
        installed: existsSync(join(resourcesDir, 'ggml-small.en-q5_1.bin')),
      },
    ]
  }

  async downloadSttModel(modelId: string): Promise<void> {
    // In production this would stream-download the model with progress events.
    // For now, we just broadcast a "not available" error — actual model files
    // are bundled at build time via electron-builder extraResources.
    this.deps.broadcast('voice:model-progress', {
      modelId,
      error:
        'Model downloads must be performed at build time. Bundle the model file in resources/whisper/.',
    })
    throw new Error('Online model download not yet implemented — bundle model with installer.')
  }

  async setEnabled(enabled: boolean): Promise<{ conflict: boolean }> {
    if (this.enabled === enabled) return { conflict: false }

    if (enabled) {
      const modelId = this.deps.settingsRepo.get('voice.sttModel', z.string()) ?? 'base.en'
      const resourcesDir = app.isPackaged
        ? join(process.resourcesPath, 'whisper')
        : join(app.getAppPath(), '../../resources/whisper')
      const modelPath = join(resourcesDir, `ggml-${modelId}-q5_1.bin`)
      this.whisper.setModelPath(modelPath)

      const binding =
        this.deps.settingsRepo.get('voice.pttBinding', z.string()) ?? 'CommandOrControl+Shift+Space'
      const { conflict } = this.ptt.enable(binding)
      if (conflict) {
        return { conflict: true }
      }
      this.enabled = true
      this.deps.settingsRepo.set('voice.enabled', true)
    } else {
      this.ptt.disable()
      this.whisper.abort()
      this.enabled = false
      this.deps.settingsRepo.set('voice.enabled', false)
      this.setState('idle')
    }
    return { conflict: false }
  }

  setPttBinding(binding: string): { conflict: boolean } {
    const result = this.ptt.updateBinding(binding)
    if (!result.conflict) {
      this.deps.settingsRepo.set('voice.pttBinding', binding)
    }
    return result
  }

  getSettings(): {
    sttModel: string
    ttsVoiceId: string | null
    speakBriefings: boolean
    speakSuggestionConfirmations: boolean
    wakeWordEnabled: boolean
    conversationMode: boolean
    wakeWordSensitivity: 'low' | 'medium' | 'high'
  } {
    return {
      sttModel: this.deps.settingsRepo.get('voice.sttModel', z.string()) ?? 'base.en',
      ttsVoiceId: this.deps.settingsRepo.get('voice.ttsVoiceId', z.string().nullable()) ?? null,
      speakBriefings: this.deps.settingsRepo.get('voice.speakBriefings', z.boolean()) ?? true,
      speakSuggestionConfirmations:
        this.deps.settingsRepo.get('voice.speakSuggestionConfirmations', z.boolean()) ?? false,
      wakeWordEnabled: this.deps.settingsRepo.get('voice.wakeWordEnabled', z.boolean()) ?? false,
      conversationMode: this.deps.settingsRepo.get('voice.conversationMode', z.boolean()) ?? false,
      wakeWordSensitivity:
        (this.deps.settingsRepo.get('voice.wakeWordSensitivity', z.string()) as
          | 'low'
          | 'medium'
          | 'high') ?? 'medium',
    }
  }

  setSettings(opts: {
    sttModel?: string
    ttsVoiceId?: string | null
    speakBriefings?: boolean
    speakSuggestionConfirmations?: boolean
    wakeWordEnabled?: boolean
    conversationMode?: boolean
    wakeWordSensitivity?: 'low' | 'medium' | 'high'
    vadEnabled?: boolean
    vadThreshold?: number
  }): void {
    if (opts.sttModel !== undefined) this.deps.settingsRepo.set('voice.sttModel', opts.sttModel)
    if (opts.ttsVoiceId !== undefined)
      this.deps.settingsRepo.set('voice.ttsVoiceId', opts.ttsVoiceId)
    if (opts.speakBriefings !== undefined)
      this.deps.settingsRepo.set('voice.speakBriefings', opts.speakBriefings)
    if (opts.speakSuggestionConfirmations !== undefined)
      this.deps.settingsRepo.set(
        'voice.speakSuggestionConfirmations',
        opts.speakSuggestionConfirmations,
      )

    if (opts.wakeWordEnabled !== undefined) {
      this.deps.settingsRepo.set('voice.wakeWordEnabled', opts.wakeWordEnabled)
      if (opts.wakeWordEnabled && this.enabled) {
        const sensitivity =
          (this.deps.settingsRepo.get('voice.wakeWordSensitivity', z.string()) as
            | 'low'
            | 'medium'
            | 'high') ?? 'medium'
        this.wakeWord.enable(sensitivity)
      } else {
        this.wakeWord.disable()
      }
    }

    if (opts.conversationMode !== undefined) {
      this.deps.settingsRepo.set('voice.conversationMode', opts.conversationMode)
    }

    if (opts.wakeWordSensitivity !== undefined) {
      this.deps.settingsRepo.set('voice.wakeWordSensitivity', opts.wakeWordSensitivity)
      if (this.wakeWord.isEnabled) {
        this.wakeWord.setSensitivity(opts.wakeWordSensitivity)
      }
    }

    if (opts.vadEnabled !== undefined) {
      this.deps.settingsRepo.set('voice.vadEnabled', opts.vadEnabled)
    }
    if (opts.vadThreshold !== undefined) {
      this.deps.settingsRepo.set('voice.vadThreshold', opts.vadThreshold)
      this.vad.setThreshold(opts.vadThreshold)
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private setState(s: VoiceState): void {
    this.state = s
  }

  private async handlePttStart(): Promise<void> {
    try {
      const { sessionId } = await this.startCapture()
      this.pttSessionId = sessionId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start voice capture'
      this.deps.broadcast('voice:error', { message })
      this.ptt.setState('idle')
    }
  }

  private async handlePttStop(): Promise<void> {
    const sessionId = this.pttSessionId
    this.pttSessionId = null
    if (!sessionId) {
      this.setState('idle')
      this.deps.broadcast('voice:state', { state: 'idle' })
      this.ptt.setState('idle')
      return
    }

    try {
      await this.stopCapture(sessionId)
    } catch {
      // stopCapture already broadcasts the concrete error.
    } finally {
      // Always reset PTT state so the next press works
      this.ptt.setState('idle')
    }
  }

  /** Called by the briefing job when voice.speakBriefings is on */
  async maybeSpeakBriefing(text: string): Promise<void> {
    if (!this.enabled || !this.tts.available) return
    const speakBriefings = this.deps.settingsRepo.get('voice.speakBriefings', z.boolean()) ?? true
    if (!speakBriefings) return
    const voiceId =
      this.deps.settingsRepo.get('voice.ttsVoiceId', z.string().nullable()) ?? undefined
    await this.speak(text, voiceId ?? undefined)
  }

  dispose(): void {
    this.ptt.dispose()
    this.whisper.dispose()
    this.tts.cancel()
    this.wakeWord.dispose()
    this.vad.stop()
    this.vad.removeAllListeners()
  }
}
