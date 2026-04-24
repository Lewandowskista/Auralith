import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { Mic, MicOff, Volume2, Download, CheckCircle, Radio } from 'lucide-react'
import { toast } from 'sonner'

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
}

type VoiceStatus = {
  enabled: boolean
  sttReady: boolean
  ttsReady: boolean
  micGranted: boolean
  state: string
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
  const [selectedModel, setSelectedModel] = useState('base.en')
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [speakBriefings, setSpeakBriefings] = useState(true)
  const [speakSuggestions, setSpeakSuggestions] = useState(true)
  const [pttBinding, setPttBinding] = useState('CommandOrControl+Shift+Space')
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false)
  const [conversationMode, setConversationMode] = useState(false)
  const [wakeWordSensitivity, setWakeWordSensitivity] = useState<WakeWordSensitivity>('medium')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [statusRes, modelsRes, voicesRes, voiceSettingsRes] = await Promise.all([
        window.auralith.invoke('voice.getStatus', {}),
        window.auralith.invoke('voice.listSttModels', {}),
        window.auralith.invoke('voice.listTtsVoices', {}),
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

      // PTT binding stored separately in settings table
      const pttRes = await window.auralith.invoke('settings.get', { key: 'voice.pttBinding' })
      if (pttRes.ok && (pttRes.data as { value: unknown }).value)
        setPttBinding((pttRes.data as { value: string }).value)
    } catch (err) {
      console.error('[VoiceSection] Failed to load voice settings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
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

  async function requestMicPermission(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      await window.auralith.invoke('settings.set', { key: 'voice.micGranted', value: true })
      await window.auralith.invoke('permissions.grant', { scope: 'mic:capture' })
      setStatus((prev) => (prev ? { ...prev, micGranted: true } : prev))
      toast.success('Microphone access granted')
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

  return (
    <div data-testid="voice-section" className="max-w-lg space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[#F4F4F8]">Voice</h2>
        <p className="text-sm text-[#6F6F80]">
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
            <MicOff size={16} className="text-[#6F6F80] shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-[#F4F4F8]">Enable voice</p>
            <p className="text-xs text-[#6F6F80]">Activates push-to-talk ({displayPttBinding})</p>
          </div>
        </div>
        <Toggle
          checked={enabled}
          onChange={() => void toggleEnabled()}
          ariaLabel="Enable voice"
          testId="voice-enable-toggle"
        />
      </div>

      {/* Mic permission */}
      {!micGranted && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-300 mb-2">Microphone permission required</p>
          <p className="text-xs text-[#A6A6B3] mb-3">
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
        <p className="text-sm font-medium text-[#F4F4F8] mb-2">Speech recognition model</p>
        <div className="space-y-2">
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => void handleModelChange(m.id)}
              className={[
                'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors',
                selectedModel === m.id
                  ? 'border-violet-500/50 bg-violet-500/10 text-[#F4F4F8]'
                  : 'border-white/[0.06] bg-white/[0.02] text-[#A6A6B3] hover:bg-white/5',
              ].join(' ')}
            >
              <div>
                <p className="text-xs font-medium">{m.name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.installed ? (
                  <CheckCircle size={13} className="text-emerald-400" />
                ) : (
                  <span className="text-[10px] text-[#6F6F80]">Not installed</span>
                )}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[#6F6F80]">
          Models are bundled with the installer. Larger models are more accurate but slower.
        </p>
      </div>

      {/* TTS Voice */}
      {voices.length > 0 && (
        <div>
          <p className="text-sm font-medium text-[#F4F4F8] mb-1.5">
            <Volume2 size={13} className="inline mr-1.5" />
            Text-to-speech voice
          </p>
          <select
            value={selectedVoice}
            onChange={(e) => void handleVoiceChange(e.target.value)}
            className="w-full rounded-lg border border-white/[0.09] bg-[var(--color-bg-1)] px-3 py-2 text-sm text-[#F4F4F8] focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">System default</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* TTS toggles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[#F4F4F8]">Speak morning briefings</p>
            <p className="text-xs text-[#6F6F80]">Read out the daily briefing aloud</p>
          </div>
          <Toggle
            checked={speakBriefings}
            onChange={() => void handleToggleBriefings()}
            ariaLabel="Speak briefings"
          />
        </div>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[#F4F4F8]">Speak suggestion confirmations</p>
            <p className="text-xs text-[#6F6F80]">Confirm accepted suggestions aloud</p>
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
          <p className="text-sm font-semibold text-[#F4F4F8] mb-0.5 flex items-center gap-1.5">
            <Radio size={13} className="text-violet-400" />
            Wake word
          </p>
          <p className="text-xs text-[#6F6F80]">
            Activate the assistant hands-free by saying "Hey Auralith". Uses Windows built-in speech
            recognition — no internet connection required.
          </p>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[#F4F4F8]">Enable "Hey Auralith"</p>
            <p className="text-xs text-[#6F6F80]">Always-on keyword detection via System.Speech</p>
          </div>
          <Toggle
            checked={wakeWordEnabled}
            onChange={() => void handleToggleWakeWord()}
            ariaLabel="Enable wake word"
          />
        </div>

        {wakeWordEnabled && (
          <div>
            <p className="text-xs font-medium text-[#A6A6B3] mb-2">Detection sensitivity</p>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as WakeWordSensitivity[]).map((s) => (
                <button
                  key={s}
                  onClick={() => void handleSensitivityChange(s)}
                  className={[
                    'flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors capitalize',
                    wakeWordSensitivity === s
                      ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                      : 'border-white/[0.06] bg-white/[0.02] text-[#6F6F80] hover:bg-white/5 hover:text-[#A6A6B3]',
                  ].join(' ')}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[#6F6F80]">
              High sensitivity detects the phrase more easily but may trigger on similar-sounding
              words.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[#F4F4F8]">Conversation mode</p>
            <p className="text-xs text-[#6F6F80]">
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

      {/* Privacy note */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-[#6F6F80]">
        <p className="font-medium text-[#A6A6B3] mb-1">Privacy</p>
        Voice only activates when you press the hotkey or say the wake phrase. Audio is processed
        entirely on-device — by whisper.cpp for transcription and Windows System.Speech for keyword
        detection. No audio is saved or transmitted anywhere.
        {wakeWordEnabled && (
          <>
            <br />
            <br />
            <strong className="text-[#A6A6B3]">Wake word note:</strong> The microphone is
            continuously monitored for the wake phrase when enabled. Only the keyword detection
            result is processed — raw audio is never stored or sent anywhere.
          </>
        )}
        <br />
        <br />
        <Download size={11} className="inline mr-1" />
        Models are bundled with the installer and never downloaded or updated automatically.
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
