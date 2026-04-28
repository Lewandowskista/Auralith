/**
 * TTS Audio Worklet Processor.
 *
 * Runs on the AudioWorkletGlobalScope (off-main-thread).
 * Maintains a ring buffer fed by PCM-16 chunks from the main process.
 * Plays continuously until the buffer is empty.
 *
 * Messages IN (via port):
 *   { type: 'pcm', chunk: ArrayBuffer }  — PCM-16 samples at the AudioContext sample rate
 *   { type: 'flush' }                     — cancel current audio (barge-in)
 *
 * Messages OUT (via port):
 *   { type: 'buffer-empty', id: string }  — sent when the ring buffer drains (id = last synthesis id)
 */

// We declare only the types we need from the AudioWorklet globals.
// TypeScript's lib.webworker.d.ts doesn't include AudioWorkletProcessor by default
// in renderer tsconfigs, so we declare it inline.
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}
declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void

const RING_SIZE = 48_000 * 4 // 4 seconds at 48 kHz

class TtsAudioProcessor extends AudioWorkletProcessor {
  private ring = new Float32Array(RING_SIZE)
  private writePos = 0
  private readPos = 0
  private flushing = false
  // Track the synthesis id of the most recently written chunk for buffer-empty correlation
  private lastId = ''

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; chunk?: ArrayBuffer; id?: string }
      if (msg.type === 'flush') {
        // Drop all buffered audio immediately
        this.writePos = this.readPos
        this.flushing = false
        return
      }
      if (msg.type === 'pcm' && msg.chunk) {
        if (msg.id) this.lastId = msg.id
        this.writePcm(msg.chunk)
      }
    }
  }

  private writePcm(buffer: ArrayBuffer): void {
    // buffer is PCM-16 little-endian; convert to float32 and write to ring
    const view = new DataView(buffer)
    const samples = buffer.byteLength / 2
    for (let i = 0; i < samples; i++) {
      const s16 = view.getInt16(i * 2, true) // little-endian
      const f32 = s16 / 32768.0
      this.ring[this.writePos % RING_SIZE] = f32
      this.writePos++
    }
  }

  private available(): number {
    return this.writePos - this.readPos
  }

  override process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0]
    if (!output || output.length === 0) return true

    const channel = output[0]
    if (!channel) return true

    const len = channel.length
    const avail = this.available()

    if (avail === 0) {
      // Silence
      channel.fill(0)
    } else {
      const toCopy = Math.min(len, avail)
      for (let i = 0; i < toCopy; i++) {
        channel[i] = this.ring[this.readPos % RING_SIZE] ?? 0
        this.readPos++
      }
      // Zero-pad if we ran out
      for (let i = toCopy; i < len; i++) {
        channel[i] = 0
      }
      // Signal when buffer drains, carrying the last synthesis id for correlation
      if (this.available() === 0 && avail > 0) {
        this.port.postMessage({ type: 'buffer-empty', id: this.lastId })
      }
    }

    return true
  }
}

registerProcessor('tts-audio-processor', TtsAudioProcessor)
