import type { AppContextProvider, AppContextRequest, AppContextProviderResult } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

type AppSettings = {
  weatherLocationLabel?: string
  weatherEnabled?: boolean
  newsEnabled?: boolean
  activityEnabled?: boolean
  clipboardEnabled?: boolean
  voiceEnabled?: boolean
  briefingEnabled?: boolean
  leisureMode?: string
  personaOverride?: string
  appContextEnabled?: boolean
  appContextMaxChars?: number
}

// ── Provider deps ─────────────────────────────────────────────────────────────

export type SettingsContextDeps = {
  getAppSettings: () => Promise<AppSettings>
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function createSettingsContextProvider(deps: SettingsContextDeps): AppContextProvider {
  return {
    capability: 'settings',

    canHandle(req: AppContextRequest): boolean {
      return req.requestedCapabilities.includes('settings')
    },

    async getContext(_req: AppContextRequest): Promise<AppContextProviderResult> {
      const warnings: string[] = []
      let settings: AppSettings = {}

      try {
        settings = await deps.getAppSettings()
      } catch (err) {
        warnings.push(`Settings fetch failed: ${err instanceof Error ? err.message : 'error'}`)
      }

      const featureLines: string[] = []

      if (settings.weatherLocationLabel)
        featureLines.push(`  weather_location: ${settings.weatherLocationLabel}`)
      if (settings.weatherEnabled === false) featureLines.push('  weather: disabled')
      if (settings.newsEnabled === false) featureLines.push('  news: disabled')
      if (settings.activityEnabled === false) featureLines.push('  activity_tracking: disabled')
      if (settings.clipboardEnabled) featureLines.push('  clipboard_history: enabled')
      if (settings.voiceEnabled === false) featureLines.push('  voice: disabled')
      if (settings.briefingEnabled === false) featureLines.push('  briefings: disabled')
      if (settings.leisureMode && settings.leisureMode !== 'off')
        featureLines.push(`  leisure_mode: ${settings.leisureMode}`)
      if (settings.personaOverride)
        featureLines.push(`  persona_override: "${settings.personaOverride.slice(0, 60)}"`)

      if (featureLines.length === 0) {
        return {
          capability: 'settings',
          promptText: '',
          charCount: 0,
          freshness: 'fresh',
          warnings,
          source: 'core-db settings',
        }
      }

      const promptText = ['### Settings', 'source: core-db settings', ...featureLines].join('\n')

      return {
        capability: 'settings',
        promptText,
        charCount: promptText.length,
        freshness: 'fresh',
        warnings,
        source: 'core-db settings',
      }
    },
  }
}
