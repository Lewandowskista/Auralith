/**
 * TtsAudioPlayer — renderer-side audio player for Piper TTS.
 *
 * Listens for 'voice:tts-pcm' events from main (base64 PCM-16 chunks),
 * feeds them into an AudioWorkletNode ring buffer, and plays continuously.
 * On 'voice:tts-cancel', flushes the buffer immediately (<20 ms).
 *
 * Call init() once when the app boots; it's a singleton.
 */

let ctx: AudioContext | null = null
let workletNode: AudioWorkletNode | null = null
let currentSampleRate = 22050
let initialized = false
let pcmCleanup: (() => void) | null = null
let cancelCleanup: (() => void) | null = null

/** Base64-encoded PCM-16 chunk + synthesis id + sample rate */
type PcmMessage = { id: string; chunk: string; sampleRate: number }

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const buf = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i)
  }
  return buf
}

function resamplePcm16(input: ArrayBuffer, fromRate: number, toRate: number): ArrayBuffer {
  if (fromRate === toRate) return input

  const inView = new DataView(input)
  const sampleCount = input.byteLength / 2
  const ratio = fromRate / toRate
  const outCount = Math.floor(sampleCount / ratio)
  const out = new ArrayBuffer(outCount * 2)
  const outView = new DataView(out)

  for (let i = 0; i < outCount; i++) {
    const srcIdx = Math.floor(i * ratio)
    const s = inView.getInt16(srcIdx * 2, true)
    outView.setInt16(i * 2, s, true)
  }
  return out
}

async function ensureContext(sampleRate: number): Promise<void> {
  if (ctx && currentSampleRate !== sampleRate) {
    // Voice changed sample rate — recreate context at new rate
    await cleanup()
  }

  if (!ctx || ctx.state === 'closed') {
    currentSampleRate = sampleRate
    ctx = new AudioContext({ sampleRate })

    // Load the worklet processor
    // The file is bundled in the renderer; resolve relative to this module
    const processorUrl = new URL('./tts-audio-worklet.processor.js', import.meta.url)
    await ctx.audioWorklet.addModule(processorUrl.href)

    workletNode = new AudioWorkletNode(ctx, 'tts-audio-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })

    workletNode.connect(ctx.destination)
  }

  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
}

async function cleanup(): Promise<void> {
  if (workletNode) {
    workletNode.disconnect()
    workletNode = null
  }
  if (ctx) {
    await ctx.close().catch(() => {
      /* ignore */
    })
    ctx = null
  }
}

function flush(): void {
  workletNode?.port.postMessage({ type: 'flush' })
}

function writePcm(pcmBuffer: ArrayBuffer, voiceSampleRate: number): void {
  if (!workletNode || !ctx) return

  // Resample to the AudioContext's native rate if they differ
  const resampled = resamplePcm16(pcmBuffer, voiceSampleRate, ctx.sampleRate)
  workletNode.port.postMessage({ type: 'pcm', chunk: resampled }, [resampled])
}

export async function initTtsAudioPlayer(): Promise<void> {
  if (initialized) return
  initialized = true

  const api = window.auralith

  const onPcm = (payload: PcmMessage) => {
    void (async () => {
      try {
        await ensureContext(payload.sampleRate)
        const buf = base64ToArrayBuffer(payload.chunk)
        writePcm(buf, payload.sampleRate)
      } catch (err) {
        console.error('[tts-audio-player] pcm error', err)
      }
    })()
  }

  const onCancel = () => {
    flush()
  }

  // Subscribe to IPC events from main process
  if (api?.on) {
    pcmCleanup = api.on('voice:tts-pcm', onPcm as (payload: unknown) => void)
    cancelCleanup = api.on('voice:tts-cancel', onCancel)
  }
}

export function disposeTtsAudioPlayer(): void {
  pcmCleanup?.()
  cancelCleanup?.()
  void cleanup()
  initialized = false
}
