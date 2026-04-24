import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import type { ThemeMode } from '../../context/ThemeContext'
import { toast } from 'sonner'

type ThemeOption = { value: ThemeMode; label: string; icon: ReactElement; description: string }

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'dark',
    label: 'Dark',
    icon: <Moon size={16} />,
    description: 'Dark backgrounds, light text',
  },
  {
    value: 'light',
    label: 'Light',
    icon: <Sun size={16} />,
    description: 'Light backgrounds, dark text',
  },
  {
    value: 'system',
    label: 'System',
    icon: <Monitor size={16} />,
    description: 'Follows your OS preference',
  },
]

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): ReactElement {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
        checked ? 'bg-violet-500' : 'bg-white/20',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-standard',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: ReactElement
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-6">
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{label}</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function AppearanceSection(): ReactElement {
  const { mode, setMode } = useTheme()
  const [etherEnabled, setEtherEnabled] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [miniOpen, setMiniOpen] = useState(false)

  // Load persisted values
  useEffect(() => {
    void window.auralith.invoke('settings.get', { key: 'appearance.etherEnabled' }).then((res) => {
      if (res.ok) {
        const data = res.data as { value: unknown }
        if (typeof data.value === 'boolean') setEtherEnabled(data.value)
      }
    })
    void window.auralith.invoke('settings.get', { key: 'appearance.reduceMotion' }).then((res) => {
      if (res.ok) {
        const data = res.data as { value: unknown }
        if (typeof data.value === 'boolean') setReduceMotion(data.value)
      }
    })
    void window.auralith.invoke('system.getMiniWindowState', {}).then((res) => {
      if (res.ok) {
        const data = res.data as { open: boolean }
        setMiniOpen(data.open)
      }
    })
  }, [])

  function handleEtherChange(v: boolean): void {
    setEtherEnabled(v)
    void window.auralith.invoke('settings.set', { key: 'appearance.etherEnabled', value: v })
    // Emit to renderer so HomeScreen can react immediately
    window.dispatchEvent(new CustomEvent('auralith:ether-enabled', { detail: v }))
  }

  function handleReduceMotionChange(v: boolean): void {
    setReduceMotion(v)
    void window.auralith.invoke('settings.set', { key: 'appearance.reduceMotion', value: v })
    if (v) {
      document.documentElement.dataset['reduceMotion'] = 'true'
    } else {
      delete document.documentElement.dataset['reduceMotion']
    }
    toast.success(v ? 'Motion reduced' : 'Motion restored')
  }

  function handleThemeChange(next: ThemeMode): void {
    setMode(next)
    toast.success(`Theme set to ${next}`)
  }

  function handleMiniWindowToggle(v: boolean): void {
    setMiniOpen(v)
    if (v) {
      void window.auralith.invoke('system.openMiniWindow', {})
    } else {
      void window.auralith.invoke('system.closeMiniWindow', {})
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[var(--color-text-primary)]">Appearance</h2>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          Visual style, motion, and density preferences.
        </p>
      </div>

      {/* Theme mode selector */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Color theme</h3>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleThemeChange(opt.value)}
              className={[
                'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                mode === opt.value
                  ? 'border-violet-500/60 bg-violet-500/10 text-violet-300'
                  : 'border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/50 text-[var(--color-text-secondary)] hover:bg-white/5',
              ].join(' ')}
              aria-pressed={mode === opt.value}
            >
              <span
                className={
                  mode === opt.value ? 'text-violet-400' : 'text-[var(--color-text-tertiary)]'
                }
              >
                {opt.icon}
              </span>
              <span className="text-sm font-medium leading-none">{opt.label}</span>
              <span className="text-xs leading-snug opacity-70">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Background + motion */}
      <div className="space-y-4 rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 p-4">
        <SettingRow
          label="Liquid ether background"
          description="Animated WebGL backdrop on the home screen."
        >
          <Toggle
            checked={etherEnabled}
            onChange={handleEtherChange}
            label="Toggle liquid ether background"
          />
        </SettingRow>

        <div className="h-px bg-[var(--color-border-hairline)]" />

        <SettingRow
          label="Reduce motion"
          description="Disable non-essential animations. Also respects your OS setting."
        >
          <Toggle
            checked={reduceMotion}
            onChange={handleReduceMotionChange}
            label="Toggle reduce motion"
          />
        </SettingRow>
      </div>

      {/* Mini companion window */}
      <div className="space-y-3 rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/30 p-4">
        <SettingRow
          label="Mini companion window"
          description="Always-on-top overlay showing the time and your top suggestion."
        >
          <Toggle
            checked={miniOpen}
            onChange={handleMiniWindowToggle}
            label="Toggle mini companion window"
          />
        </SettingRow>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          The mini window is draggable and stays above other apps. You can dismiss it from the
          window itself.
        </p>
      </div>

      <p className="text-xs text-[var(--color-text-tertiary)]">
        Compact density mode is planned for a future update.
      </p>
    </div>
  )
}
