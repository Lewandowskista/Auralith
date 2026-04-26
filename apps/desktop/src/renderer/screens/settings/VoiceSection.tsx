import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import {
  Mic,
  MicOff,
  Volume2,
  Download,
  CheckCircle,
  Radio,
  Activity,
  Trash2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

const MIC_METER_BARS = 10

type SttModel = {
  id: string
  name: string
  sizeBytes: number
  installed: boolean
}

type TtsVoice = {
  id: string
  name: string
  lang: string
  provider?: string
  quality?: string
  installed?: boolean
}

type PiperVoiceDownload = {
  id: string
  name: string
  lang: string
  quality: string
  sizeBytes: number
  installed: boolean
  licence: string
}

type DownloadProgress = {
  voiceId: string
  bytesReceived: number
  bytesTotal: number
  phase: 'onnx' | 'json' | 'done'
  error?: string
}

type VoiceStatus = {
  enabled: boolean
  sttReady: boolean
  ttsReady: boolean
  micGranted: boolean
  state: string
  resourcesOk?: boolean
  missingResources?: string[]
}

type WakeWordSensitivity = 'low' | 'medium' | 'high'

function Toggle({
  checked,
  onChange,
  ariaLabel,
  testId,
}: {
  checked: boolean
  onChange: () => void
  ariaLabel: string
  testId?: string
}): ReactElement {
  return (
    <button
      data-testid={testId}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
        checked ? 'bg-violet-500' : 'bg-white/20',
      ].join(' ')}
    >
      <span
        className={[
          'block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  )
}

export function VoiceSection(): ReactElement {
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [models, setModels] = useState<SttModel[]>([])
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [availableVoices, setAvailableVoices] = useState<PiperVoiceDownload[]>([])
  const [selectedModel, setSelectedModel] = useState('base.en')
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [ttsLengthScale, setTtsLengthScale] = useState(1.0)
  const [speakBriefings, setSpeakBriefings] = useState(true)
  const [speakSuggestions, setSpeakSuggestions] = useState(true)
  const [pttBinding, setPttBinding] = useState('CommandOrControl+Shift+Space')
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false)
  const [conversationMode, setConversationMode] = useState(false)
  const [wakeWordSensitivity, setWakeWordSensitivity] = useState<WakeWordSensitivity>('medium')
  const [vadEnabled, setVadEnabled] = useState(false)
  const [vadThreshold, setVadThreshold] = useState(200)
  const [micLevel, setMicLevel] = useState(0)
  const [loading, setLoading] = useState(true)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadProgress>>({})
  const [downloading, setDownloading] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const [statusRes, modelsRes, voicesRes, availableVoicesRes, voiceSettingsRes] =
        await Promise.all([
          window.auralith.invoke('voice.getStatus', {}),
          window.auralith.invoke('voice.listSttModels', {}),
          window.auralith.invoke('voice.listTtsVoices', {}),
          window.auralith.invoke('voice.listAvailableTtsVoices', {}),
          window.auralith.invoke('voice.getSettings', {}),
        ])

      if (statusRes.ok) setStatus(statusRes.data as VoiceStatus)
      if (modelsRes.ok) {
        const { models: m } = modelsRes.data as { models: SttModel[] }
        setModels(m)
      }
      if (voicesRes.ok) {
        const { voices: v } = voicesRes.data as { voices: TtsVoice[] }
        setVoices(v)
      }
      if (availableVoicesRes.ok) {
        const { voices: av } = availableVoicesRes.data as { voices: PiperVoiceDownload[] }
        setAvailableVoices(av)
      }
      if (voiceSettingsRes.ok) {
        const s = voiceSettingsRes.data as {
          sttModel: string
          ttsVoiceId: string | null
          speakBriefings: boolean
          speakSuggestionConfirmations: boolean
          wakeWordEnabled: boolean
          conversationMode: boolean
          wakeWordSensitivity: WakeWordSensitivity
        }
        setSelectedModel(s.sttModel)
        setSelectedVoice(s.ttsVoiceId ?? '')
        setSpeakBriefings(s.speakBriefings)
        setSpeakSuggestions(s.speakSuggestionConfirmations)
        setWakeWordEnabled(s.wakeWordEnabled)
        setConversationMode(s.conversationMode)
        setWakeWordSensitivity(s.wakeWordSensitivity)
      }

      // PTT binding + VAD + TTS speed settings stored separately in settings table
      const [pttRes, vadEnabledRes, vadThresholdRes, lengthScaleRes] = await Promise.all([
        window.auralith.invoke('settings.get', { key: 'voice.pttBinding' }),
        window.auralith.invoke('settings.get', { key: 'voice.vadEnabled' }),
        window.auralith.invoke('settings.get', { key: 'voice.vadThreshold' }),
        window.auralith.invoke('settings.get', { key: 'voice.ttsLengthScale' }),
      ])
      if (pttRes.ok && (pttRes.data as { value: unknown }).value)
        setPttBinding((pttRes.data as { value: string }).value)
      if (vadEnabledRes.ok && (vadEnabledRes.data as { value: unknown }).value !== undefined)
        setVadEnabled(Boolean((vadEnabledRes.data as { value: unknown }).value))
      if (vadThresholdRes.ok && (vadThresholdRes.data as { value: unknown }).value !== undefined)
        setVadThreshold(Number((vadThresholdRes.data as { value: unknown }).value) || 200)
      if (lengthScaleRes.ok && (lengthScaleRes.data as { value: unknown }).value !== undefined)
        setTtsLengthScale(Number((lengthScaleRes.data as { value: unknown }).value) || 1.0)
    } catch (err) {
      console.error('[VoiceSection] Failed to load voice settings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Subscribe to live mic level for the meter
  useEffect(() => {
    const unsub = window.auralith.on('voice:level', (data) => {
      const { level } = data as { level: number }
      setMicLevel(level)
    })
    return unsub
  }, [])

  // Subscribe to TTS voice download progress
  useEffect(() => {
    const unsub = window.auralith.on('voice:tts-download-progress', (data) => {
      const p = data as DownloadProgress
      setDownloadProgress((prev) => ({ ...prev, [p.voiceId]: p }))
      if (p.phase === 'done') {
        setDownloading((prev) => {
          const next = new Set(prev)
          next.delete(p.voiceId)
          return next
        })
        // Reload voices after download completes
        void load()
        toast.success(`Voice "${p.voiceId}" downloaded`)
      }
      if (p.error) {
        setDownloading((prev) => {
          const next = new Set(prev)
          next.delete(p.voiceId)
          return next
        })
        toast.error(`Failed to download voice: ${p.error}`)
      }
    })
    return unsub
  }, [load])

  async function toggleEnabled(): Promise<void> {
    if (!status) return
    const next = !status.enabled
    const res = await window.auralith.invoke('voice.setEnabled', { enabled: next })
    if (res.ok) {
      const result = res.data as { ok: boolean; conflict?: boolean }
      if (result.conflict) {
        toast.error(`PTT hotkey conflict: ${pttBinding}. Change the binding and try again.`)
        return
      }
      setStatus((prev) => (prev ? { ...prev, enabled: next } : prev))
      toast.success(next ? 'Voice enabled' : 'Voice disabled')
    } else {
      toast.error('Failed to toggle voice')
    }
  }

  async function handleModelChange(modelId: string): Promise<void> {
    setSelectedModel(modelId)
    await window.auralith.invoke('voice.setSettings', { sttModel: modelId })
  }

  async function handleVoiceChange(voiceId: string): Promise<void> {
    setSelectedVoice(voiceId)
    await window.auralith.invoke('voice.setSettings', { ttsVoiceId: voiceId || null })
  }

  async function handleToggleBriefings(): Promise<void> {
    const next = !speakBriefings
    setSpeakBriefings(next)
    await window.auralith.invoke('voice.setSettings', { speakBriefings: next })
  }

  async function handleToggleSuggestions(): Promise<void> {
    const next = !speakSuggestions
    setSpeakSuggestions(next)
    await window.auralith.invoke('voice.setSettings', { speakSuggestionConfirmations: next })
  }

  async function handleToggleWakeWord(): Promise<void> {
    const next = !wakeWordEnabled
    setWakeWordEnabled(next)
    const res = await window.auralith.invoke('voice.setSettings', { wakeWordEnabled: next })
    if (!res.ok) {
      setWakeWordEnabled(!next)
      toast.error('Failed to update wake word setting')
    } else {
      toast.success(next ? '"Hey Auralith" enabled' : 'Wake word disabled')
    }
  }

  async function handleToggleConversationMode(): Promise<void> {
    const next = !conversationMode
    setConversationMode(next)
    await window.auralith.invoke('voice.setSettings', { conversationMode: next })
  }

  async function handleSensitivityChange(s: WakeWordSensitivity): Promise<void> {
    setWakeWordSensitivity(s)
    await window.auralith.invoke('voice.setSettings', { wakeWordSensitivity: s })
  }

  async function handleToggleVad(): Promise<void> {
    const next = !vadEnabled
    setVadEnabled(next)
    await window.auralith.invoke('voice.setSettings', { vadEnabled: next })
  }

  async function handleVadThreshold(val: number): Promise<void> {
    setVadThreshold(val)
    await window.auralith.invoke('voice.setSettings', { vadThreshold: val })
  }

  async function handleTtsLengthScale(val: number): Promise<void> {
    setTtsLengthScale(val)
    await window.auralith.invoke('voice.setSettings', { ttsLengthScale: val })
  }

  async function handleDownloadVoice(voiceId: string): Promise<void> {
    setDownloading((prev) => new Set(prev).add(voiceId))
    const res = await window.auralith.invoke('voice.downloadTtsVoice', { voiceId })
    if (!res.ok) {
      setDownloading((prev) => {
        const next = new Set(prev)
        next.delete(voiceId)
        return next
      })
      toast.error('Download failed')
    }
  }

  async function handleDeleteVoice(voiceId: string): Promise<void> {
    const res = await window.auralith.invoke('voice.deleteTtsVoice', { voiceId })
    if (res.ok) {
      if (selectedVoice === voiceId) {
        setSelectedVoice('')
        await window.auralith.invoke('voice.setSettings', { ttsVoiceId: null })
      }
      toast.success('Voice removed')
      void load()
    } else {
      toast.error('Failed to remove voice')
    }
  }

  async function requestMicPermission(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      await window.auralith.invoke('settings.set', { key: 'voice.micGranted', value: true })
      await window.auralith.invoke('permissions.grant', { scope: 'mic:capture' })
      setStatus((prev) => (prev ? { ...prev, micGranted: true } : prev))
      toast.success('Microphone access granted')
      void load()
    } catch {
      toast.error('Microphone access denied. Check system permissions.')
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  const enabled = status?.enabled ?? false
  const micGranted = status?.micGranted ?? false
  const displayPttBinding = normalizeBinding(pttBinding)
  const usingPiper =
    (status as (VoiceStatus & { ttsUsingPiper?: boolean }) | null)?.ttsUsingPiper ?? false
  const installedVoiceIds = new Set(voices.map((v) => v.id))

  return (
    <div data-testid="voice-section" className="max-w-lg space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[var(--color-text-primary)]">Voice</h2>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Push-to-talk voice assistant using local speech recognition. Audio is never stored or
          transmitted.
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          {enabled ? (
            <Mic size={16} className="text-violet-400 shrink-0" />
          ) : (
            <MicOff size={16} className="text-[var(--color-text-tertiary)] shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Enable voice</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Activates push-to-talk ({displayPttBinding})
            </p>
          </div>
        </div>
        <Toggle
          checked={enabled}
          onChange={() => void toggleEnabled()}
          ariaLabel="Enable voice"
          testId="voice-enable-toggle"
        />
      </div>

      {/* Resources missing warning */}
      {status?.resourcesOk === false && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="mb-1 text-sm font-medium text-red-300">Whisper resources not found</p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Voice transcription will not work. Missing: {(status.missingResources ?? []).join(', ')}
            . Ensure model files are bundled with the installer in{' '}
            <code className="font-mono text-red-300">resources/whisper/</code>.
          </p>
        </div>
      )}

      {/* Mic permission */}
      {!micGranted && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-300 mb-2">Microphone permission required</p>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Voice capture requires microphone access. Click below to grant permission.
          </p>
          <button
            onClick={() => void requestMicPermission()}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
          >
            Grant microphone access
          </button>
        </div>
      )}

      {/* STT Model */}
      <div data-testid="stt-models">
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
          Speech recognition model
        </p>
        <div className="space-y-2">
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => void handleModelChange(m.id)}
              className={[
                'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors',
                selectedModel === m.id
                  ? 'border-violet-500/50 bg-violet-500/10 text-[var(--color-text-primary)]'
                  : 'border-white/[0.06] bg-white/[0.02] text-[var(--color-text-secondary)] hover:bg-white/5',
              ].join(' ')}
            >
              <div>
                <p className="text-xs font-medium">{m.name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.installed ? (
                  <CheckCircle size={13} className="text-emerald-400" />
                ) : (
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    Not installed
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
          Models are bundled with the installer. Larger models are more accurate but slower.
        </p>
      </div>

      {/* TTS Voice */}
      <div>
        <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-0.5 flex items-center gap-1.5">
          <Volume2 size={13} className="text-violet-400" />
          Text-to-speech voice
          {usingPiper && (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-medium">
              Neural
            </span>
          )}
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          {usingPiper
            ? 'Using Piper neural TTS — high-quality local synthesis.'
            : 'Using Windows built-in voices (SAPI5). Download a Piper voice below for better quality.'}
        </p>

        {/* Installed voices */}
        {voices.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {voices.map((v) => (
              <div
                key={v.id}
                className={[
                  'flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                  selectedVoice === v.id
                    ? 'border-violet-500/50 bg-violet-500/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/5',
                ].join(' ')}
                onClick={() => void handleVoiceChange(v.id)}
              >
                <div className="flex items-center gap-2">
                  {selectedVoice === v.id && (
                    <CheckCircle size={13} className="text-violet-400 shrink-0" />
                  )}
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-primary)]">{v.name}</p>
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">
                      {v.lang}
                      {v.quality ? ` · ${v.quality}` : ''}
                      {v.provider === 'piper' ? ' · Neural' : ' · System'}
                    </p>
                  </div>
                </div>
                {v.provider === 'piper' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDeleteVoice(v.id)
                    }}
                    className="ml-2 p-1 rounded text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Remove voice"
                    aria-label={`Remove ${v.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Test + speed */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() =>
              void window.auralith.invoke('voice.speak', {
                text: 'Auralith is ready. How can I help?',
                voiceId: selectedVoice || undefined,
                lengthScale: ttsLengthScale,
              })
            }
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-hairline)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04]"
          >
            <Volume2 size={12} />
            Test voice
          </button>
        </div>

        {/* Speed slider (Piper length_scale) */}
        {usingPiper && (
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Speech speed{' '}
              <span className="font-mono text-violet-300">
                {ttsLengthScale === 1.0 ? 'Normal' : ttsLengthScale < 1.0 ? 'Faster' : 'Slower'}
              </span>
            </p>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={ttsLengthScale}
              onChange={(e) => void handleTtsLengthScale(Number(e.target.value))}
              className="w-full accent-violet-500"
              aria-label="TTS speech speed"
            />
            <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)] mt-1">
              <span>Faster (0.5×)</span>
              <span>Normal</span>
              <span>Slower (2×)</span>
            </div>
          </div>
        )}

        {/* Available Piper voices to download */}
        {availableVoices.filter((v) => !v.installed).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2 flex items-center gap-1.5">
              <Download size={11} />
              Available neural voices
            </p>
            <div className="space-y-1.5">
              {availableVoices
                .filter((v) => !installedVoiceIds.has(v.id))
                .map((v) => {
                  const prog = downloadProgress[v.id]
                  const isDownloading = downloading.has(v.id)
                  const pct =
                    prog && prog.bytesTotal > 0
                      ? Math.round((prog.bytesReceived / prog.bytesTotal) * 100)
                      : 0

                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]"
                    >
                      <div>
                        <p className="text-xs font-medium text-[var(--color-text-primary)]">
                          {v.name}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-tertiary)]">
                          {v.lang} · {v.quality} · {formatBytes(v.sizeBytes)} · {v.licence}
                        </p>
                        {isDownloading && prog && prog.bytesTotal > 0 && (
                          <div className="mt-1 h-1 w-32 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-violet-500 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => void handleDownloadVoice(v.id)}
                        disabled={isDownloading}
                        className="ml-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/[0.09] text-[10px] text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        {isDownloading ? (
                          <>
                            <Loader2 size={10} className="animate-spin" />
                            {pct > 0 ? `${pct}%` : 'Downloading…'}
                          </>
                        ) : (
                          <>
                            <Download size={10} />
                            Download
                          </>
                        )}
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>

      {/* TTS toggles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Speak morning briefings
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Read out the daily briefing aloud
            </p>
          </div>
          <Toggle
            checked={speakBriefings}
            onChange={() => void handleToggleBriefings()}
            ariaLabel="Speak briefings"
          />
        </div>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Speak suggestion confirmations
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Confirm accepted suggestions aloud
            </p>
          </div>
          <Toggle
            checked={speakSuggestions}
            onChange={() => void handleToggleSuggestions()}
            ariaLabel="Speak suggestion confirmations"
          />
        </div>
      </div>

      {/* Wake word */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-0.5 flex items-center gap-1.5">
            <Radio size={13} className="text-violet-400" />
            Wake word
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Activate the assistant hands-free by saying "Hey Auralith". Uses Windows built-in speech
            recognition — no internet connection required.
          </p>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Enable "Hey Auralith"
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Always-on keyword detection via System.Speech
            </p>
          </div>
          <Toggle
            checked={wakeWordEnabled}
            onChange={() => void handleToggleWakeWord()}
            ariaLabel="Enable wake word"
          />
        </div>

        {wakeWordEnabled && (
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              Detection sensitivity
            </p>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as WakeWordSensitivity[]).map((s) => (
                <button
                  key={s}
                  onClick={() => void handleSensitivityChange(s)}
                  className={[
                    'flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors capitalize',
                    wakeWordSensitivity === s
                      ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                      : 'border-white/[0.06] bg-white/[0.02] text-[var(--color-text-tertiary)] hover:bg-white/5 hover:text-[var(--color-text-secondary)]',
                  ].join(' ')}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--color-text-tertiary)]">
              High sensitivity detects the phrase more easily but may trigger on similar-sounding
              words.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Conversation mode
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              After a response, keep the mic open for 10 s so you can follow up without pressing PTT
            </p>
          </div>
          <Toggle
            checked={conversationMode}
            onChange={() => void handleToggleConversationMode()}
            ariaLabel="Enable conversation mode"
          />
        </div>
      </div>

      {/* VAD + Live mic meter */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-0.5 flex items-center gap-1.5">
            <Activity size={13} className="text-violet-400" />
            Voice activity detection
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Automatically stops recording when you pause. Uses energy-based detection.
          </p>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Auto-stop on silence
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Ends capture when ~400 ms of silence is detected
            </p>
          </div>
          <Toggle
            checked={vadEnabled}
            onChange={() => void handleToggleVad()}
            ariaLabel="Enable VAD auto-stop"
          />
        </div>

        {vadEnabled && (
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              Sensitivity threshold{' '}
              <span className="ml-1 font-mono text-violet-300">{vadThreshold}</span>
            </p>
            <input
              type="range"
              min={50}
              max={600}
              step={25}
              value={vadThreshold}
              onChange={(e) => void handleVadThreshold(Number(e.target.value))}
              className="w-full accent-violet-500"
              aria-label="VAD sensitivity threshold"
            />
            <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)] mt-1">
              <span>More sensitive</span>
              <span>Less sensitive</span>
            </div>
          </div>
        )}

        {/* Live mic level meter — visible whenever voice is active */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2.5 flex items-center gap-1.5">
            <Mic size={11} />
            Live mic level
          </p>
          <div
            className="flex items-end gap-0.5 h-6"
            role="meter"
            aria-label="Microphone level"
            aria-valuenow={Math.round(micLevel * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {Array.from({ length: MIC_METER_BARS }, (_, i) => {
              const threshold = (i + 1) / MIC_METER_BARS
              const lit = micLevel >= threshold
              return (
                <div
                  key={i}
                  aria-hidden="true"
                  className="flex-1 rounded-sm transition-all duration-75"
                  style={{
                    height: lit ? `${8 + i * 1.6}px` : '3px',
                    background: lit
                      ? i < 6
                        ? 'rgb(139,92,246)'
                        : i < 8
                          ? 'rgb(167,139,250)'
                          : 'rgb(196,181,253)'
                      : 'rgba(139,92,246,0.15)',
                  }}
                />
              )
            })}
          </div>
          <p className="mt-2 text-[10px] text-[var(--color-text-tertiary)]">
            {micLevel > 0.05 ? 'Audio detected' : 'Speak to test your microphone level'}
          </p>
        </div>
      </div>

      {/* Privacy note */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-[var(--color-text-tertiary)]">
        <p className="font-medium text-[var(--color-text-secondary)] mb-1">Privacy</p>
        Voice only activates when you press the hotkey or say the wake phrase. Audio is processed
        entirely on-device — by whisper.cpp for transcription, Piper for neural speech synthesis,
        and Windows System.Speech for keyword detection. No audio is saved or transmitted anywhere.
        {wakeWordEnabled && (
          <>
            <br />
            <br />
            <strong className="text-[var(--color-text-secondary)]">Wake word note:</strong> The
            microphone is continuously monitored for the wake phrase when enabled. Only the keyword
            detection result is processed — raw audio is never stored or sent anywhere.
          </>
        )}
        <br />
        <br />
        <Download size={11} className="inline mr-1" />
        Whisper models are bundled with the installer. Piper neural voices are downloaded on demand
        and stored locally in your user data folder.
      </div>
    </div>
  )
}

function normalizeBinding(binding: string): string {
  return binding
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/ArrowUp/g, 'Up')
    .replace(/ArrowDown/g, 'Down')
    .replace(/ArrowLeft/g, 'Left')
    .replace(/ArrowRight/g, 'Right')
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`
  return `${Math.round(bytes / 1_000)} KB`
}
