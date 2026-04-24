export type SttPartial = { text: string }
export type SttFinal = { text: string; confidence: number; durationMs: number }

export interface SttClient {
  /** Load the model. Resolves when ready. */
  load(modelPath: string): Promise<void>

  /** Feed a raw PCM-16 chunk (16 kHz mono) into the stream. */
  pushChunk(pcm16: Buffer): void

  /** Signal end of audio. Returns the final transcript. */
  finalize(): Promise<SttFinal>

  /** Abort the current transcription. */
  abort(): void

  /** Whether the client is ready to accept audio. */
  readonly ready: boolean
}
