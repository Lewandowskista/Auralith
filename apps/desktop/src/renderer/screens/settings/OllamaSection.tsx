import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { Wifi, WifiOff, Loader2, CheckCircle, XCircle, RefreshCw, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

type ConnectionState = 'idle' | 'checking' | 'online' | 'offline'
type TestState = 'idle' | 'running' | 'ok' | 'fail'

type Config = {
  url: string
  chatModel: string
  embedModel: string
  classifierModel: string
}

type ModelPickerProps = {
  label: string
  description: string
  value: string
  models: string[]
  onChange: (v: string) => void
  disabled?: boolean
}

function ModelPicker({
  label,
  description,
  value,
  models,
  onChange,
  disabled,
}: ModelPickerProps): ReactElement {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#F4F4F8]">{label}</p>
        <p className="mt-0.5 text-xs text-[#6F6F80]">{description}</p>
      </div>
      <div className="relative shrink-0">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none rounded-lg pr-7 pl-3 py-1.5 text-sm text-[#F4F4F8] focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-40 cursor-default"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            minWidth: 200,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {value && !models.includes(value) && <option value={value}>{value}</option>}
          {models.length === 0 && (
            <option value="" disabled>
              No models available
            </option>
          )}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#6F6F80]"
        />
      </div>
    </div>
  )
}

type FeatureTestRowProps = {
  label: string
  description: string
  state: TestState
  onRun: () => void
  latencyMs?: number
  error?: string
  disabled?: boolean
}

function FeatureTestRow({
  label,
  description,
  state,
  onRun,
  latencyMs,
  error,
  disabled,
}: FeatureTestRowProps): ReactElement {
  return (
    <div
      className="flex items-start justify-between gap-4 py-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[#F4F4F8]">{label}</p>
          {state === 'ok' && latencyMs !== undefined && (
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
              {latencyMs}ms
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[#6F6F80]">{description}</p>
        {state === 'fail' && error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {state === 'running' && (
          <span className="flex items-center gap-1.5 text-xs text-[#6F6F80]">
            <Loader2 size={13} className="animate-spin" />
            Loading…
          </span>
        )}
        {state === 'ok' && <CheckCircle size={14} className="text-emerald-400" />}
        {state === 'fail' && <XCircle size={14} className="text-red-400" />}
        <button
          onClick={onRun}
          disabled={disabled || state === 'running'}
          className="rounded-lg px-3 py-1.5 text-xs text-[#A6A6B3] transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
          onMouseEnter={(e) => {
            if (!(disabled || state === 'running'))
              e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          }}
        >
          Test
        </button>
      </div>
    </div>
  )
}

export function OllamaSection(): ReactElement {
  const [config, setConfig] = useState<Config>({
    url: 'http://localhost:11434',
    chatModel: 'qwen2.5:7b-instruct',
    embedModel: 'nomic-embed-text',
    classifierModel: 'nomic-embed-text',
  })
  const [urlDraft, setUrlDraft] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [chatTest, setChatTest] = useState<{
    state: TestState
    latencyMs?: number
    error?: string
  }>({ state: 'idle' })
  const [embedTest, setEmbedTest] = useState<{
    state: TestState
    latencyMs?: number
    error?: string
  }>({ state: 'idle' })

  useEffect(() => {
    void (async () => {
      const res = await window.auralith.invoke('ollama.getConfig', {})
      if (res.ok) {
        const d = res.data as Config
        setConfig(d)
        setUrlDraft(d.url)
      }
      setLoading(false)
    })()
  }, [])

  const testConnection = useCallback(async (url: string): Promise<void> => {
    setConnectionState('checking')
    setModels([])
    const res = await window.auralith.invoke('ollama.ping', { url })
    if (res.ok) {
      const d = res.data as { online: boolean; modelCount: number }
      if (d.online) {
        setConnectionState('online')
        const modRes = await window.auralith.invoke('ollama.listModels', { url })
        if (modRes.ok) {
          const md = modRes.data as { models: string[] }
          setModels(md.models)
        }
      } else {
        setConnectionState('offline')
      }
    } else {
      setConnectionState('offline')
    }
  }, [])

  async function handleSave(): Promise<void> {
    setSaving(true)
    const res = await window.auralith.invoke('ollama.saveConfig', {
      url: urlDraft,
      chatModel: config.chatModel,
      embedModel: config.embedModel,
      classifierModel: config.classifierModel,
    })
    setSaving(false)
    if (res.ok) {
      setConfig((c) => ({ ...c, url: urlDraft }))
      toast.success('Ollama configuration saved — restart may be needed for model changes')
    } else {
      toast.error('Failed to save configuration')
    }
  }

  async function runFeatureTest(feature: 'chat' | 'embed'): Promise<void> {
    const model = feature === 'chat' ? config.chatModel : config.embedModel
    const setter = feature === 'chat' ? setChatTest : setEmbedTest
    setter({ state: 'running' })
    const res = await window.auralith.invoke('ollama.testFeature', {
      url: urlDraft,
      feature,
      model,
    })
    if (res.ok) {
      const d = res.data as { ok: boolean; latencyMs: number; error?: string }
      setter({
        state: d.ok ? 'ok' : 'fail',
        latencyMs: d.latencyMs,
        ...(d.error !== undefined ? { error: d.error } : {}),
      })
    } else {
      setter({ state: 'fail', error: 'IPC error' })
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />
        ))}
      </div>
    )
  }

  const isDirty = urlDraft !== config.url

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[#F4F4F8]">Ollama</h2>
        <p className="text-sm text-[#6F6F80]">
          Configure the local Ollama endpoint and model selection.
        </p>
      </div>

      {/* Connection */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6F6F80]">Connection</p>
        <div
          className="rounded-xl"
          style={{
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-[#6F6F80]">Endpoint URL</label>
              <input
                type="text"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void testConnection(urlDraft)
                }}
                placeholder="http://localhost:11434"
                className="w-full rounded-lg px-3 py-1.5 text-sm text-[#F4F4F8] placeholder-[#4B4B5A] focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              />
            </div>
          </div>

          {/* Status row */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
          >
            <div className="flex items-center gap-2 text-sm">
              {connectionState === 'checking' && (
                <>
                  <Loader2 size={13} className="animate-spin text-[#6F6F80]" />
                  <span className="text-[#6F6F80]">Checking…</span>
                </>
              )}
              {connectionState === 'online' && (
                <>
                  <Wifi size={13} className="text-emerald-400" />
                  <span className="text-emerald-300">
                    Connected — {models.length} model{models.length !== 1 ? 's' : ''} available
                  </span>
                </>
              )}
              {connectionState === 'offline' && (
                <>
                  <WifiOff size={13} className="text-red-400" />
                  <span className="text-red-300">Unreachable — is Ollama running?</span>
                </>
              )}
              {connectionState === 'idle' && <span className="text-[#4B4B5A]">Not tested</span>}
            </div>
            <button
              onClick={() => void testConnection(urlDraft)}
              disabled={connectionState === 'checking'}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#A6A6B3] transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
              onMouseEnter={(e) => {
                if (connectionState !== 'checking')
                  e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              }}
            >
              <RefreshCw
                size={11}
                className={connectionState === 'checking' ? 'animate-spin' : ''}
              />
              Test connection
            </button>
          </div>
        </div>
      </div>

      {/* Model selection */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6F6F80]">Models</p>
        <div
          className="rounded-xl divide-y"
          style={{
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <div className="px-4 py-3">
            <ModelPicker
              label="Chat model"
              description="Used by the assistant for conversation and tool use."
              value={config.chatModel}
              models={models}
              onChange={(v) => setConfig((c) => ({ ...c, chatModel: v }))}
            />
          </div>
          <div className="px-4 py-3">
            <ModelPicker
              label="Embed model"
              description="Used for semantic search, knowledge indexing, and similarity."
              value={config.embedModel}
              models={models}
              onChange={(v) => setConfig((c) => ({ ...c, embedModel: v }))}
            />
          </div>
          <div className="px-4 py-3">
            <ModelPicker
              label="Classifier model"
              description="Used for news topic classification and content routing."
              value={config.classifierModel}
              models={models}
              onChange={(v) => setConfig((c) => ({ ...c, classifierModel: v }))}
            />
          </div>
        </div>
        <p className="text-xs text-[#4B4B5A]">
          Connect to Ollama above to populate the model list. You can also type a model name
          manually.
        </p>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          style={{ background: 'var(--color-accent-gradient)' }}
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          Save configuration
        </button>
        {isDirty && <p className="text-xs text-amber-400">Unsaved changes</p>}
      </div>

      {/* Feature tests */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6F6F80]">
          Feature Tests
        </p>
        <p className="text-xs text-[#6F6F80]">
          Run end-to-end smoke tests against each AI feature using the selected models. Save your
          configuration first. Cold starts may take 30–60 seconds while Ollama loads the model into
          memory.
        </p>
        <div
          className="rounded-xl px-4"
          style={{
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <FeatureTestRow
            label="Chat generation"
            description={`Test a short prompt with ${config.chatModel}`}
            state={chatTest.state}
            {...(chatTest.latencyMs !== undefined ? { latencyMs: chatTest.latencyMs } : {})}
            {...(chatTest.error !== undefined ? { error: chatTest.error } : {})}
            onRun={() => void runFeatureTest('chat')}
            disabled={connectionState !== 'online'}
          />
          <FeatureTestRow
            label="Text embedding"
            description={`Test embedding a string with ${config.embedModel}`}
            state={embedTest.state}
            {...(embedTest.latencyMs !== undefined ? { latencyMs: embedTest.latencyMs } : {})}
            {...(embedTest.error !== undefined ? { error: embedTest.error } : {})}
            onRun={() => void runFeatureTest('embed')}
            disabled={connectionState !== 'online'}
          />
        </div>
        {connectionState !== 'online' && (
          <p className="text-xs text-[#4B4B5A]">Connect to Ollama first to enable feature tests.</p>
        )}
      </div>

      {/* Downloaded models list */}
      {models.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6F6F80]">
            Downloaded Models
          </p>
          <div
            className="rounded-xl overflow-hidden"
            style={{
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {models.map((m, i) => (
              <div
                key={m}
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}
              >
                <span className="font-mono text-sm text-[#A6A6B3]">{m}</span>
                <div className="flex gap-1">
                  {m === config.chatModel && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                      chat
                    </span>
                  )}
                  {m === config.embedModel && (
                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-300">
                      embed
                    </span>
                  )}
                  {m === config.classifierModel && m !== config.embedModel && (
                    <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-300">
                      classifier
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
