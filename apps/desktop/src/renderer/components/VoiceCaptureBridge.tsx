import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { downsampleFloat32, floatToPcm16, pcm16ToBase64 } from '../lib/audio/pcm'

type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking' | 'thinking'

type CaptureRuntime = {
  sessionId: string
  stream: MediaStream
  audioContext: AudioContext
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  gain: GainNode
}

export function VoiceCaptureBridge(): ReactElement | null {
  const runtimeRef = useRef<CaptureRuntime | null>(null)

  useEffect(() => {
    async function start(sessionId: string): Promise<void> {
      if (runtimeRef.current?.sessionId === sessionId) return
      await stop()

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        const audioContext = new AudioContext()
        const source = audioContext.createMediaStreamSource(stream)
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        const gain = audioContext.createGain()
        gain.gain.value = 0

        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0)
          const downsampled = downsampleFloat32(input, audioContext.sampleRate, 16_000)
          const pcm16 = floatToPcm16(downsampled)
          if (pcm16.length === 0) return
          void window.auralith.invoke('voice.pushChunk', {
            sessionId,
            pcm16Base64: pcm16ToBase64(pcm16),
          })
        }

        source.connect(processor)
        processor.connect(gain)
        gain.connect(audioContext.destination)

        runtimeRef.current = { sessionId, stream, audioContext, source, processor, gain }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Microphone capture failed'
        console.error('[voice-capture]', message)
        const isPermissionDenied =
          err instanceof DOMException &&
          (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
        if (isPermissionDenied) {
          window.dispatchEvent(
            new CustomEvent('voice:error', {
              detail: 'Microphone permission was denied. Grant access in Settings → Voice.',
            }),
          )
        }
        void window.auralith.invoke('voice.cancelCapture', { sessionId })
      }
    }

    async function stop(): Promise<void> {
      const runtime = runtimeRef.current
      if (!runtime) return
      runtimeRef.current = null
      runtime.processor.onaudioprocess = null
      runtime.source.disconnect()
      runtime.processor.disconnect()
      runtime.gain.disconnect()
      for (const track of runtime.stream.getTracks()) {
        track.stop()
      }
      await runtime.audioContext.close().catch(() => undefined)
    }

    const unsubState = window.auralith.on('voice:state', (data) => {
      const { state, sessionId } = data as { state: VoiceState; sessionId?: string }
      if (state === 'listening' && sessionId) {
        void start(sessionId)
      } else if (state !== 'listening') {
        void stop()
      }
    })

    const unsubError = window.auralith.on('voice:error', () => {
      void stop()
    })

    return () => {
      unsubState()
      unsubError()
      void stop()
    }
  }, [])

  return null
}
