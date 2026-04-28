import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { downsampleFloat32, floatToPcm16, pcm16ToBase64 } from '../lib/audio/pcm'

type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking' | 'thinking'

type CaptureRuntime = {
  sessionId: string
  stream: MediaStream
  audioContext: AudioContext
  source: MediaStreamAudioSourceNode
  workletNode: AudioWorkletNode
}

export function VoiceCaptureBridge(): ReactElement | null {
  const runtimeRef = useRef<CaptureRuntime | null>(null)

  useEffect(() => {
    async function start(sessionId: string): Promise<void> {
      if (runtimeRef.current?.sessionId === sessionId) return
      await stop()

      let audioContext: AudioContext | null = null
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        audioContext = new AudioContext()

        // Load capture worklet on the audio thread
        const processorUrl = new URL('../lib/audio/capture-worklet.processor.js', import.meta.url)
        await audioContext.audioWorklet.addModule(processorUrl.href)

        const source = audioContext.createMediaStreamSource(stream)
        // numberOfOutputs: 0 — capture-only node, no audio routed to speaker
        const workletNode = new AudioWorkletNode(audioContext, 'capture-processor', {
          numberOfOutputs: 0,
        })

        workletNode.port.onmessage = (
          event: MessageEvent<{ type: string; samples: Float32Array }>,
        ) => {
          if (event.data.type !== 'pcm') return
          if (!audioContext) return
          const downsampled = downsampleFloat32(event.data.samples, audioContext.sampleRate, 16_000)
          const pcm16 = floatToPcm16(downsampled)
          if (pcm16.length === 0) return
          void window.auralith.invoke('voice.pushChunk', {
            sessionId,
            pcm16Base64: pcm16ToBase64(pcm16),
          })
        }

        source.connect(workletNode)

        runtimeRef.current = { sessionId, stream, audioContext, source, workletNode }
      } catch (err) {
        if (audioContext) void audioContext.close().catch(() => undefined)
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
      runtime.workletNode.port.onmessage = null
      runtime.source.disconnect()
      runtime.workletNode.disconnect()
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
