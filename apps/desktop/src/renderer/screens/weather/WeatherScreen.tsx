import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Thermometer,
  Wind,
  Droplets,
  Eye,
  Sunrise,
  Sunset,
  MapPin,
  RefreshCw,
  AlertTriangle,
  CloudRain,
} from 'lucide-react'
import { toast } from 'sonner'
import { ScreenShell } from '../../components/ScreenShell'

type CurrentWeather = {
  temp: number
  feelsLike: number
  humidity: number
  windSpeed: number
  weatherCode: number
  description: string
  fetchedAt: number
}

type DailyForecast = {
  date: string
  tempMin: number
  tempMax: number
  precipSum: number
  weatherCode: number
  sunrise: number
  sunset: number
}

type HourlyForecast = {
  time: number
  temp: number
  precipProbability: number
  weatherCode: number
}

type WeatherBriefing = {
  summary: string
  alertLevel: 'none' | 'watch' | 'warning'
}

const WMO_EMOJI: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  71: '🌨️',
  73: '❄️',
  75: '❄️',
  77: '🌨️',
  80: '🌦️',
  81: '🌧️',
  82: '⛈️',
  85: '🌨️',
  86: '❄️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
}

function wmoEmoji(code: number): string {
  return WMO_EMOJI[code] ?? '🌡️'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatHour(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', hour12: true })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

type AlertStyleResult = {
  color: string
  borderColor: string
  background: string
}

function alertStyle(level: string): AlertStyleResult {
  if (level === 'warning')
    return {
      color: 'var(--color-state-danger)',
      borderColor: 'rgba(248,113,113,0.30)',
      background: 'rgba(248,113,113,0.10)',
    }
  if (level === 'watch')
    return {
      color: 'var(--color-state-warning)',
      borderColor: 'rgba(251,191,36,0.30)',
      background: 'rgba(251,191,36,0.10)',
    }
  return { color: '', borderColor: '', background: '' }
}

export function WeatherScreen(): ReactElement {
  const [current, setCurrent] = useState<CurrentWeather | null>(null)
  const [daily, setDaily] = useState<DailyForecast[]>([])
  const [hourly, setHourly] = useState<HourlyForecast[]>([])
  const [briefing, setBriefing] = useState<WeatherBriefing | null>(null)
  const [location, setLocation] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [noLocation, setNoLocation] = useState(false)
  const [settingLocation, setSettingLocation] = useState(false)
  const [cityInput, setCityInput] = useState('')
  const [countryInput, setCountryInput] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const loadWeather = useCallback(async () => {
    setLoading(true)
    setNoLocation(false)
    try {
      const [currRes, forecastRes, briefRes] = await Promise.all([
        window.auralith.invoke('weather.getCurrent', {}),
        window.auralith.invoke('weather.getForecast', { days: 7 }),
        window.auralith.invoke('weather.getBriefing', {}),
      ])

      if (!currRes.ok) {
        if ((currRes.error as { code?: string })?.code === 'NO_LOCATION') {
          setNoLocation(true)
        } else {
          toast.error('Failed to load weather')
        }
        return
      }

      setCurrent(currRes.data as CurrentWeather)

      if (forecastRes.ok) {
        const d = forecastRes.data as { daily: DailyForecast[]; hourly: HourlyForecast[] }
        setDaily(d.daily)
        setHourly(d.hourly)
      }

      if (briefRes.ok) {
        setBriefing(briefRes.data as WeatherBriefing)
      }

      // Read label from settings
      const settingsRes = await window.auralith.invoke('settings.get', { key: 'weather.label' })
      if (settingsRes.ok) {
        const raw = settingsRes.data as { value: unknown }
        if (typeof raw.value === 'string') setLocation(raw.value)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWeather()
  }, [loadWeather])

  useEffect(() => {
    async function loadPersistedCity(): Promise<void> {
      const [cityRes, countryRes] = await Promise.all([
        window.auralith.invoke('settings.get', { key: 'weather.city' }),
        window.auralith.invoke('settings.get', { key: 'weather.country' }),
      ])
      if (cityRes.ok) {
        const city = (cityRes.data as { value: unknown }).value
        if (typeof city === 'string' && city) setCityInput(city)
      }
      if (countryRes.ok) {
        const country = (countryRes.data as { value: unknown }).value
        if (typeof country === 'string') setCountryInput(country)
      }
    }
    void loadPersistedCity()
  }, [])

  async function saveLocation(): Promise<void> {
    if (!cityInput.trim()) {
      toast.error('Enter a city name')
      return
    }
    setLocationError(null)
    setGeocoding(true)
    try {
      const res = await window.auralith.invoke('weather.setLocationByCity', {
        city: cityInput.trim(),
        ...(countryInput.trim() ? { country: countryInput.trim() } : {}),
      })
      if (res.ok) {
        const { resolvedName } = res.data as { resolvedName: string }
        toast.success(`Location set to ${resolvedName}`)
        setSettingLocation(false)
        void loadWeather()
      } else {
        const errCode = (res.error as { code?: string })?.code
        if (errCode === 'CITY_NOT_FOUND') {
          setLocationError('City not found. Try a different spelling or add a country code.')
        } else {
          toast.error('Failed to save location')
        }
      }
    } finally {
      setGeocoding(false)
    }
  }

  if (noLocation || settingLocation) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2">
          <MapPin size={32} style={{ color: 'var(--color-accent-mid)' }} />
          <div className="text-base font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Set your location
          </div>
          <div className="text-sm text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            Enter your city to get local weather from Open-Meteo
          </div>
        </div>

        <div className="flex flex-col gap-3 w-72">
          <input
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--color-border-hairline)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
            placeholder="City (e.g. Berlin)"
            value={cityInput}
            onChange={(e) => {
              setCityInput(e.target.value)
              setLocationError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveLocation()
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
            }}
            autoFocus
          />
          {locationError && <p className="text-xs text-red-400 -mt-1">{locationError}</p>}
          <input
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--color-border-hairline)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
            placeholder="Country code (e.g. DE) — optional"
            value={countryInput}
            onChange={(e) => setCountryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveLocation()
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
            }}
          />
          <div className="flex gap-2">
            {settingLocation && (
              <button
                onClick={() => setSettingLocation(false)}
                className="flex-1 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-hairline)',
                  background: 'transparent',
                  cursor: 'default',
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => void saveLocation()}
              disabled={geocoding}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
              style={{
                background: 'var(--color-accent-gradient)',
                border: 'none',
                cursor: geocoding ? 'not-allowed' : 'default',
                opacity: geocoding ? 0.6 : 1,
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => {
                if (!geocoding) e.currentTarget.style.opacity = '0.9'
              }}
              onMouseLeave={(e) => {
                if (!geocoding) e.currentTarget.style.opacity = '1'
              }}
            >
              {geocoding ? 'Searching…' : 'Save Location'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ScreenShell
      title="Weather"
      variant="padded"
      actions={
        <>
          {location && (
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
              <MapPin size={12} />
              {location}
            </span>
          )}
          <button
            onClick={() => setSettingLocation(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-hairline)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-low)]"
          >
            <MapPin size={12} />
            Change Location
          </button>
          <button
            onClick={() => void loadWeather()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-hairline)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-low)]"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </>
      }
    >
      <div className="max-w-[680px] mx-auto px-8 py-8 space-y-5">
        {/* Alert banner */}
        <AnimatePresence>
          {briefing && briefing.alertLevel !== 'none' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-3 px-4 py-3 rounded-xl border text-sm"
              style={alertStyle(briefing.alertLevel)}
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{briefing.summary}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Current conditions hero */}
        {current && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden"
            style={{
              padding: '40px 36px 36px',
              borderRadius: 20,
              background:
                'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(96,165,250,0.12) 50%, rgba(20,20,28,0.85) 100%)',
              border: '1px solid var(--color-border-subtle)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {/* Decorative circles */}
            <div
              className="pointer-events-none absolute"
              style={{
                top: -40,
                right: -40,
                width: 160,
                height: 160,
                borderRadius: '50%',
                background: 'rgba(139,92,246,0.08)',
              }}
            />
            <div
              className="pointer-events-none absolute"
              style={{
                bottom: -20,
                right: 60,
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'rgba(96,165,250,0.08)',
              }}
            />

            <div className="flex items-start justify-between mb-6 relative">
              <div>
                <div className="flex items-start gap-1 mb-1">
                  <span
                    className="leading-none font-light"
                    style={{
                      fontSize: 80,
                      color: 'var(--color-text-primary)',
                      letterSpacing: '-0.04em',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {Math.round(current.temp)}
                  </span>
                  <span
                    className="font-light mt-3"
                    style={{ fontSize: 28, color: 'var(--color-text-secondary)' }}
                  >
                    °C
                  </span>
                </div>
                <p
                  className="text-lg capitalize mb-1"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {current.description}
                </p>
                <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  Feels like {Math.round(current.feelsLike)}°C
                </p>
              </div>
              <div className="text-[72px] leading-none opacity-80">
                {wmoEmoji(current.weatherCode)}
              </div>
            </div>

            {/* Stats strip */}
            <div className="flex gap-5 relative">
              {[
                { Icon: Wind, label: 'Wind', value: `${Math.round(current.windSpeed)} km/h` },
                { Icon: Droplets, label: 'Humidity', value: `${current.humidity}%` },
                {
                  Icon: Thermometer,
                  label: 'Feels like',
                  value: `${Math.round(current.feelsLike)}°`,
                },
              ].map(({ Icon, label, value }) => (
                <div key={label} className="flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {label}
                    </span>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/* Sunrise / Sunset */}
            {daily[0] && (
              <div
                className="flex items-center gap-6 mt-5 pt-4 relative"
                style={{ borderTop: '1px solid var(--color-border-hairline)' }}
              >
                <div
                  className="flex items-center gap-2 text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <Sunrise size={14} style={{ color: 'var(--color-state-warning)' }} />
                  <span>{formatTime(daily[0].sunrise)}</span>
                </div>
                <div
                  className="flex items-center gap-2 text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <Sunset size={14} style={{ color: 'var(--color-accent-mid)' }} />
                  <span>{formatTime(daily[0].sunset)}</span>
                </div>
                {daily[0].precipSum > 0 && (
                  <div
                    className="flex items-center gap-2 text-sm"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <CloudRain size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    <span>{daily[0].precipSum.toFixed(1)} mm today</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Briefing summary (when no alert — alert shows it already) */}
        {briefing && briefing.alertLevel === 'none' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4 py-3 rounded-xl text-sm"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--color-border-hairline)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {briefing.summary}
          </motion.div>
        )}

        {/* Hourly strip */}
        {hourly.length > 0 && (
          <div>
            <div
              className="text-xs font-medium uppercase tracking-wider mb-3"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Next 24 Hours
            </div>
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content' }}>
                {hourly.map((h) => (
                  <motion.div
                    key={h.time}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl min-w-[64px]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--color-border-hairline)',
                    }}
                  >
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {formatHour(h.time)}
                    </span>
                    <span className="text-xl">{wmoEmoji(h.weatherCode)}</span>
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {Math.round(h.temp)}°
                    </span>
                    {h.precipProbability > 0 && (
                      <span className="text-xs text-blue-400">{h.precipProbability}%</span>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 7-day forecast */}
        {daily.length > 0 && (
          <div>
            <div
              className="text-xs font-medium uppercase tracking-wider mb-3"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              7-Day Forecast
            </div>
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(20,20,28,0.80)',
                border: '1px solid var(--color-border-hairline)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              {(() => {
                const range = daily.reduce(
                  (acc, d) => ({
                    min: Math.min(acc.min, d.tempMin),
                    max: Math.max(acc.max, d.tempMax),
                  }),
                  { min: Infinity, max: -Infinity },
                )
                return daily.map((day, i) => {
                  const barLeft = ((day.tempMin - range.min) / (range.max - range.min)) * 100
                  const barWidth = ((day.tempMax - day.tempMin) / (range.max - range.min)) * 100

                  return (
                    <motion.div
                      key={day.date}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-4 px-5 py-3.5"
                      style={{
                        borderTop: i > 0 ? '1px solid var(--color-border-hairline)' : undefined,
                      }}
                    >
                      <span
                        className="text-sm w-20 shrink-0"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {formatDate(day.date)}
                      </span>
                      <span className="text-xl shrink-0">{wmoEmoji(day.weatherCode)}</span>
                      <div className="flex items-center gap-2 flex-1">
                        <span
                          className="text-xs w-8 text-right shrink-0"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          {Math.round(day.tempMin)}°
                        </span>
                        <div
                          className="flex-1 h-1.5 rounded-full relative"
                          style={{ background: 'rgba(255,255,255,0.08)' }}
                        >
                          <div
                            className="absolute h-full rounded-full"
                            style={{
                              background: 'var(--color-accent-gradient)',
                              left: `${isFinite(barLeft) ? barLeft : 0}%`,
                              width: `${isFinite(barWidth) ? Math.max(barWidth, 4) : 4}%`,
                            }}
                          />
                        </div>
                        <span
                          className="text-xs w-8 shrink-0"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {Math.round(day.tempMax)}°
                        </span>
                      </div>
                      {day.precipSum > 0 && (
                        <div className="flex items-center gap-1 text-xs text-blue-400 w-16 shrink-0 justify-end">
                          <CloudRain size={11} />
                          {day.precipSum.toFixed(1)}mm
                        </div>
                      )}
                    </motion.div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !current && (
          <div className="space-y-3">
            <div
              className="h-40 rounded-2xl animate-pulse"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border-hairline)',
              }}
            />
            <div
              className="h-20 rounded-xl animate-pulse"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border-hairline)',
              }}
            />
            <div
              className="h-48 rounded-2xl animate-pulse"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border-hairline)',
              }}
            />
          </div>
        )}

        {/* Empty state */}
        {!loading && !current && !noLocation && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Eye size={32} style={{ color: 'var(--color-text-tertiary)' }} />
            <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              Could not load weather data
            </div>
            <button
              onClick={() => void loadWeather()}
              className="text-xs hover:underline"
              style={{
                color: 'var(--color-accent-mid)',
                background: 'none',
                border: 'none',
                cursor: 'default',
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </ScreenShell>
  )
}
