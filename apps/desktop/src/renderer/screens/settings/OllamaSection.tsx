import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import {
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  FlaskConical,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'

type ConnectionState = 'idle' | 'checking' | 'online' | 'offline'
type TestState = 'idle' | 'running' | 'ok' | 'fail'

type Config = {
  url: string
  chatModel: string
  embedModel: string
  classifierModel: string
  summarizeModel: string
  extractModel: string
  agentModel: string
}

type RoleKey = keyof Omit<Config, 'url'>

// ── Role metadata ─────────────────────────────────────────────────────────────

type RoleDef = {
  label: string
  configKey: RoleKey
  description: string
  badgeColor: string
  testRole: 'chat' | 'agent' | 'summarize' | 'classifier' | 'extract' | 'embed'
}

const ROLES: RoleDef[] = [
  {
    label: 'Chat',
    configKey: 'chatModel',
    description: 'Multi-turn assistant conversation and tool use.',
    badgeColor: 'bg-violet-500/15 text-violet-300',
    testRole: 'chat',
  },
  {
    label: 'Agent',
    configKey: 'agentModel',
    description: 'Agentic planning, reflection, and multi-step reasoning.',
    badgeColor: 'bg-emerald-500/15 text-emerald-300',
    testRole: 'agent',
  },
  {
    label: 'Summarize',
    configKey: 'summarizeModel',
    description: 'Briefings, news summaries, and activity digests.',
    badgeColor: 'bg-amber-500/15 text-amber-300',
    testRole: 'summarize',
  },
  {
    label: 'Classifier',
    configKey: 'classifierModel',
    description: 'Intent classification, content routing, and news tagging.',
    badgeColor: 'bg-cyan-500/15 text-cyan-300',
    testRole: 'classifier',
  },
  {
    label: 'Extract',
    configKey: 'extractModel',
    description: 'Structured data extraction and short rewrites.',
    badgeColor: 'bg-pink-500/15 text-pink-300',
    testRole: 'extract',
  },
  {
    label: 'Embed',
    configKey: 'embedModel',
    description: 'Semantic search, knowledge indexing, and similarity.',
    badgeColor: 'bg-blue-500/15 text-blue-300',
    testRole: 'embed',
  },
]

// ── ModelDropdown ─────────────────────────────────────────────────────────────

type ModelDropdownProps = {
  value: string
  models: string[]
  onChange: (model: string) => void
  disabled?: boolean
}

function ModelDropdown({ value, models, onChange, disabled }: ModelDropdownProps): ReactElement {
  const [open, setOpen] = useState(false)
  const options = models.length > 0 ? models : [value]

  return (
    <div style={{ position: 'relative', minWidth: 220 }}>
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          width: '100%',
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.05)',
          color: '#A6A6B3',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          textAlign: 'left',
        }}
      >
        <span
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {value || '— select model —'}
        </span>
        <ChevronDown
          size={12}
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
            opacity: 0.6,
          }}
        />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              zIndex: 50,
              minWidth: 240,
              maxHeight: 220,
              overflowY: 'auto',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(18,18,26,0.97)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              padding: '4px 0',
            }}
          >
            {options.map((m) => (
              <button
                key={m}
                onClick={() => {
                  onChange(m)
                  setOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '7px 12px',
                  border: 'none',
                  background: m === value ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: m === value ? '#C4B5FD' : '#A6A6B3',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={(e) => {
                  if (m !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                }}
                onMouseLeave={(e) => {
                  if (m !== value) e.currentTarget.style.background = 'transparent'
                }}
              >
                {m}
              </button>
            ))}
            {options.length === 1 && models.length === 0 && (
              <p style={{ padding: '4px 12px 8px', fontSize: 11, color: '#4B4B5A' }}>
                Connect to Ollama to load model list
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── RoleTestRow ───────────────────────────────────────────────────────────────

type RoleTestResult = {
  state: TestState
  latencyMs?: number
  output?: string
  error?: string
}

type RoleTestRowProps = {
  role: RoleDef
  model: string
  result: RoleTestResult
  onTest: () => void
  disabled?: boolean
}

function RoleTestRow({ role, model, result, onTest, disabled }: RoleTestRowProps): ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'start',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${role.badgeColor}`}
            style={{ flexShrink: 0 }}
          >
            {role.label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#6F6F80',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {model}
          </span>
          {result.state === 'ok' && result.latencyMs !== undefined && (
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
              {result.latencyMs}ms
            </span>
          )}
          {result.state === 'ok' && (
            <CheckCircle size={13} className="text-emerald-400" style={{ flexShrink: 0 }} />
          )}
          {result.state === 'fail' && (
            <XCircle size={13} className="text-red-400" style={{ flexShrink: 0 }} />
          )}
          {result.state === 'running' && (
            <Loader2 size={13} className="animate-spin text-[#6F6F80]" style={{ flexShrink: 0 }} />
          )}
        </div>

        <p
          style={{
            fontSize: 11,
            color: '#6F6F80',
            marginBottom: result.output || result.error ? 4 : 0,
          }}
        >
          {role.description}
        </p>

        {result.state === 'ok' && result.output && (
          <pre
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: '#A6A6B3',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: '4px 8px',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 60,
              overflowY: 'auto',
            }}
          >
            {result.output}
          </pre>
        )}

        {result.state === 'fail' && result.error && (
          <p
            style={{ fontSize: 10, color: '#F87171', fontFamily: 'var(--font-mono)', marginTop: 2 }}
          >
            {result.error}
          </p>
        )}
      </div>

      <button
        onClick={onTest}
        disabled={disabled || result.state === 'running'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.06)',
          color: '#A6A6B3',
          fontSize: 11,
          cursor: disabled || result.state === 'running' ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!disabled && result.state !== 'running')
            e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
        }}
      >
        <FlaskConical size={11} />
        Test
      </button>
    </div>
  )
}

// ── OllamaSection (main) ──────────────────────────────────────────────────────

export function OllamaSection(): ReactElement {
  const [config, setConfig] = useState<Config>({
    url: 'http://localhost:11434',
    chatModel: 'qwen3:8b',
    embedModel: 'nomic-embed-text',
    classifierModel: 'phi4-mini:3.8b',
    summarizeModel: 'phi4-mini:3.8b',
    extractModel: 'phi4-mini:3.8b',
    agentModel: 'qwen3:8b',
  })
  const [urlDraft, setUrlDraft] = useState('http://localhost:11434')
  const [models, setModels] = useState<string[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Per-role test results
  const [roleTests, setRoleTests] = useState<Record<string, RoleTestResult>>(
    Object.fromEntries(ROLES.map((r) => [r.testRole, { state: 'idle' as TestState }])),
  )

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

  useEffect(() => {
    void (async () => {
      const res = await window.auralith.invoke('ollama.getConfig', {})
      if (res.ok) {
        const d = res.data as Config
        setConfig(d)
        setUrlDraft(d.url)
        void testConnection(d.url)
      }
      setLoading(false)
    })()
  }, [testConnection])

  function updateModel(key: RoleKey, value: string) {
    setConfig((c) => ({ ...c, [key]: value }))
    setIsDirty(true)
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    const cfgRes = await window.auralith.invoke('ollama.saveConfig', {
      url: urlDraft,
      chatModel: config.chatModel,
      embedModel: config.embedModel,
      classifierModel: config.classifierModel,
      summarizeModel: config.summarizeModel,
      extractModel: config.extractModel,
      agentModel: config.agentModel,
    })
    setSaving(false)
    if (cfgRes.ok) {
      setConfig((c) => ({ ...c, url: urlDraft }))
      setIsDirty(false)
      toast.success('Ollama configuration saved')
    } else {
      toast.error('Failed to save configuration')
    }
  }

  async function runRoleTest(role: RoleDef): Promise<void> {
    const model = config[role.configKey]
    setRoleTests((prev) => ({ ...prev, [role.testRole]: { state: 'running' } }))

    const res = await window.auralith.invoke('ollama.testRole', {
      url: urlDraft,
      role: role.testRole,
      model,
    })

    if (res.ok) {
      const d = res.data as { ok: boolean; latencyMs: number; output?: string; error?: string }
      setRoleTests((prev) => ({
        ...prev,
        [role.testRole]: {
          state: d.ok ? 'ok' : 'fail',
          latencyMs: d.latencyMs,
          ...(d.output !== undefined ? { output: d.output } : {}),
          ...(d.error !== undefined ? { error: d.error } : {}),
        },
      }))
    } else {
      setRoleTests((prev) => ({
        ...prev,
        [role.testRole]: { state: 'fail', error: 'IPC error' },
      }))
    }
  }

  async function runAllRoleTests(): Promise<void> {
    for (const role of ROLES) {
      await runRoleTest(role)
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

  const urlValid = urlDraft.startsWith('http://') || urlDraft.startsWith('https://')

  // Build model → roles map for downloaded models list
  const modelRoleMap: Record<string, string[]> = {}
  for (const role of ROLES) {
    const m = config[role.configKey]
    if (m) {
      if (!modelRoleMap[m]) modelRoleMap[m] = []
      modelRoleMap[m].push(role.label)
    }
  }

  const anyTestRunning = Object.values(roleTests).some((t) => t.state === 'running')

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[#F4F4F8]">Ollama</h2>
        <p className="text-sm text-[#6F6F80]">
          Configure the local Ollama endpoint and assign models to each AI role.
        </p>
      </div>

      {/* ── Connection ─────────────────────────────────────────────────────── */}
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
                onChange={(e) => {
                  setUrlDraft(e.target.value)
                  setIsDirty(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void testConnection(urlDraft)
                }}
                placeholder="http://localhost:11434"
                className="w-full rounded-lg px-3 py-1.5 text-sm text-[#F4F4F8] placeholder-[#4B4B5A] focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border:
                    urlDraft && !urlValid
                      ? '1px solid rgba(239,68,68,0.5)'
                      : '1px solid rgba(255,255,255,0.08)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              />
              {urlDraft && !urlValid && (
                <p className="mt-1 px-1 text-[10px] text-red-400">
                  Must start with http:// or https://
                </p>
              )}
            </div>
          </div>

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
              disabled={connectionState === 'checking' || !urlValid}
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

      {/* ── Model Assignments ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6F6F80]">
          Model Assignments
        </p>
        <div
          className="rounded-xl divide-y"
          style={{
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          {ROLES.map((role) => (
            <div key={role.configKey} className="px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${role.badgeColor}`}
                    >
                      {role.label}
                    </span>
                  </div>
                  <p className="text-xs text-[#6F6F80]">{role.description}</p>
                </div>
                <ModelDropdown
                  value={config[role.configKey]}
                  models={models}
                  onChange={(m) => updateModel(role.configKey, m)}
                />
              </div>
            </div>
          ))}
        </div>
        {connectionState !== 'online' && (
          <p className="text-xs text-[#4B4B5A]">
            Connect to Ollama to enable model selection dropdowns.
          </p>
        )}
      </div>

      {/* ── Save ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving || !urlValid || !isDirty}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          style={{ background: 'var(--color-accent-gradient)' }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save configuration
        </button>
        {isDirty && <p className="text-xs text-amber-400">Unsaved changes</p>}
      </div>

      {/* ── Role Tests ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#6F6F80]">
            Role Tests
          </p>
          <button
            onClick={() => void runAllRoleTests()}
            disabled={connectionState !== 'online' || anyTestRunning}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#A6A6B3] transition-colors disabled:opacity-40"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
            onMouseEnter={(e) => {
              if (connectionState === 'online' && !anyTestRunning)
                e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
          >
            <FlaskConical size={11} />
            Test all roles
          </button>
        </div>
        <p className="text-xs text-[#6F6F80]">
          Each test sends a tiny role-appropriate prompt to the assigned model and validates the
          output format. Cold starts may take 30–60 s while Ollama loads the model into VRAM.
        </p>
        <div
          className="rounded-xl px-4"
          style={{
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          {ROLES.map((role) => (
            <RoleTestRow
              key={role.testRole}
              role={role}
              model={config[role.configKey]}
              result={roleTests[role.testRole] ?? { state: 'idle' }}
              onTest={() => void runRoleTest(role)}
              disabled={connectionState !== 'online'}
            />
          ))}
        </div>
        {connectionState !== 'online' && (
          <p className="text-xs text-[#4B4B5A]">Connect to Ollama first to enable role tests.</p>
        )}
      </div>

      {/* ── Downloaded Models ───────────────────────────────────────────────── */}
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
                <div className="flex gap-1 flex-wrap justify-end">
                  {(modelRoleMap[m] ?? []).map((roleLabel) => {
                    const role = ROLES.find((r) => r.label === roleLabel)
                    if (!role) return null
                    return (
                      <span
                        key={roleLabel}
                        className={`rounded-full px-2 py-0.5 text-[10px] ${role.badgeColor}`}
                      >
                        {roleLabel.toLowerCase()}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
