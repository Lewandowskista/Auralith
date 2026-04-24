import type { TtsVoice } from './schemas'

export type TtsSpeakOpts = {
  voiceId?: string
  rate?: number
}

export interface TtsClient {
  /** Speak the given text. Resolves when playback finishes. */
  speak(text: string, opts?: TtsSpeakOpts): Promise<void>

  /** Cancel ongoing speech immediately. */
  cancel(): void

  /** List available system voices. */
  listVoices(): Promise<TtsVoice[]>

  /** Whether the TTS engine is available. */
  readonly available: boolean
}
