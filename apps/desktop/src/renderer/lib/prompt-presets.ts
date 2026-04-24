export type PromptPreset = {
  id: string
  name: string
  prompt: string
}

export const DEFAULT_PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'summarize-selection',
    name: 'Summarize this',
    prompt: 'Summarize the current material into the key points, open questions, and next actions.',
  },
  {
    id: 'extract-actions',
    name: 'Extract actions',
    prompt: 'Extract the concrete action items, owners, deadlines, and blockers from this context.',
  },
  {
    id: 'rewrite-clearer',
    name: 'Rewrite clearly',
    prompt: 'Rewrite this to be clearer, tighter, and more direct while preserving the meaning.',
  },
]

const SETTINGS_KEY = 'assistant.promptPresets'

export async function loadPromptPresets(): Promise<PromptPreset[]> {
  const res = await window.auralith.invoke('settings.get', { key: SETTINGS_KEY })
  if (!res.ok) return DEFAULT_PROMPT_PRESETS
  const raw = (res.data as { value: unknown }).value
  if (!Array.isArray(raw)) return DEFAULT_PROMPT_PRESETS

  const parsed = raw.flatMap((entry): PromptPreset[] => {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { id?: unknown }).id === 'string' &&
      typeof (entry as { name?: unknown }).name === 'string' &&
      typeof (entry as { prompt?: unknown }).prompt === 'string'
    ) {
      return [entry as PromptPreset]
    }
    return []
  })

  return parsed.length > 0 ? parsed : DEFAULT_PROMPT_PRESETS
}

export async function savePromptPresets(presets: PromptPreset[]): Promise<boolean> {
  const res = await window.auralith.invoke('settings.set', { key: SETTINGS_KEY, value: presets })
  return res.ok
}
