import { registerHandler } from '../router'
import type { PiperVoiceDownload } from '@auralith/core-voice'

// Voice module deps — set by initVoiceDeps() once voice services are created
type VoiceDeps = {
  getStatus: () => {
    enabled: boolean
    sttReady: boolean
    ttsReady: boolean
    micGranted: boolean
    state: 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'follow-up-listening'
    resourcesOk: boolean
    missingResources: string[]
    ttsUsingPiper: boolean
  }
  getSettings: () => {
    sttModel: string
    ttsVoiceId: string | null
    speakBriefings: boolean
    speakSuggestionConfirmations: boolean
    wakeWordEnabled: boolean
    conversationMode: boolean
    wakeWordSensitivity: 'low' | 'medium' | 'high'
  }
  startCapture: () => Promise<{ sessionId: string }>
  stopCapture: (sessionId: string) => Promise<{ transcript: string; autoSent: boolean }>
  pushAudioChunk: (sessionId: string, pcm16Base64: string) => void
  cancelCapture: (sessionId: string) => Promise<void>
  speak: (text: string, voiceId?: string, lengthScale?: number) => Promise<void>
  listTtsVoices: () => Promise<
    Array<{
      id: string
      name: string
      lang: string
      provider: string
      quality?: string | undefined
      sampleRate?: number | undefined
      installed: boolean
      licence?: string | undefined
    }>
  >
  listAvailableTtsVoices: () => PiperVoiceDownload[]
  downloadTtsVoice: (
    voiceId: string,
    onProgress: (p: {
      voiceId: string
      bytesReceived: number
      bytesTotal: number
      phase: string
    }) => void,
  ) => Promise<void>
  deleteTtsVoice: (voiceId: string) => void
  listSttModels: () => Array<{ id: string; name: string; sizeBytes: number; installed: boolean }>
  downloadSttModel: (modelId: string) => Promise<void>
  setEnabled: (enabled: boolean) => Promise<{ conflict: boolean }>
  setPttBinding: (binding: string) => Promise<{ conflict: boolean }>
  endConversation: () => void
  setSettings: (opts: {
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
  }) => Promise<void>
  broadcast: (channel: string, data: unknown) => void
}

let deps: VoiceDeps | null = null

export function initVoiceDeps(d: VoiceDeps): void {
  deps = d
}

function requireDeps(): VoiceDeps {
  if (!deps) throw Object.assign(new Error('Voice not initialized'), { code: 'NOT_INITIALIZED' })
  return deps
}

export function registerVoiceHandlers(): void {
  registerHandler('voice.getStatus', async () => {
    return requireDeps().getStatus()
  })

  registerHandler('voice.getSettings', async () => {
    return requireDeps().getSettings()
  })

  registerHandler('voice.startCapture', async () => {
    return requireDeps().startCapture()
  })

  registerHandler('voice.stopCapture', async (params) => {
    const { sessionId } = params as { sessionId: string }
    return requireDeps().stopCapture(sessionId)
  })

  registerHandler('voice.pushChunk', async (params) => {
    const { sessionId, pcm16Base64 } = params as { sessionId: string; pcm16Base64: string }
    requireDeps().pushAudioChunk(sessionId, pcm16Base64)
    return { ok: true }
  })

  registerHandler('voice.cancelCapture', async (params) => {
    const { sessionId } = params as { sessionId: string }
    await requireDeps().cancelCapture(sessionId)
    return { ok: true }
  })

  registerHandler('voice.speak', async (params) => {
    const { text, voiceId, lengthScale } = params as {
      text: string
      voiceId?: string
      lengthScale?: number
    }
    await requireDeps().speak(text, voiceId, lengthScale)
    return { ok: true }
  })

  registerHandler('voice.listTtsVoices', async () => {
    const voices = await requireDeps().listTtsVoices()
    return { voices }
  })

  registerHandler('voice.listAvailableTtsVoices', async () => {
    const voices = requireDeps().listAvailableTtsVoices()
    return { voices }
  })

  registerHandler('voice.downloadTtsVoice', async (params) => {
    const { voiceId } = params as { voiceId: string }
    const d = requireDeps()
    await d.downloadTtsVoice(voiceId, (progress) => {
      d.broadcast('voice:tts-download-progress', progress)
    })
    return { ok: true }
  })

  registerHandler('voice.deleteTtsVoice', async (params) => {
    const { voiceId } = params as { voiceId: string }
    requireDeps().deleteTtsVoice(voiceId)
    return { ok: true }
  })

  registerHandler('voice.listSttModels', async () => {
    const models = requireDeps().listSttModels()
    return { models }
  })

  registerHandler('voice.downloadSttModel', async (params) => {
    const { modelId } = params as { modelId: string }
    await requireDeps().downloadSttModel(modelId)
    return { ok: true }
  })

  registerHandler('voice.setEnabled', async (params) => {
    const { enabled } = params as { enabled: boolean }
    const result = await requireDeps().setEnabled(enabled)
    return { ok: true, conflict: result.conflict }
  })

  registerHandler('voice.setPttBinding', async (params) => {
    const { binding } = params as { binding: string }
    const result = await requireDeps().setPttBinding(binding)
    return { ok: !result.conflict, conflict: result.conflict }
  })

  registerHandler('voice.endConversation', async () => {
    requireDeps().endConversation()
    return { ok: true }
  })

  registerHandler('voice.setSettings', async (params) => {
    await requireDeps().setSettings(
      params as {
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
      },
    )
    return { ok: true }
  })
}
