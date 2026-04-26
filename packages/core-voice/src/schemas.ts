import { z } from 'zod'

export const VoiceStateSchema = z.enum(['idle', 'listening', 'transcribing', 'speaking'])
export type VoiceState = z.infer<typeof VoiceStateSchema>

export const SttModelIdSchema = z.enum(['tiny.en', 'base.en', 'small.en'])
export type SttModelId = z.infer<typeof SttModelIdSchema>

export const VoiceTranscriptSchema = z.object({
  id: z.string(),
  ts: z.number(),
  durationMs: z.number(),
  text: z.string(),
  routedTo: z.string().optional(),
  sessionId: z.string().optional(),
})
export type VoiceTranscript = z.infer<typeof VoiceTranscriptSchema>

export const VoiceModelInfoSchema = z.object({
  id: SttModelIdSchema,
  name: z.string(),
  sizeBytes: z.number(),
  installed: z.boolean(),
  path: z.string().optional(),
})
export type VoiceModelInfo = z.infer<typeof VoiceModelInfoSchema>

export const TtsProviderSchema = z.enum(['piper', 'sapi'])
export type TtsProvider = z.infer<typeof TtsProviderSchema>

export const TtsVoiceQualitySchema = z.enum(['x_low', 'low', 'medium', 'high'])
export type TtsVoiceQuality = z.infer<typeof TtsVoiceQualitySchema>

export const TtsVoiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  lang: z.string(),
  provider: TtsProviderSchema.default('sapi'),
  quality: TtsVoiceQualitySchema.optional(),
  sampleRate: z.number().optional(),
  installed: z.boolean().default(true),
  licence: z.string().optional(),
})
export type TtsVoice = z.infer<typeof TtsVoiceSchema>

export const PiperVoiceDownloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  lang: z.string(),
  quality: TtsVoiceQualitySchema,
  sampleRate: z.number(),
  sizeBytes: z.number(),
  urlOnnx: z.string(),
  urlJson: z.string(),
  sha256Onnx: z.string(),
  sha256Json: z.string(),
  licence: z.string(),
  installed: z.boolean(),
})
export type PiperVoiceDownload = z.infer<typeof PiperVoiceDownloadSchema>

export const VoiceStatusSchema = z.object({
  sttReady: z.boolean(),
  ttsReady: z.boolean(),
  micGranted: z.boolean(),
  state: VoiceStateSchema,
  enabled: z.boolean(),
})
export type VoiceStatus = z.infer<typeof VoiceStatusSchema>

// Worker JSON-line protocol messages
export const WhisperWorkerInSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('load'), modelPath: z.string() }),
  z.object({ type: z.literal('chunk'), pcm16Base64: z.string() }),
  z.object({ type: z.literal('end') }),
  z.object({ type: z.literal('ping') }),
])
export type WhisperWorkerIn = z.infer<typeof WhisperWorkerInSchema>

export const WhisperWorkerOutSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('partial'), text: z.string() }),
  z.object({ type: z.literal('final'), text: z.string(), confidence: z.number() }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({ type: z.literal('pong') }),
])
export type WhisperWorkerOut = z.infer<typeof WhisperWorkerOutSchema>

export const VoiceSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  pttBinding: z.string().default('CommandOrControl+Shift+Space'),
  sttModel: SttModelIdSchema.default('base.en'),
  ttsVoiceId: z.string().nullable().default(null),
  speakBriefings: z.boolean().default(true),
  speakSuggestionConfirmations: z.boolean().default(true),
})
export type VoiceSettings = z.infer<typeof VoiceSettingsSchema>
