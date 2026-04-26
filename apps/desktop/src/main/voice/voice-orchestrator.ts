import { randomUUID } from 'crypto'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { WhisperClient } from './whisper-client'
import { PttManager } from './ptt-manager'
import { TtsFacade } from './tts-facade'
import { WakeWordService } from './wake-word-service'
import { VadService } from './vad-service'
import { StreamingTtsBuffer } from './streaming-tts-buffer'
import {
  createConversationSession,
  clearSessionTimers,
  touchSession,
  type VoiceConversationSession,
  type VoiceConvState,
} from './conversation-session'
import {
  listInstalledPiperVoices,
  listAvailablePiperVoices,
  downloadPiperVoice,
  deletePiperVoice,
  type VoiceDownloadProgress,
} from './piper-voice-catalogue'
import type { SettingsRepo } from '@auralith/core-db'
import type Database from 'better-sqlite3'
import { z } from 'zod'

// Public state emitted to renderers (superset of internal VoiceConvState)
type PublicVoiceState = VoiceConvState

const EXIT_PHRASES = new Set(['stop conversation', 'end conversation', 'stop', 'goodbye', 'bye'])

type OrchDeps = {
  settingsRepo: SettingsRepo
  sqlite: Database.Database
  /** Called when a final transcript is ready to be sent as an assistant message */
  sendToAssistant: (
    text: string,
    conversationId: string,
    onSpeakChunk?: (chunk: string) => void,
  ) => Promise<{ messageId: string }>
  /** Broadcast to all renderer windows */
  broadcast: (channel: string, data: unknown) => void
}

export class VoiceOrchestrator {
  private whisper: WhisperClient
  private ptt: PttManager
  private tts: TtsFacade
  private wakeWord: WakeWordService
  private vad: VadService
  private deps: OrchDeps
  private state: PublicVoiceState = 'idle'
  private activeSessions = new Map<string, { startedAt: number }>()
  private enabled = false
  private vadAutoStopSession: string | null = null
  private pttSessionId: string | null = null

  // Active conversation (null when not in conversationMode)
  private conversation: VoiceConversationSession | null = null

  private insertTranscript:
    | ((row: {
        id: string
        ts: number
        durationMs: number
        text: string
        routedTo?: string
        voiceConversationId?: string
      }) => void)
    | null = null

  constructor(deps: OrchDeps) {
    this.deps = deps
    this.whisper = new WhisperClient()
    this.tts = new TtsFacade()
    this.wakeWord = new WakeWordService()

    // Forward piper fallback toast to renderer
    this.tts.on('piper-fallback', (message: string) => {
      this.deps.broadcast('voice:warning', {
        message: `Neural voice failed, using fallback: ${message}`,
      })
    })
    this.vad = new VadService()

    // Wake word detection triggers a capture start (same as PTT)
    this.wakeWord.on('detected', () => {
      if (this.enabled && this.state === 'idle') {
        void this.startCapture().catch((err) =>
          console.error('[voice] startCapture (wake-word) failed:', err),
        )
      }
    })

    // VAD: auto-stop when silence detected after speech (natural endpointing)
    this.vad.on('speech-end', () => {
      if (this.state === 'listening' && this.vadAutoStopSession) {
        const sid = this.vadAutoStopSession
        this.vadAutoStopSession = null
        this.vad.stop()
        void this.stopCapture(sid).catch((err) =>
          console.error('[voice] stopCapture (vad) failed:', err),
        )
      }
      // In follow-up-listening mode the vadAutoStopSession is also set
    })

    // VAD speech-start during TTS → barge-in (cancels speech, starts new capture)
    this.vad.on('speech-start', () => {
      if (this.state === 'speaking') {
        this.cancelSpeech()
        // Immediately start capturing for barge-in within the same conversation
        void this.startCapture().catch((err) =>
          console.error('[voice] startCapture (barge-in) failed:', err),
        )
      } else if (this.state === 'follow-up-listening') {
        // User started speaking → transition to listening
        void this.startCapture().catch((err) =>
          console.error('[voice] startCapture (follow-up) failed:', err),
        )
      }
    })

    // Forward VAD level meter to renderer (~20 Hz, lightweight float)
    this.vad.on('level', (level: number) => {
      this.deps.broadcast('voice:level', { level })
    })

    this.ptt = new PttManager({
      onStart: () => {
        // Barge-in: cancel TTS when PTT pressed while speaking
        if (this.state === 'speaking') {
          this.cancelSpeech()
        }
        void this.handlePttStart().catch((err) =>
          console.error('[voice] handlePttStart failed:', err),
        )
      },
      onStop: () =>
        void this.handlePttStop().catch((err) =>
          console.error('[voice] handlePttStop failed:', err),
        ),
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
        'INSERT INTO voice_transcripts(id,ts,duration_ms,text,routed_to,voice_conversation_id) VALUES(?,?,?,?,?,?)',
      )
      this.insertTranscript = (row) => {
        stmt.run(
          row.id,
          row.ts,
          row.durationMs,
          row.text,
          row.routedTo ?? null,
          row.voiceConversationId ?? null,
        )
      }
    } catch {
      // table not yet created — will be available after first migration
    }
  }

  // ─── Public API (used by IPC handler) ─────────────────────────────────────

  checkResources(): { whisperBinFound: boolean; modelsFound: string[]; resourcesOk: boolean } {
    const resourcesDir = app.isPackaged
      ? join(process.resourcesPath, 'whisper')
      : join(app.getAppPath(), '../../resources/whisper')

    const binName = process.platform === 'win32' ? 'whisper.exe' : 'whisper'
    const whisperBinFound = existsSync(join(resourcesDir, binName))

    const MODEL_FILES = ['ggml-tiny.en-q5_1.bin', 'ggml-base.en-q5_1.bin', 'ggml-small.en-q5_1.bin']
    const modelsFound = MODEL_FILES.filter((f) => existsSync(join(resourcesDir, f))).map((f) =>
      f.replace('ggml-', '').replace('-q5_1.bin', ''),
    )

    return { whisperBinFound, modelsFound, resourcesOk: whisperBinFound && modelsFound.length > 0 }
  }

  getStatus() {
    const micGranted = this.deps.settingsRepo.get('voice.micGranted', z.boolean()) ?? false
    const { resourcesOk, missingResources } = (() => {
      const r = this.checkResources()
      const missing: string[] = []
      if (!r.whisperBinFound) missing.push('whisper binary')
      if (r.modelsFound.length === 0) missing.push('whisper model files')
      return { resourcesOk: r.resourcesOk, missingResources: missing }
    })()
    return {
      enabled: this.enabled,
      sttReady: this.whisper.ready,
      ttsReady: this.tts.available,
      micGranted,
      state: this.state,
      resourcesOk,
      missingResources,
    }
  }

  async startCapture(): Promise<{ sessionId: string }> {
    if (!this.enabled) throw new Error('Voice is not enabled')
    if (this.whisper.isDisabled) throw new Error('Whisper is disabled due to crashes')
    if (
      this.state !== 'idle' &&
      this.state !== 'speaking' &&
      this.state !== 'follow-up-listening'
    ) {
      throw new Error(`Cannot start capture in state: ${this.state}`)
    }

    const sessionId = randomUUID()
    this.activeSessions.set(sessionId, { startedAt: Date.now() })

    this.whisper.ensureRunning()
    this.setState('listening')
    this.broadcastVoiceState({ state: 'listening', sessionId })

    // Start VAD: always run for level meter + barge-in; auto-stop only when vadEnabled
    const vadEnabled = this.deps.settingsRepo.get('voice.vadEnabled', z.boolean()) ?? false
    if (vadEnabled) {
      this.vadAutoStopSession = sessionId
    }
    this.vad.start()

    // Ensure conversation session exists when conversationMode is active
    const conversationMode =
      this.deps.settingsRepo.get('voice.conversationMode', z.boolean()) ?? false
    if (conversationMode && !this.conversation) {
      this.conversation = createConversationSession()
      this.scheduleConversationIdleTimer()
    }

    return { sessionId }
  }

  async stopCapture(sessionId: string): Promise<{ transcript: string; autoSent: boolean }> {
    const session = this.activeSessions.get(sessionId)
    if (!session) throw new Error('No active capture session')

    if (this.vadAutoStopSession === sessionId) {
      this.vadAutoStopSession = null
    }
    this.vad.stop()

    this.setState('transcribing')
    this.broadcastVoiceState({ state: 'transcribing', sessionId })

    try {
      const { text } = await this.whisper.finalize()
      const durationMs = Date.now() - session.startedAt
      this.activeSessions.delete(sessionId)

      this.deps.broadcast('voice:final', { text, sessionId })

      if (text.trim().length > 0) {
        // Check for exit phrases when in conversation mode
        if (this.conversation) {
          const norm = text
            .trim()
            .toLowerCase()
            .replace(/[.!?,]/g, '')
          const exitPhrasesEnabled =
            this.deps.settingsRepo.get('voice.exitPhrasesEnabled', z.boolean()) ?? true
          if (exitPhrasesEnabled && EXIT_PHRASES.has(norm)) {
            await this.handleExitPhrase()
            return { transcript: text, autoSent: false }
          }
        }

        // Persist transcript
        const transcriptRow: {
          id: string
          ts: number
          durationMs: number
          text: string
          routedTo?: string
          voiceConversationId?: string
        } = { id: randomUUID(), ts: Date.now(), durationMs, text, routedTo: 'assistant' }
        if (this.conversation?.id) transcriptRow.voiceConversationId = this.conversation.id
        this.insertTranscript?.(transcriptRow)

        const conversationId = this.conversation?.id
        if (this.conversation) {
          touchSession(this.conversation)
          this.clearFollowUpTimer()
        }

        // Always enter thinking state so speakChunk can detect first-chunk transition
        this.setState('thinking')
        this.broadcastVoiceState({
          state: 'thinking',
          conversationId,
          conversationActive: !!this.conversation,
        })

        void this.routeToAssistant(text, sessionId, conversationId)
        return { transcript: text, autoSent: true }
      }

      // Empty transcript
      if (this.conversation) {
        this.enterFollowUpListening()
      } else {
        this.setState('idle')
        this.broadcastVoiceState({ state: 'idle', sessionId })
      }
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
    }
    this.vad.stop()
    this.setState('idle')
    this.broadcastVoiceState({ state: 'idle', sessionId })
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

  async speak(text: string, voiceId?: string, lengthScale?: number): Promise<void> {
    if (!this.tts.available) return
    this.setState('speaking')
    this.broadcastVoiceState({
      state: 'speaking',
      conversationId: this.conversation?.id,
      conversationActive: !!this.conversation,
    })
    // Raise VAD threshold during playback to reduce speaker bleed false-triggers
    const vadThreshold = this.deps.settingsRepo.get('voice.vadThreshold', z.number()) ?? 0.015
    this.vad.setThreshold(vadThreshold * 1.5)
    // Keep VAD running for barge-in detection
    this.vad.start()
    try {
      await this.tts.speak(text, voiceId, lengthScale)
    } finally {
      this.vad.stop()
      this.vad.setThreshold(vadThreshold)
      // Only enter follow-up listening if we are still in speaking state
      if (this.state === 'speaking') {
        if (this.conversation) {
          this.enterFollowUpListening()
        } else {
          this.setState('idle')
          this.broadcastVoiceState({ state: 'idle' })
        }
      }
    }
  }

  cancelSpeech(): void {
    this.tts.cancel()
    if (this.state === 'speaking') {
      this.setState('idle')
      this.broadcastVoiceState({ state: 'idle' })
    }
  }

  endConversation(): void {
    if (this.conversation) {
      clearSessionTimers(this.conversation)
      this.conversation = null
    }
    this.vad.stop()
    this.setState('idle')
    this.broadcastVoiceState({ state: 'idle', conversationActive: false })
  }

  async listTtsVoices() {
    return this.tts.listVoices()
  }

  listAvailableTtsVoices() {
    return listAvailablePiperVoices()
  }

  async downloadTtsVoice(
    voiceId: string,
    onProgress: (p: VoiceDownloadProgress) => void,
  ): Promise<void> {
    await downloadPiperVoice(voiceId, onProgress)
    this.tts.refresh()
  }

  deleteTtsVoice(voiceId: string): void {
    deletePiperVoice(voiceId)
    this.tts.refresh()
  }

  get ttsUsingPiper(): boolean {
    return this.tts.usingPiper
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

      // Pre-warm TTS with configured voice
      const voiceId =
        this.deps.settingsRepo.get('voice.ttsVoiceId', z.string().nullable()) ?? undefined
      if (voiceId) {
        void this.tts.prewarm(voiceId)
      } else {
        const installed = listInstalledPiperVoices()
        if (installed[0]) void this.tts.prewarm(installed[0].id)
      }
    } else {
      this.ptt.disable()
      this.whisper.abort()
      this.enabled = false
      this.deps.settingsRepo.set('voice.enabled', false)
      this.setState('idle')
      if (this.conversation) {
        clearSessionTimers(this.conversation)
        this.conversation = null
      }
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
    ttsLengthScale?: number
    followUpEnabled?: boolean
    followUpTimeoutMs?: number
    conversationIdleTimeoutMs?: number
    exitPhrasesEnabled?: boolean
    streamingTts?: boolean
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
      if (!opts.conversationMode && this.conversation) {
        clearSessionTimers(this.conversation)
        this.conversation = null
      }
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
    if (opts.ttsLengthScale !== undefined) {
      this.deps.settingsRepo.set('voice.ttsLengthScale', opts.ttsLengthScale)
    }
    if (opts.followUpEnabled !== undefined) {
      this.deps.settingsRepo.set('voice.followUpEnabled', opts.followUpEnabled)
    }
    if (opts.followUpTimeoutMs !== undefined) {
      this.deps.settingsRepo.set('voice.followUpTimeoutMs', opts.followUpTimeoutMs)
    }
    if (opts.conversationIdleTimeoutMs !== undefined) {
      this.deps.settingsRepo.set('voice.conversationIdleTimeoutMs', opts.conversationIdleTimeoutMs)
    }
    if (opts.exitPhrasesEnabled !== undefined) {
      this.deps.settingsRepo.set('voice.exitPhrasesEnabled', opts.exitPhrasesEnabled)
    }
    if (opts.streamingTts !== undefined) {
      this.deps.settingsRepo.set('voice.streamingTts', opts.streamingTts)
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private setState(s: PublicVoiceState): void {
    this.state = s
  }

  private broadcastVoiceState(extra: Record<string, unknown>): void {
    this.deps.broadcast('voice:state', {
      state: this.state,
      conversationActive: !!this.conversation,
      conversationId: this.conversation?.id,
      ...extra,
    })
  }

  private clearFollowUpTimer(): void {
    if (this.conversation?.followUpTimer) {
      clearTimeout(this.conversation.followUpTimer)
      this.conversation.followUpTimer = null
    }
  }

  private scheduleConversationIdleTimer(): void {
    if (!this.conversation) return
    if (this.conversation.idleTimer) clearTimeout(this.conversation.idleTimer)
    const idleMs =
      this.deps.settingsRepo.get('voice.conversationIdleTimeoutMs', z.number()) ?? 30_000
    this.conversation.idleTimer = setTimeout(() => {
      this.endConversation()
    }, idleMs)
  }

  private enterFollowUpListening(): void {
    const followUpEnabled = this.deps.settingsRepo.get('voice.followUpEnabled', z.boolean()) ?? true
    const conversationMode =
      this.deps.settingsRepo.get('voice.conversationMode', z.boolean()) ?? false

    if (!this.conversation || !followUpEnabled || !conversationMode) {
      this.setState('idle')
      this.broadcastVoiceState({ state: 'idle' })
      return
    }

    this.setState('follow-up-listening')
    const followUpMs = this.deps.settingsRepo.get('voice.followUpTimeoutMs', z.number()) ?? 8_000
    const expiresAt = Date.now() + followUpMs

    this.broadcastVoiceState({
      state: 'follow-up-listening',
      conversationActive: true,
      followUpRemainingMs: followUpMs,
      followUpExpiresAt: expiresAt,
    })

    // VAD already running for barge-in; also set auto-stop via timer
    this.conversation.followUpTimer = setTimeout(() => {
      if (this.state === 'follow-up-listening') {
        this.endConversation()
      }
    }, followUpMs)

    // VAD speech-start will call startCapture() — keep VAD active
    this.vad.start()
  }

  private async handleExitPhrase(): Promise<void> {
    const voiceId =
      this.deps.settingsRepo.get('voice.ttsVoiceId', z.string().nullable()) ?? undefined
    this.endConversation()
    // Speak goodbye outside of conversation context
    await this.tts.speak('Goodbye.', voiceId ?? undefined)
  }

  private async routeToAssistant(
    text: string,
    sessionId: string,
    conversationId: string | undefined,
  ): Promise<void> {
    const streamingTts = this.deps.settingsRepo.get('voice.streamingTts', z.boolean()) ?? true
    const voiceId =
      this.deps.settingsRepo.get('voice.ttsVoiceId', z.string().nullable()) ?? undefined
    const lengthScale = this.deps.settingsRepo.get('voice.ttsLengthScale', z.number()) ?? undefined

    // Always stream TTS when available — conversation mode only controls session persistence
    let ttsBuffer: StreamingTtsBuffer | null = null
    const chunkPromises: Promise<void>[] = []

    if (streamingTts && this.tts.available) {
      ttsBuffer = new StreamingTtsBuffer((chunk) => {
        chunkPromises.push(this.speakChunk(chunk, voiceId, lengthScale))
      })
    }

    try {
      await this.deps.sendToAssistant(
        text,
        conversationId ?? sessionId,
        ttsBuffer ? (token) => ttsBuffer.push(token) : undefined,
      )

      if (ttsBuffer) {
        ttsBuffer.flushFinal()
      }

      // Wait for all TTS chunks to finish playing before transitioning state
      if (chunkPromises.length > 0) {
        await Promise.all(chunkPromises)
      }
    } catch (err) {
      ttsBuffer?.cancel()
      const message = err instanceof Error ? err.message : 'Assistant error'
      this.deps.broadcast('voice:error', { message })
    } finally {
      // Transition out of speaking/thinking regardless of success or failure
      if (this.state === 'speaking' || this.state === 'thinking') {
        this.vad.stop()
        const vadThreshold = this.deps.settingsRepo.get('voice.vadThreshold', z.number()) ?? 0.015
        this.vad.setThreshold(vadThreshold)
        if (this.conversation) {
          this.enterFollowUpListening()
        } else {
          this.setState('idle')
          this.broadcastVoiceState({ state: 'idle' })
        }
      }
    }
  }

  private async speakChunk(text: string, voiceId?: string, lengthScale?: number): Promise<void> {
    if (!this.tts.available) return
    // Transition to speaking on first chunk
    if (this.state === 'thinking') {
      this.setState('speaking')
      this.broadcastVoiceState({
        state: 'speaking',
        conversationActive: !!this.conversation,
        conversationId: this.conversation?.id,
      })
      const vadThreshold = this.deps.settingsRepo.get('voice.vadThreshold', z.number()) ?? 0.015
      this.vad.setThreshold(vadThreshold * 1.5)
      this.vad.start()
    }
    try {
      await this.tts.speak(text, voiceId, lengthScale)
    } catch {
      // Non-fatal — continue with next chunk
    }
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
      this.broadcastVoiceState({ state: 'idle' })
      this.ptt.setState('idle')
      return
    }

    try {
      await this.stopCapture(sessionId)
    } catch {
      // stopCapture already broadcasts the concrete error.
    } finally {
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
    if (this.conversation) {
      clearSessionTimers(this.conversation)
      this.conversation = null
    }
  }
}
