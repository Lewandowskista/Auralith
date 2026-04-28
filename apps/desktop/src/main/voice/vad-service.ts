import { EventEmitter } from 'events'

// Voice Activity Detection with dual execution paths:
//   1. Silero-VAD v4 (ONNX, ~1-2 ms/frame) — loaded via onnxruntime-node when model file is present.
//   2. Energy-based RMS fallback — used automatically if ONNX model is absent or fails to load.
//
// Public API is identical in both modes. The 'speech-start' / 'speech-end' / 'level' events
// and all method signatures are unchanged from the original energy-only implementation.

// Silero-VAD v4 requires exactly 512 samples @ 16 kHz (32 ms frames).
// The energy fallback uses the same frame size for consistency.
const SAMPLE_RATE = 16_000
const FRAME_SAMPLES = 512
const FRAME_BYTES = FRAME_SAMPLES * 2 // Int16 = 2 bytes/sample

const ONSET_FRAMES = 3 // consecutive above-threshold frames → speech start
const OFFSET_FRAMES = 20 // consecutive below-threshold frames → speech end (~640 ms)

const DEFAULT_ENERGY_THRESHOLD = 200 // RMS value out of 32767
const DEFAULT_PROBABILITY_THRESHOLD = 0.5 // Silero probability (0–1)

// Level meter: emit at most once per 50 ms to keep IPC light (~20 Hz)
const LEVEL_EMIT_INTERVAL_MS = 50

export type VadConfig = {
  energyThreshold?: number
  probabilityThreshold?: number
  vadModelPath?: string
}

// onnxruntime-node types — imported lazily so the module loads even when ort is absent.
type OrtSession = {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>
}

/**
 * Emits:
 * - 'speech-start': user started speaking
 * - 'speech-end': user stopped speaking
 * - 'level' (value: 0..1): normalised RMS level, ~20 Hz
 */
export class VadService extends EventEmitter {
  private buffer = Buffer.alloc(0)
  private aboveCount = 0
  private belowCount = 0
  private speaking = false
  private energyThreshold: number
  private probabilityThreshold: number
  private active = false
  private lastLevelEmitMs = 0

  // ONNX state
  private onnxAvailable = false
  private ortSession: OrtSession | null = null
  // Silero-VAD v4 requires persistent h/c state tensors across frames.
  private sileroH: Float32Array = new Float32Array(2 * 1 * 64).fill(0)
  private sileroC: Float32Array = new Float32Array(2 * 1 * 64).fill(0)

  constructor(config: VadConfig = {}) {
    super()
    this.energyThreshold = config.energyThreshold ?? DEFAULT_ENERGY_THRESHOLD
    this.probabilityThreshold = config.probabilityThreshold ?? DEFAULT_PROBABILITY_THRESHOLD
  }

  /**
   * Load the Silero-VAD ONNX model. If this fails for any reason the service
   * silently falls back to energy-based detection — it never throws.
   */
  async loadModel(modelPath: string): Promise<void> {
    try {
      // Dynamic import so the module tree doesn't hard-depend on onnxruntime-node.
      const ort = await import('onnxruntime-node')
      this.ortSession = (await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      })) as unknown as OrtSession
      this.onnxAvailable = true
      console.warn('[VAD] Silero-VAD ONNX model loaded — ML-based detection active.')
    } catch (err) {
      this.onnxAvailable = false
      this.ortSession = null
      console.warn('[VAD] Failed to load Silero-VAD model — falling back to energy-based VAD.', err)
    }
  }

  start(): void {
    this.active = true
    this.reset()
  }

  stop(): void {
    this.active = false
    this.reset()
  }

  /** Adjust energy threshold (used in energy-fallback mode). */
  setThreshold(t: number): void {
    this.energyThreshold = t
  }

  /** Adjust Silero probability threshold (used in ONNX mode). */
  setProbabilityThreshold(t: number): void {
    this.probabilityThreshold = t
  }

  /** Feed a raw PCM-16 chunk (16 kHz mono, little-endian Int16). */
  push(pcm16: Buffer): void {
    if (!this.active) return
    this.buffer = Buffer.concat([this.buffer, pcm16])
    // processFrames is async in ONNX mode; fire-and-forget is fine since
    // frames are processed in order and we don't need to await each one.
    void this.processFrames()
  }

  private reset(): void {
    this.buffer = Buffer.alloc(0)
    this.aboveCount = 0
    this.belowCount = 0
    this.speaking = false
    this.lastLevelEmitMs = 0
    this.sileroH = new Float32Array(2 * 1 * 64).fill(0)
    this.sileroC = new Float32Array(2 * 1 * 64).fill(0)
  }

  private async processFrames(): Promise<void> {
    while (this.buffer.length >= FRAME_BYTES) {
      const frame = this.buffer.subarray(0, FRAME_BYTES)
      this.buffer = this.buffer.subarray(FRAME_BYTES)

      const rms = computeRms(frame)

      // Level meter always uses RMS — ONNX probability is not a useful level signal.
      const now = Date.now()
      if (now - this.lastLevelEmitMs >= LEVEL_EMIT_INTERVAL_MS) {
        this.lastLevelEmitMs = now
        const level = Math.min(1, rms / (this.energyThreshold * 4))
        this.emit('level', level)
      }

      let isLoud: boolean
      if (this.onnxAvailable && this.ortSession) {
        isLoud = await this.runSilero(frame)
      } else {
        isLoud = rms >= this.energyThreshold
      }

      this.updateHysteresis(isLoud)
    }
  }

  private async runSilero(frame: Buffer): Promise<boolean> {
    try {
      const ort = await import('onnxruntime-node')

      // Normalise Int16 PCM → Float32 in [-1, 1]
      const float32 = new Float32Array(FRAME_SAMPLES)
      for (let i = 0; i < FRAME_SAMPLES; i++) {
        float32[i] = frame.readInt16LE(i * 2) / 32768.0
      }

      const feeds = {
        input: new ort.Tensor('float32', float32, [1, FRAME_SAMPLES]),
        sr: new ort.Tensor('int64', BigInt64Array.from([BigInt(SAMPLE_RATE)]), [1]),
        h: new ort.Tensor('float32', this.sileroH, [2, 1, 64]),
        c: new ort.Tensor('float32', this.sileroC, [2, 1, 64]),
      }

      const session = this.ortSession
      if (!session) {
        return computeRms(frame) >= this.energyThreshold
      }

      const results = await session.run(feeds)
      const probability = results['output']?.data[0] ?? 0
      // Update persistent state tensors for next frame
      if (results['hn']?.data) this.sileroH = results['hn'].data as Float32Array
      if (results['cn']?.data) this.sileroC = results['cn'].data as Float32Array

      return probability >= this.probabilityThreshold
    } catch (err) {
      // If a single frame inference fails, fall back to energy for this frame only.
      console.warn('[VAD] Silero inference error for frame — using energy fallback.', err)
      return computeRms(frame) >= this.energyThreshold
    }
  }

  private updateHysteresis(isLoud: boolean): void {
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

function computeRms(frame: Buffer): number {
  let sum = 0
  for (let i = 0; i < frame.length - 1; i += 2) {
    const sample = frame.readInt16LE(i)
    sum += sample * sample
  }
  const samples = frame.length / 2
  return Math.sqrt(sum / samples)
}
