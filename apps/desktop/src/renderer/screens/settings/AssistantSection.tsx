import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { toast } from 'sonner'
import { InsightsSection } from './InsightsSection'
import {
  DEFAULT_PROMPT_PRESETS,
  loadPromptPresets,
  savePromptPresets,
  type PromptPreset,
} from '../../lib/prompt-presets'

export function AssistantSection(): ReactElement {
  const [autoApprove, setAutoApprove] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [personaOverride, setPersonaOverride] = useState('')
  const [promptPresets, setPromptPresets] = useState<PromptPreset[]>(DEFAULT_PROMPT_PRESETS)
  const [loading, setLoading] = useState(true)
  const [savingPersona, setSavingPersona] = useState(false)

  useEffect(() => {
    void (async () => {
      const [autoApproveRes, notificationsRes, personaRes, presets] = await Promise.all([
        window.auralith.invoke('settings.get', { key: 'assistant.autoApproveConfirmTier' }),
        window.auralith.invoke('settings.get', { key: 'suggestions.notificationsEnabled' }),
        window.auralith.invoke('settings.get', { key: 'assistant.personaOverride' }),
        loadPromptPresets(),
      ])

      if (autoApproveRes.ok) {
        const data = autoApproveRes.data as { value: unknown }
        if (typeof data.value === 'boolean') setAutoApprove(data.value)
      }
      if (notificationsRes.ok) {
        const data = notificationsRes.data as { value: unknown }
        if (typeof data.value === 'boolean') setNotificationsEnabled(data.value)
      }
      if (personaRes.ok) {
        const data = personaRes.data as { value: unknown }
        if (typeof data.value === 'string') setPersonaOverride(data.value)
      }
      setPromptPresets(presets)

      setLoading(false)
    })()
  }, [])

  async function saveBooleanSetting(
    key: string,
    value: boolean,
    onRollback: () => void,
    successMessage: string,
  ): Promise<void> {
    const res = await window.auralith.invoke('settings.set', { key, value })
    if (!res.ok) {
      onRollback()
      toast.error('Failed to save setting')
      return
    }
    toast.success(successMessage)
  }

  async function toggleAutoApprove(): Promise<void> {
    const next = !autoApprove
    setAutoApprove(next)
    await saveBooleanSetting(
      'assistant.autoApproveConfirmTier',
      next,
      () => setAutoApprove(!next),
      next ? 'Confirm-tier auto-approve enabled' : 'Confirm-tier auto-approve disabled',
    )
  }

  async function toggleNotifications(): Promise<void> {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    await saveBooleanSetting(
      'suggestions.notificationsEnabled',
      next,
      () => setNotificationsEnabled(!next),
      next ? 'Suggestion notifications enabled' : 'Suggestion notifications disabled',
    )
  }

  async function savePersonaOverride(): Promise<void> {
    setSavingPersona(true)
    const res = await window.auralith.invoke('settings.set', {
      key: 'assistant.personaOverride',
      value: personaOverride.trim(),
    })
    setSavingPersona(false)
    if (!res.ok) {
      toast.error('Failed to save persona instructions')
      return
    }
    toast.success(personaOverride.trim() ? 'Persona override saved' : 'Persona override cleared')
  }

  async function persistPromptPresets(nextPresets: PromptPreset[]): Promise<void> {
    setPromptPresets(nextPresets)
    const ok = await savePromptPresets(nextPresets)
    if (!ok) {
      toast.error('Failed to save prompt presets')
      return
    }
    toast.success('Prompt library updated')
  }

  function updatePromptPreset(id: string, patch: Partial<PromptPreset>): void {
    const nextPresets = promptPresets.map((preset) =>
      preset.id === id ? { ...preset, ...patch } : preset,
    )
    void persistPromptPresets(nextPresets)
  }

  function addPromptPreset(): void {
    const id = `preset-${Date.now()}`
    void persistPromptPresets([
      ...promptPresets,
      { id, name: 'New prompt', prompt: 'Describe what you want this reusable prompt to do.' },
    ])
  }

  function removePromptPreset(id: string): void {
    const nextPresets = promptPresets.filter((preset) => preset.id !== id)
    void persistPromptPresets(nextPresets.length > 0 ? nextPresets : DEFAULT_PROMPT_PRESETS)
  }

  if (loading) {
    return <div className="h-8 w-40 animate-pulse rounded-lg bg-white/5" />
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[#F4F4F8]">Assistant</h2>
        <p className="text-sm text-[#6F6F80]">
          Control how Auralith behaves, sounds, and surfaces actions.
        </p>
      </div>

      <div className="space-y-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[#F4F4F8]">
              Auto-approve confirm-tier suggestions
            </p>
            <p className="text-xs text-[#6F6F80]">
              When enabled, suggestions requiring confirmation run immediately. Restricted-tier
              actions still require typing CONFIRM.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={autoApprove}
            onClick={() => void toggleAutoApprove()}
            className={[
              'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
              autoApprove ? 'bg-violet-500' : 'bg-white/20',
            ].join(' ')}
          >
            <span
              className={[
                'mt-0.5 block h-4 w-4 rounded-full bg-white shadow transition-transform',
                autoApprove ? 'translate-x-[18px]' : 'translate-x-0.5',
              ].join(' ')}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-[#F4F4F8]">
              Desktop notifications for suggestions
            </p>
            <p className="text-xs text-[#6F6F80]">
              Show native toasts when a new confirm-tier suggestion appears so proactive actions do
              not stay buried in the Home rail.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={notificationsEnabled}
            onClick={() => void toggleNotifications()}
            className={[
              'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
              notificationsEnabled ? 'bg-violet-500' : 'bg-white/20',
            ].join(' ')}
          >
            <span
              className={[
                'mt-0.5 block h-4 w-4 rounded-full bg-white shadow transition-transform',
                notificationsEnabled ? 'translate-x-[18px]' : 'translate-x-0.5',
              ].join(' ')}
            />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-3">
          <p className="text-sm font-medium text-[#F4F4F8]">Persona override</p>
          <p className="text-xs text-[#6F6F80]">
            Appended to the default system prompt. Use it for tone, priorities, or house rules you
            want applied to every thread.
          </p>
        </div>
        <textarea
          value={personaOverride}
          onChange={(e) => setPersonaOverride(e.target.value)}
          rows={6}
          placeholder="Example: Prefer concise answers, propose shell commands before GUI steps, and ask for confirmation before deleting anything."
          className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-[#F4F4F8] placeholder-[#4B4B5A] outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#4B4B5A]">Leave blank to use the default persona only.</p>
          <button
            onClick={() => void savePersonaOverride()}
            disabled={savingPersona}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            {savingPersona ? 'Saving…' : 'Save persona'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-[#6F6F80]">
        Restricted-tier tools are never auto-approved. They always require typing{' '}
        <span className="font-mono text-red-400">CONFIRM</span> before the action is executed.
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#F4F4F8]">Prompt library</p>
            <p className="text-xs text-[#6F6F80]">
              Reusable prompts appear in the command palette, home dashboard, and spotlight window.
            </p>
          </div>
          <button
            onClick={addPromptPreset}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-[#F4F4F8] transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            Add prompt
          </button>
        </div>

        <div className="space-y-3">
          {promptPresets.map((preset) => (
            <div
              key={preset.id}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input
                    value={preset.name}
                    onChange={(e) => updatePromptPreset(preset.id, { name: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#F4F4F8] outline-none focus:border-violet-500/50"
                  />
                  <textarea
                    value={preset.prompt}
                    onChange={(e) => updatePromptPreset(preset.id, { prompt: e.target.value })}
                    rows={3}
                    className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-[#F4F4F8] outline-none focus:border-violet-500/50"
                  />
                </div>
                <button
                  onClick={() => removePromptPreset(preset.id)}
                  className="rounded-lg px-2 py-1 text-xs text-[#6F6F80] transition hover:bg-white/5 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.06] pt-4">
        <InsightsSection />
      </div>
    </div>
  )
}
