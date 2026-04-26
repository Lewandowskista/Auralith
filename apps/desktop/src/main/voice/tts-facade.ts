import { EventEmitter } from 'events'
import { PiperTtsService } from './piper-tts-service'
import { SapiTtsService } from './sapi-tts-service'
import { listInstalledPiperVoices } from './piper-voice-catalogue'
import type { TtsVoice } from '@auralith/core-voice'

/**
 * TtsFacade selects Piper (neural, high quality) when available,
 * and falls back to SAPI (Windows built-in) transparently.
 *
 * The orchestrator always speaks through this facade so it has
 * a single, stable surface regardless of which engine is active.
 */
export class TtsFacade extends EventEmitter {
  private piper: PiperTtsService
  private sapi: SapiTtsService
  private usePiper = false
  private lastToastSent = false

  constructor() {
    super()
    this.piper = new PiperTtsService()
    this.sapi = new SapiTtsService()

    // Forward speak-start events from Piper to orchestrator
    this.piper.on('speak-start', (id: string) => this.emit('speak-start', id))

    // Determine which engine to use
    this.usePiper = this.piper.available && listInstalledPiperVoices().length > 0
  }

  get available(): boolean {
    return this.piper.available || this.sapi.available
  }

  get usingPiper(): boolean {
    return this.usePiper && this.piper.available
  }

  async speak(text: string, voiceId?: string, lengthScale?: number): Promise<void> {
    if (this.usePiper && this.piper.available) {
      try {
        await this.piper.speak(text, voiceId, lengthScale)
        this.lastToastSent = false
        return
      } catch (err) {
        // One-shot toast on Piper failure
        if (!this.lastToastSent) {
          this.lastToastSent = true
          this.emit('piper-fallback', err instanceof Error ? err.message : 'Piper TTS failed')
        }
        // Fall through to SAPI
      }
    }

    if (this.sapi.available) {
      // SAPI rate param is a 0..2 scale; we pass undefined when only lengthScale is given
      await this.sapi.speak(text, voiceId)
    }
  }

  cancel(): void {
    this.piper.cancel()
    this.sapi.cancel()
  }

  async listVoices(): Promise<TtsVoice[]> {
    if (this.usePiper && this.piper.available) {
      return this.piper.listVoices()
    }
    return this.sapi.listVoices()
  }

  /** Prewarm Piper with the given voice so the first utterance has no cold-start. */
  async prewarm(voiceId: string): Promise<void> {
    if (this.piper.available) {
      try {
        await this.piper.prewarm(voiceId)
        this.usePiper = true
      } catch {
        // Piper prewarm failed; stay on SAPI
      }
    }
  }

  /** Refresh engine selection (call after a voice is downloaded). */
  refresh(): void {
    this.usePiper = this.piper.available && listInstalledPiperVoices().length > 0
  }

  dispose(): void {
    this.piper.dispose()
    this.sapi.cancel()
  }
}
