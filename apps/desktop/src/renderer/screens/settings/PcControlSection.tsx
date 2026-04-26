import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { MonitorCheck, MonitorX, Globe, Trash2, ShieldCheck, Zap } from 'lucide-react'

type CdpStatus = {
  connected: boolean
  tabCount: number
  tabs: Array<{ id: string; title: string; url: string }>
}
type AllowEntry = { toolId: string; addedAt: number }

const TOOL_LABELS: Record<string, string> = {
  'volume.set': 'Set volume',
  'volume.mute': 'Toggle mute',
  'window.minimize': 'Minimize window',
  'window.maximize': 'Maximize window',
  'window.restore': 'Restore window',
  'window.focus': 'Focus window',
  'clipboard.write': 'Write to clipboard',
  'media.play': 'Play/pause media',
}

function label(toolId: string): string {
  return TOOL_LABELS[toolId] ?? toolId
}

function SectionLabel({ eyebrow, title }: { eyebrow: string; title: string }): ReactElement {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-mono)',
          marginBottom: 3,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {title}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--color-border-hairline)',
        background: 'rgba(18,18,26,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        padding: '4px 22px 18px',
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  )
}

function Row({
  title,
  sub,
  control,
  danger,
}: {
  title: string
  sub?: string
  control: ReactElement
  danger?: boolean
}): ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto',
        gap: 20,
        alignItems: 'center',
        padding: '14px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: danger ? '#f87171' : 'var(--color-text-primary)',
            marginBottom: 2,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {title}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.5,
              fontFamily: 'var(--font-sans)',
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  )
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}): ReactElement {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 12,
        background: value ? 'var(--color-accent-mid)' : 'rgba(255,255,255,0.1)',
        border: 'none',
        cursor: 'pointer',
        padding: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: value ? 'flex-end' : 'flex-start',
        transition: 'background 160ms ease',
      }}
    >
      <motion.span
        layout
        style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', display: 'block' }}
        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
      />
    </button>
  )
}

export function PcControlSection(): ReactElement {
  const [enabled, setEnabled] = useState(true)
  const [cdpStatus, setCdpStatus] = useState<CdpStatus | null>(null)
  const [allowList, setAllowList] = useState<AllowEntry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [statusRes, allowRes, settingRes] = await Promise.all([
      window.auralith.invoke('pccontrol.getStatus', {}),
      window.auralith.invoke('pccontrol.getAllowList', {}),
      window.auralith.invoke('settings.get', { key: 'pccontrol.enabled' }),
    ])
    if (statusRes.ok) setCdpStatus((statusRes.data as { cdp: CdpStatus }).cdp)
    if (allowRes.ok) setAllowList((allowRes.data as { entries: AllowEntry[] }).entries)
    if (settingRes.ok) {
      const v = (settingRes.data as { value: unknown }).value
      if (typeof v === 'boolean') setEnabled(v)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleToggleEnabled = async (v: boolean) => {
    setEnabled(v)
    await window.auralith.invoke('settings.set', { key: 'pccontrol.enabled', value: v })
    toast.success(v ? 'PC Control enabled' : 'PC Control disabled')
  }

  const handleLaunchChrome = async () => {
    const res = await window.auralith.invoke('pccontrol.launchChrome', {})
    if (res.ok) {
      toast.success('Chrome launched with remote debugging. Refresh status in a moment.')
      setTimeout(() => void refresh(), 3000)
    } else {
      toast.error('Failed to launch Chrome')
    }
  }

  const handleRemoveAllow = async (toolId: string) => {
    const res = await window.auralith.invoke('pccontrol.removeAllowList', { toolId })
    if (res.ok) {
      setAllowList((prev) => prev.filter((e) => e.toolId !== toolId))
      toast.success(`Removed always-allow for "${label(toolId)}"`)
    }
  }

  return (
    <div>
      <SectionLabel eyebrow="Devices" title="PC Control" />

      {/* Master toggle */}
      <Card>
        <Row
          title="Enable PC Control"
          sub="Allow the assistant to launch apps, control Chrome, manage volume and windows, and read the clipboard."
          control={<Toggle value={enabled} onChange={(v) => void handleToggleEnabled(v)} />}
        />
      </Card>

      {/* CDP status */}
      <Card>
        <div
          style={{
            paddingTop: 14,
            paddingBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid var(--color-border-hairline)',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: cdpStatus?.connected ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
              border: `1px solid ${cdpStatus?.connected ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
              color: cdpStatus?.connected ? '#34d399' : '#f87171',
            }}
          >
            {cdpStatus?.connected ? <MonitorCheck size={15} /> : <MonitorX size={15} />}
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Chrome CDP{' '}
              {loading
                ? '…'
                : cdpStatus?.connected
                  ? `connected · ${cdpStatus.tabCount} tab${cdpStatus.tabCount === 1 ? '' : 's'}`
                  : 'not connected'}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Port 9222 · Chrome must be running with{' '}
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                --remote-debugging-port=9222
              </code>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', gap: 8 }}>
            <button
              onClick={() => void refresh()}
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                fontSize: 11,
                border: '1px solid var(--color-border-hairline)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Refresh
            </button>
            {!cdpStatus?.connected && (
              <button
                onClick={() => void handleLaunchChrome()}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  border: '1px solid rgba(139,92,246,0.35)',
                  background: 'rgba(139,92,246,0.12)',
                  color: 'var(--color-accent-mid)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Globe size={11} />
                Launch Chrome with CDP
              </button>
            )}
          </div>
        </div>

        {/* Tab list */}
        {cdpStatus?.connected && cdpStatus.tabs.length > 0 && (
          <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {cdpStatus.tabs.slice(0, 6).map((tab) => (
              <div
                key={tab.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}
              >
                <div
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#34d399',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-sans)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.title || '(no title)'}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-tertiary)',
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.url}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Always-allow list */}
      <Card>
        <div
          style={{
            paddingTop: 14,
            paddingBottom: 8,
            borderBottom: '1px solid var(--color-border-hairline)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Zap size={14} color="rgba(139,92,246,0.8)" />
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Always-allow list
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-sans)',
              marginLeft: 4,
            }}
          >
            Skips the 3-second toast for these actions
          </div>
        </div>

        {allowList.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <ShieldCheck size={24} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              No tools are always-allowed yet. Check "Always allow" on the toast when it appears.
            </div>
          </div>
        ) : (
          allowList.map((entry) => (
            <div
              key={entry.toolId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 0',
                borderBottom: '1px solid var(--color-border-hairline)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {label(entry.toolId)}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {entry.toolId} · added {new Date(entry.addedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => void handleRemoveAllow(entry.toolId)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 7,
                  fontSize: 11,
                  border: '1px solid rgba(248,113,113,0.3)',
                  background: 'rgba(248,113,113,0.08)',
                  color: '#f87171',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Trash2 size={10} />
                Revoke
              </button>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
