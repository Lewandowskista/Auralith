import { useEffect, useState, useMemo } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { Bell, Camera, History, Send, WandSparkles, X } from 'lucide-react'
import { loadPromptPresets, type PromptPreset } from '../lib/prompt-presets'

type Status = {
  tone: 'idle' | 'success' | 'error'
  text: string
}

// ── SpotlightModal — in-app overlay variant ────────────────────────────────────

export type SpotlightModalProps = {
  onClose: () => void
}

export function SpotlightModal({ onClose }: SpotlightModalProps): ReactElement {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>({
    tone: 'idle',
    text: 'Type a quick command or prompt.',
  })
  const [promptPresets, setPromptPresets] = useState<PromptPreset[]>([])

  useEffect(() => {
    void loadPromptPresets().then(setPromptPresets)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [onClose])

  async function sendToAssistant(message: string): Promise<void> {
    if (!message.trim()) return
    const res = await window.auralith.invoke('assistant.send', { message })
    if (!res.ok) {
      setStatus({ tone: 'error', text: 'Could not send to assistant.' })
      return
    }
    await window.auralith.invoke('system.dispatchShellAction', { id: 'assistant.focus' })
    setStatus({ tone: 'success', text: 'Sent to assistant.' })
    setInput('')
    onClose()
  }

  async function runCapture(): Promise<void> {
    const res = await window.auralith.invoke('assistant.invokeTool', {
      toolId: 'screen.capture',
      toolParams: {},
    })
    if (!res.ok) {
      setStatus({ tone: 'error', text: 'Screen capture failed.' })
      return
    }
    setStatus({ tone: 'success', text: 'Screen captured.' })
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendToAssistant(input)
    }
  }

  const quickActions = useMemo(
    () => [
      {
        label: 'Open notifications',
        icon: <Bell size={15} />,
        onClick: () => {
          void window.auralith.invoke('system.dispatchShellAction', { id: 'notifications.open' })
          onClose()
        },
      },
      {
        label: 'Capture screen',
        icon: <Camera size={15} />,
        onClick: () => {
          void runCapture()
        },
      },
      {
        label: 'Open activity',
        icon: <History size={15} />,
        onClick: () => {
          void window.auralith.invoke('system.dispatchShellAction', { id: 'nav.activity' })
          onClose()
        },
      },
      {
        label: 'Focus assistant',
        icon: <WandSparkles size={15} />,
        onClick: () => {
          void window.auralith.invoke('system.dispatchShellAction', { id: 'assistant.focus' })
          onClose()
        },
      },
    ],
    [onClose],
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(14,14,20,0.92)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 20,
        overflow: 'hidden',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        color: '#F4F4F8',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        maxHeight: '80vh',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '12px 16px',
          flexShrink: 0,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: '#6F6F80',
              margin: 0,
            }}
          >
            Spotlight
          </p>
          <p style={{ fontSize: 14, color: '#F4F4F8', margin: '4px 0 0' }}>
            Quick assistant and shell actions
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6F6F80',
            padding: 8,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#F4F4F8'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#6F6F80'
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ overflowY: 'auto', padding: '16px' }}>
        {/* Input area */}
        <div
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            background: 'rgba(255,255,255,0.03)',
            padding: 12,
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleInputKeyDown}
            rows={3}
            autoFocus
            placeholder="Ask the assistant or drop a reusable prompt here..."
            style={{
              width: '100%',
              resize: 'none',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              lineHeight: 1.6,
              color: '#F4F4F8',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color:
                  status.tone === 'error'
                    ? '#fca5a5'
                    : status.tone === 'success'
                      ? '#6ee7b7'
                      : '#6F6F80',
              }}
            >
              {status.text}
            </span>
            <button
              onClick={() => void sendToAssistant(input)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#7c3aed',
                border: 'none',
                borderRadius: 10,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 500,
                color: '#fff',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = '#6d28d9'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = '#7c3aed'
              }}
            >
              <Send size={12} />
              Send
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 14,
                padding: '10px 14px',
                fontSize: 13,
                color: '#E4E4EC',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'
              }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>

        {/* Prompt presets */}
        {promptPresets.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#6F6F80',
                margin: '0 0 8px',
              }}
            >
              Prompt presets
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {promptPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setInput(preset.prompt)}
                  style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 99,
                    padding: '6px 12px',
                    fontSize: 12,
                    color: '#E4E4EC',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(255,255,255,0.06)'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(255,255,255,0.03)'
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SpotlightApp — standalone window variant (used in spotlight.html) ──────────

export function SpotlightApp(): ReactElement {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <SpotlightModal
        onClose={() => void window.auralith.invoke('system.closeSpotlightWindow', {})}
      />
    </div>
  )
}
