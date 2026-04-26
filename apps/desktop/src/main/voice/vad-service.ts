import { EventEmitter } from 'events'

// Lightweight energy-based Voice Activity Detection.
// Processes raw PCM-16 (16 kHz mono) buffers and emits:
//   'speech-start' / 'speech-end' — activity events
//   'level' (value: number 0..1) — ~20 ms RMS meter tick (always, regardless of speaking state)
//
// Algorithm: compute RMS energy over a sliding window; threshold crossing with
// onset/offset hysteresis to avoid rapid toggling on noisy signals.

const SAMPLE_RATE = 16_000
const FRAME_DURATION_MS = 20
const FRAME_SAMPLES = Math.floor(SAMPLE_RATE * (FRAME_DURATION_MS / 1000)) // 320

const ONSET_FRAMES = 3 // consecutive above-threshold frames → speech start
const OFFSET_FRAMES = 20 // consecutive below-threshold frames → speech end (400 ms)

const DEFAULT_ENERGY_THRESHOLD = 200 // RMS value out of 32767

// Level meter throttle: emit at most once per 50 ms to keep IPC light
const LEVEL_EMIT_INTERVAL_MS = 50

export type VadConfig = {
  energyThreshold?: number
}

/**
 * Emits:
 * - 'speech-start': user started speaking
 * - 'speech-end': user stopped speaking (natural endpoint)
 * - 'level' (value: 0..1): normalised RMS level, ~20 Hz, emitted regardless of speaking state
 */
export class VadService extends EventEmitter {
  private buffer = Buffer.alloc(0)
  private aboveCount = 0
  private belowCount = 0
  private speaking = false
  private threshold: number
  private active = false
  private lastLevelEmitMs = 0

  constructor(config: VadConfig = {}) {
    super()
    this.threshold = config.energyThreshold ?? DEFAULT_ENERGY_THRESHOLD
  }

  /** Start processing incoming audio. */
  start(): void {
    this.active = true
    this.reset()
  }

  /** Stop processing — resets internal state. */
  stop(): void {
    this.active = false
    this.reset()
  }

  setThreshold(t: number): void {
    this.threshold = t
  }

  /** Feed a raw PCM-16 chunk (16 kHz mono, little-endian Int16). */
  push(pcm16: Buffer): void {
    if (!this.active) return
    this.buffer = Buffer.concat([this.buffer, pcm16])
    this.processFrames()
  }

  private reset(): void {
    this.buffer = Buffer.alloc(0)
    this.aboveCount = 0
    this.belowCount = 0
    this.speaking = false
    this.lastLevelEmitMs = 0
  }

  private processFrames(): void {
    const frameBytes = FRAME_SAMPLES * 2 // 2 bytes per Int16 sample

    while (this.buffer.length >= frameBytes) {
      const frame = this.buffer.subarray(0, frameBytes)
      this.buffer = this.buffer.subarray(frameBytes)

      const rms = computeRms(frame)
      const isLoud = rms >= this.threshold

      // Emit level meter event (throttled to ~20 Hz)
      const now = Date.now()
      if (now - this.lastLevelEmitMs >= LEVEL_EMIT_INTERVAL_MS) {
        this.lastLevelEmitMs = now
        // Normalise against a practical peak of 4× threshold so the meter
        // fills to ~100% on loud speech without being clipped by whisper loudness.
        const level = Math.min(1, rms / (this.threshold * 4))
        this.emit('level', level)
      }

      if (isLoud) {
        this.belowCount = 0
        this.aboveCount++
        if (!this.speaking && this.aboveCount >= ONSET_FRAMES) {
          this.speaking = true
          this.emit('speech-start')
        }
      } else {
        this.aboveCount = 0
        if (this.speaking) {
          this.belowCount++
          if (this.belowCount >= OFFSET_FRAMES) {
            this.speaking = false
            this.belowCount = 0
            this.emit('speech-end')
          }
        }
      }
    }
  }
}

function computeRms(frame: Buffer): number {
  let sum = 0
  for (let i = 0; i < frame.length - 1; i += 2) {
    const sample = frame.readInt16LE(i)
    sum += sample * sample
  }
  const samples = frame.length / 2
  return Math.sqrt(sum / samples)
}
