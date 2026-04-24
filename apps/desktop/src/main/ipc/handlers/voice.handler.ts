import { registerHandler } from '../router'

// Voice module deps — set by initVoiceDeps() once voice services are created
type VoiceDeps = {
  getStatus: () => {
    enabled: boolean
    sttReady: boolean
    ttsReady: boolean
    micGranted: boolean
    state: 'idle' | 'listening' | 'transcribing' | 'speaking'
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
  speak: (text: string, voiceId?: string, rate?: number) => Promise<void>
  listTtsVoices: () => Promise<Array<{ id: string; name: string; lang: string }>>
  listSttModels: () => Array<{ id: string; name: string; sizeBytes: number; installed: boolean }>
  downloadSttModel: (modelId: string) => Promise<void>
  setEnabled: (enabled: boolean) => Promise<{ conflict: boolean }>
  setPttBinding: (binding: string) => Promise<{ conflict: boolean }>
  setSettings: (opts: {
    sttModel?: string
    ttsVoiceId?: string | null
    speakBriefings?: boolean
    speakSuggestionConfirmations?: boolean
    wakeWordEnabled?: boolean
    conversationMode?: boolean
    wakeWordSensitivity?: 'low' | 'medium' | 'high'
  }) => Promise<void>
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
    const { text, voiceId, rate } = params as { text: string; voiceId?: string; rate?: number }
    await requireDeps().speak(text, voiceId, rate)
    return { ok: true }
  })

  registerHandler('voice.listTtsVoices', async () => {
    const voices = await requireDeps().listTtsVoices()
    return { voices }
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
      },
    )
    return { ok: true }
  })
}
