import type { AppContextProvider, AppContextRequest, AppContextProviderResult } from '../types'

// ── Types mirrored from core-weather (avoid cross-package coupling here) ──────

type WeatherBriefing = {
  summary: string
  alertLevel: string
  temp?: number
  description?: string
}

type CurrentWeather = {
  temperature_2m: number
  apparent_temperature: number
  weather_code: number
  wind_speed_10m: number
  relative_humidity_2m: number
  is_day: number
  time: string
}

type DailyForecast = {
  date: string
  weather_code: number
  temperature_2m_max: number
  temperature_2m_min: number
  precipitation_probability_max: number
}

// ── Provider deps ─────────────────────────────────────────────────────────────

export type WeatherContextDeps = {
  /** IPC-style call — handler returns weather.getBriefing result */
  getBriefing: () => Promise<WeatherBriefing>
  /** IPC-style call — returns current weather conditions */
  getCurrent: () => Promise<CurrentWeather>
  /** IPC-style call — returns daily forecast array */
  getForecast: (days?: number) => Promise<{ daily: DailyForecast[]; fetchedAt: number }>
  /** Optional — resolved city label from settings */
  getLocationLabel?: () => string | undefined
}

// ── Freshness helper ──────────────────────────────────────────────────────────

const STALE_AFTER_MS = 60 * 60 * 1000 // 1 hour

function alertEmoji(level: string): string {
  if (level === 'warning') return '⚠️ '
  if (level === 'watch') return '🌤 '
  return ''
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function createWeatherContextProvider(deps: WeatherContextDeps): AppContextProvider {
  return {
    capability: 'weather',

    canHandle(req: AppContextRequest): boolean {
      return req.requestedCapabilities.includes('weather')
    },

    async getContext(req: AppContextRequest): Promise<AppContextProviderResult> {
      if (req.isCloudModel) {
        return {
          capability: 'weather',
          promptText: '',
          charCount: 0,
          freshness: 'missing',
          warnings: ['Weather context excluded — cloud model restriction.'],
          source: 'core-weather',
        }
      }

      let briefing: WeatherBriefing | null = null
      let current: CurrentWeather | null = null
      let forecast: DailyForecast[] = []
      let fetchedAt: number | undefined
      const warnings: string[] = []

      try {
        ;[briefing, { daily: forecast, fetchedAt }] = await Promise.all([
          deps.getBriefing(),
          deps.getForecast(3),
        ])
      } catch (err) {
        warnings.push(`Weather fetch failed: ${err instanceof Error ? err.message : 'error'}`)
      }

      try {
        current = await deps.getCurrent()
      } catch {
        // non-fatal — briefing is the primary context
      }

      const locationLabel = deps.getLocationLabel?.() ?? 'configured location'

      if (!briefing) {
        return {
          capability: 'weather',
          promptText: '',
          charCount: 0,
          freshness: 'missing',
          warnings: [...warnings, 'No weather data available. Location may not be set.'],
          suggestedRefreshAction: 'weather.getBriefing',
          source: 'core-weather',
        }
      }

      const isStale = fetchedAt !== undefined && Date.now() - fetchedAt > STALE_AFTER_MS
      if (isStale) warnings.push('Weather data may be stale (>1 hour old). Refresh recommended.')

      const tempStr = current
        ? `${Math.round(current.temperature_2m)}°C (feels ${Math.round(current.apparent_temperature)}°C)`
        : briefing.temp !== undefined
          ? `${Math.round(briefing.temp)}°C`
          : 'N/A'

      const forecastLines = forecast
        .slice(0, 3)
        .map(
          (d) =>
            `  ${d.date}: ${d.temperature_2m_min}–${d.temperature_2m_max}°C, precip ${d.precipitation_probability_max}%`,
        )
        .join('\n')

      const promptText = [
        '### Weather',
        `source: core-weather | location: ${locationLabel} | freshness: ${isStale ? 'stale' : 'fresh'}`,
        `alert: ${alertEmoji(briefing.alertLevel)}${briefing.alertLevel}`,
        `current: ${tempStr}${briefing.description ? ` — ${briefing.description}` : ''}`,
        `briefing: "${briefing.summary}"`,
        forecastLines ? `3-day forecast:\n${forecastLines}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      return {
        capability: 'weather',
        promptText,
        charCount: promptText.length,
        freshness: isStale ? 'stale' : 'fresh',
        ...(fetchedAt ? { dataTimestamp: new Date(fetchedAt).toISOString() } : {}),
        warnings,
        ...(isStale ? { suggestedRefreshAction: 'weather.getBriefing' } : {}),
        source: 'core-weather',
      }
    },
  }
}
