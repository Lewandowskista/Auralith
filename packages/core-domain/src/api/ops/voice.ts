import { z } from 'zod'

// voice.getStatus
export const VoiceGetStatusParamsSchema = z.object({})
export const VoiceGetStatusResultSchema = z.object({
  enabled: z.boolean(),
  sttReady: z.boolean(),
  ttsReady: z.boolean(),
  micGranted: z.boolean(),
  state: z.enum(['idle', 'listening', 'transcribing', 'speaking']),
})

// voice.startCapture
export const VoiceStartCaptureParamsSchema = z.object({})
export const VoiceStartCaptureResultSchema = z.object({ sessionId: z.string() })

// voice.stopCapture
export const VoiceStopCaptureParamsSchema = z.object({ sessionId: z.string() })
export const VoiceStopCaptureResultSchema = z.object({
  transcript: z.string(),
  autoSent: z.boolean(),
})

// voice.pushChunk
export const VoicePushChunkParamsSchema = z.object({
  sessionId: z.string(),
  pcm16Base64: z.string().min(1),
})
export const VoicePushChunkResultSchema = z.object({ ok: z.boolean() })

// voice.cancelCapture
export const VoiceCancelCaptureParamsSchema = z.object({ sessionId: z.string() })
export const VoiceCancelCaptureResultSchema = z.object({ ok: z.boolean() })

// voice.speak
export const VoiceSpeakParamsSchema = z.object({
  text: z.string().min(1),
  voiceId: z.string().optional(),
  rate: z.number().min(0.1).max(3).optional(),
})
export const VoiceSpeakResultSchema = z.object({ ok: z.boolean() })

// voice.listTtsVoices
export const VoiceListTtsVoicesParamsSchema = z.object({})
export const VoiceListTtsVoicesResultSchema = z.object({
  voices: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      lang: z.string(),
    }),
  ),
})

// voice.listSttModels
export const VoiceListSttModelsParamsSchema = z.object({})
export const VoiceListSttModelsResultSchema = z.object({
  models: z.array(
    z.object({
      id: z.enum(['tiny.en', 'base.en', 'small.en']),
      name: z.string(),
      sizeBytes: z.number(),
      installed: z.boolean(),
    }),
  ),
})

// voice.downloadSttModel
export const VoiceDownloadSttModelParamsSchema = z.object({
  modelId: z.enum(['tiny.en', 'base.en', 'small.en']),
})
export const VoiceDownloadSttModelResultSchema = z.object({ ok: z.boolean() })

// voice.setEnabled
export const VoiceSetEnabledParamsSchema = z.object({ enabled: z.boolean() })
export const VoiceSetEnabledResultSchema = z.object({ ok: z.boolean() })

// voice.setPttBinding
export const VoiceSetPttBindingParamsSchema = z.object({ binding: z.string().min(1) })
export const VoiceSetPttBindingResultSchema = z.object({ ok: z.boolean(), conflict: z.boolean() })

// voice.setSettings
export const VoiceSetSettingsParamsSchema = z.object({
  sttModel: z.enum(['tiny.en', 'base.en', 'small.en']).optional(),
  ttsVoiceId: z.string().nullable().optional(),
  speakBriefings: z.boolean().optional(),
  speakSuggestionConfirmations: z.boolean().optional(),
  wakeWordEnabled: z.boolean().optional(),
  conversationMode: z.boolean().optional(),
  wakeWordSensitivity: z.enum(['low', 'medium', 'high']).optional(),
})
export const VoiceSetSettingsResultSchema = z.object({ ok: z.boolean() })

// voice.getSettings
export const VoiceGetSettingsParamsSchema = z.object({})
export const VoiceGetSettingsResultSchema = z.object({
  sttModel: z.string(),
  ttsVoiceId: z.string().nullable(),
  speakBriefings: z.boolean(),
  speakSuggestionConfirmations: z.boolean(),
  wakeWordEnabled: z.boolean(),
  conversationMode: z.boolean(),
  wakeWordSensitivity: z.enum(['low', 'medium', 'high']),
})
