import { useState, useEffect, useCallback } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wind,
  Droplets,
  Eye,
  Sunrise,
  MapPin,
  RefreshCw,
  AlertTriangle,
  CloudRain,
  CloudSun,
  Sun,
  Cloud,
  Snowflake,
  Zap,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  precipProbability?: number
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

// ─── WMO helpers ─────────────────────────────────────────────────────────────

const WMO_ICON: Record<number, 'clear' | 'partly' | 'cloud' | 'rain' | 'snow' | 'storm'> = {
  0: 'clear',
  1: 'clear',
  2: 'partly',
  3: 'cloud',
  45: 'cloud',
  48: 'cloud',
  51: 'rain',
  53: 'rain',
  55: 'rain',
  61: 'rain',
  63: 'rain',
  65: 'rain',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snow',
  80: 'rain',
  81: 'rain',
  82: 'storm',
  85: 'snow',
  86: 'snow',
  95: 'storm',
  96: 'storm',
  99: 'storm',
}

function WeatherIcon({
  code,
  size = 18,
  style,
}: {
  code: number
  size?: number
  style?: React.CSSProperties
}): ReactElement {
  const kind = WMO_ICON[code] ?? 'partly'
  const props = { size, style }
  if (kind === 'clear') return <Sun {...props} />
  if (kind === 'partly') return <CloudSun {...props} />
  if (kind === 'cloud') return <Cloud {...props} />
  if (kind === 'snow') return <Snowflake {...props} />
  if (kind === 'storm') return <Zap {...props} />
  return <CloudRain {...props} />
}

function narrativeTitle(desc: string): string {
  const d = desc.toLowerCase()
  if (d.includes('clear') || d.includes('sunny')) return 'A clear, bright day'
  if (d.includes('partly') || d.includes('mostly')) return 'Mostly clear skies'
  if (d.includes('overcast') || d.includes('cloud')) return 'A cool, overcast day'
  if (d.includes('drizzle') || d.includes('light rain')) return 'A drizzly afternoon'
  if (d.includes('rain') || d.includes('shower')) return 'Rain is in the forecast'
  if (d.includes('snow') || d.includes('flurr')) return 'Snow in the forecast'
  if (d.includes('storm') || d.includes('thunder')) return 'Stormy conditions ahead'
  if (d.includes('fog') || d.includes('mist')) return 'A misty, foggy day'
  return "Today's weather"
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatHour(ts: number): string {
  const h = new Date(ts).getHours()
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString([], { weekday: 'short' })
}

function daylightDuration(sunrise: number, sunset: number): string {
  const mins = Math.round((sunset - sunrise) / 60000)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// ─── Temp sparkline SVG ───────────────────────────────────────────────────────

function TempCurve({ temps }: { temps: number[] }): ReactElement {
  if (temps.length < 2) return <div style={{ height: 80 }} />
  const w = 100
  const h = 80
  const min = Math.min(...temps) - 1
  const max = Math.max(...temps) + 1
  const range = max - min || 1
  const step = w / (temps.length - 1)
  const pts = temps.map((t, i) => {
    const x = i * step
    const y = h - ((t - min) / range) * (h - 24) - 12
    return [x, y] as [number, number]
  })
  const linePath = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const fillPath = `${linePath} L${w},${h} L0,${h} Z`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: h, display: 'block' }}
    >
      <defs>
        <linearGradient id="wxGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent-mid, #8b5cf6)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-accent-mid, #8b5cf6)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#wxGrad)" />
      <path
        d={linePath}
        stroke="var(--color-accent-mid, #8b5cf6)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 5px rgba(139,92,246,0.5))' }}
      />
    </svg>
  )
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Card({
  children,
  style,
}: {
  children: ReactNode
  style?: React.CSSProperties
}): ReactElement {
  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(16,16,24,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactElement
  label: string
  value: string
  sub?: string
}): ReactElement {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: 'rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
          }}
        >
          {icon}
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 500,
          lineHeight: 1,
          color: 'var(--color-text-primary)',
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{sub}</div>
      )}
    </Card>
  )
}

function Eyebrow({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = Eyebrow

function GhostBtn({
  icon,
  children,
  onClick,
}: {
  icon?: ReactElement
  children?: ReactNode
  onClick?: () => void
}): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0)',
        color: 'var(--color-text-secondary)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background 120ms, color 120ms',
        fontFamily: 'var(--font-sans)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
        e.currentTarget.style.color = 'var(--color-text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0)'
        e.currentTarget.style.color = 'var(--color-text-secondary)'
      }}
    >
      {icon}
      {children}
    </button>
  )
}

// ─── Location setup ───────────────────────────────────────────────────────────

function LocationSetup({
  onSaved,
  onCancel,
  showCancel,
}: {
  onSaved: () => void
  onCancel?: () => void
  showCancel: boolean
}): ReactElement {
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load(): Promise<void> {
      const [cr, co] = await Promise.all([
        window.auralith.invoke('settings.get', { key: 'weather.city' }),
        window.auralith.invoke('settings.get', { key: 'weather.country' }),
      ])
      if (cr.ok) {
        const v = (cr.data as { value: unknown }).value
        if (typeof v === 'string') setCity(v)
      }
      if (co.ok) {
        const v = (co.data as { value: unknown }).value
        if (typeof v === 'string') setCountry(v)
      }
    }
    void load()
  }, [])

  async function save(): Promise<void> {
    if (!city.trim()) {
      setError('Enter a city name')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await window.auralith.invoke('weather.setLocationByCity', {
        city: city.trim(),
        ...(country.trim() ? { country: country.trim() } : {}),
      })
      if (res.ok) {
        const { resolvedName } = res.data as { resolvedName: string }
        toast.success(`Location set to ${resolvedName}`)
        onSaved()
      } else {
        const code = (res.error as { code?: string })?.code
        setError(
          code === 'CITY_NOT_FOUND'
            ? 'City not found. Try a different spelling or add a country code.'
            : 'Failed to save location',
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          width: 300,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-accent-high)',
          }}
        >
          <MapPin size={24} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: 4,
            }}
          >
            Set your location
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            Enter your city to get local weather from Open-Meteo.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          {['City (e.g. Berlin)', 'Country code (e.g. DE) — optional'].map((ph, idx) => (
            <input
              key={ph}
              placeholder={ph}
              value={idx === 0 ? city : country}
              onChange={(e) => {
                if (idx === 0) {
                  setCity(e.target.value)
                  setError(null)
                } else {
                  setCountry(e.target.value)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
              }}
              autoFocus={idx === 0}
              style={{
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: 13,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
              }}
            />
          ))}
          {error && <p style={{ fontSize: 11, color: '#f87171', marginTop: -4 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {showCancel && onCancel && <GhostBtn onClick={onCancel}>Cancel</GhostBtn>}
            <button
              onClick={() => void save()}
              disabled={loading}
              style={{
                flex: 1,
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                background: 'var(--color-accent-low)',
                border: 'none',
                color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                fontFamily: 'var(--font-sans)',
                transition: 'opacity 120ms',
              }}
            >
              {loading ? 'Searching…' : 'Save Location'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function WeatherScreen(): ReactElement {
  const [current, setCurrent] = useState<CurrentWeather | null>(null)
  const [daily, setDaily] = useState<DailyForecast[]>([])
  const [hourly, setHourly] = useState<HourlyForecast[]>([])
  const [briefing, setBriefing] = useState<WeatherBriefing | null>(null)
  const [location, setLocation] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [noLocation, setNoLocation] = useState(false)
  const [changingLocation, setChangingLocation] = useState(false)

  const loadWeather = useCallback(async () => {
    setLoading(true)
    setNoLocation(false)
    try {
      const [currRes, forecastRes, briefRes, labelRes] = await Promise.all([
        window.auralith.invoke('weather.getCurrent', {}),
        window.auralith.invoke('weather.getForecast', { days: 7 }),
        window.auralith.invoke('weather.getBriefing', {}),
        window.auralith.invoke('settings.get', { key: 'weather.label' }),
      ])

      if (!currRes.ok) {
        if ((currRes.error as { code?: string })?.code === 'NO_LOCATION') setNoLocation(true)
        else toast.error('Failed to load weather')
        return
      }
      setCurrent(currRes.data as CurrentWeather)

      if (forecastRes.ok) {
        const d = forecastRes.data as { daily: DailyForecast[]; hourly: HourlyForecast[] }
        setDaily(d.daily)
        setHourly(d.hourly)
      }
      if (briefRes.ok) setBriefing(briefRes.data as WeatherBriefing)
      if (labelRes.ok) {
        const v = (labelRes.data as { value: unknown }).value
        if (typeof v === 'string') setLocation(v)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWeather()
  }, [loadWeather])

  if (noLocation || changingLocation) {
    return (
      <div style={{ display: 'flex', height: '100%', flexDirection: 'column', overflow: 'hidden' }}>
        <LocationSetup
          showCancel={changingLocation}
          onCancel={() => setChangingLocation(false)}
          onSaved={() => {
            setChangingLocation(false)
            void loadWeather()
          }}
        />
      </div>
    )
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const alertStyle =
    briefing?.alertLevel === 'warning'
      ? {
          color: '#f87171',
          borderColor: 'rgba(248,113,113,0.30)',
          background: 'rgba(248,113,113,0.10)',
        }
      : briefing?.alertLevel === 'watch'
        ? {
            color: '#fbbf24',
            borderColor: 'rgba(251,191,36,0.30)',
            background: 'rgba(251,191,36,0.10)',
          }
        : null

  const tempRange = daily.reduce(
    (acc, d) => ({ min: Math.min(acc.min, d.tempMin), max: Math.max(acc.max, d.tempMax) }),
    { min: Infinity, max: -Infinity },
  )

  // Ambient "Noticed for you" notes derived from briefing summary
  const ambientNotes =
    briefing?.alertLevel !== 'none'
      ? []
      : ([
          briefing?.summary
            ? {
                id: 'briefing',
                tone: 'info' as const,
                title: "Today's weather summary",
                body: briefing.summary,
              }
            : null,
          daily[0] && daily[0].precipSum > 0
            ? {
                id: 'rain',
                tone: 'info' as const,
                title: `Rain expected: ${daily[0].precipSum.toFixed(1)} mm today`,
                body: 'Consider an umbrella if heading out.',
              }
            : null,
          daily[0]
            ? {
                id: 'daylight',
                tone: 'success' as const,
                title: `Sunrise ${formatTime(daily[0].sunrise)} · Sunset ${formatTime(daily[0].sunset)}`,
                body: `${daylightDuration(daily[0].sunrise, daily[0].sunset)} of daylight today.`,
              }
            : null,
        ].filter(Boolean) as Array<{
          id: string
          tone: 'info' | 'success' | 'warning'
          title: string
          body: string
        }>)

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0 40px 48px' }}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            padding: '64px 0 28px',
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 34,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              {current ? narrativeTitle(current.description) : 'Weather'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
              {location ?? '—'}
              {current ? ` · updated ${formatTime(current.fetchedAt)}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostBtn icon={<MapPin size={13} />} onClick={() => setChangingLocation(true)}>
              Change place
            </GhostBtn>
            <GhostBtn
              icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
              onClick={() => void loadWeather()}
            >
              Refresh
            </GhostBtn>
          </div>
        </motion.div>

        {/* ── Alert banner ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {alertStyle && briefing && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 16px',
                borderRadius: 12,
                border: `1px solid ${alertStyle.borderColor}`,
                background: alertStyle.background,
                color: alertStyle.color,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <AlertTriangle size={16} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{briefing.summary}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Hero: current + sparkline ────────────────────────────────────── */}
        {(current || loading) && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.06, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ marginBottom: 16 }}
          >
            <Card>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 1.6fr' }}>
                {/* Left: current conditions */}
                <div
                  style={{ padding: '22px 24px', borderRight: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#34d399',
                        display: 'inline-block',
                        boxShadow: '0 0 8px rgba(52,211,153,0.6)',
                        animation: 'ambient-pulse 2s ease-in-out infinite',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      Now
                    </span>
                  </div>

                  {current ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                        <WeatherIcon
                          code={current.weatherCode}
                          size={60}
                          style={{
                            color: 'var(--color-accent-high)',
                            filter: 'drop-shadow(0 0 18px rgba(139,92,246,0.4))',
                            marginTop: 6,
                            flexShrink: 0,
                          }}
                        />
                        <div>
                          <div
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: 68,
                              fontWeight: 400,
                              lineHeight: 0.9,
                              letterSpacing: '-0.04em',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            {Math.round(current.temp)}°
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color: 'var(--color-text-secondary)',
                              marginTop: 6,
                              textTransform: 'capitalize',
                            }}
                          >
                            {current.description}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--color-text-tertiary)',
                              marginTop: 2,
                            }}
                          >
                            Feels like {Math.round(current.feelsLike)}°
                            {daily[0]
                              ? ` · ${Math.round(daily[0].tempMin)}° / ${Math.round(daily[0].tempMax)}°`
                              : ''}
                          </div>
                        </div>
                      </div>

                      {daily[0] && daily[0].precipSum > 0 && (
                        <div
                          style={{
                            marginTop: 14,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: 'rgba(96,165,250,0.10)',
                            border: '1px solid rgba(96,165,250,0.18)',
                            fontSize: 11,
                            color: '#60a5fa',
                          }}
                        >
                          <CloudRain size={11} />
                          Rain · {daily[0].precipSum.toFixed(1)} mm
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      style={{
                        height: 120,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <RefreshCw
                        size={20}
                        style={{
                          color: 'var(--color-text-tertiary)',
                          animation: 'spin 1s linear infinite',
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Right: sparkline + hourly */}
                <div
                  style={{
                    padding: '18px 18px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 220,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}
                    >
                      Next 14 hours
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      °C · precipitation %
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <TempCurve temps={hourly.slice(0, 14).map((h) => h.temp)} />
                  </div>
                  <div style={{ display: 'flex', gap: 0, marginTop: 4, overflowX: 'hidden' }}>
                    {hourly.slice(0, 14).map((h) => (
                      <div
                        key={h.time}
                        style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '8px 2px' }}
                      >
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          {formatHour(h.time)}
                        </div>
                        <div
                          style={{
                            margin: '5px 0',
                            display: 'flex',
                            justifyContent: 'center',
                            color: 'var(--color-accent-high)',
                          }}
                        >
                          <WeatherIcon code={h.weatherCode} size={14} />
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {Math.round(h.temp)}°
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            marginTop: 3,
                            color:
                              h.precipProbability > 30 ? '#60a5fa' : 'var(--color-text-tertiary)',
                          }}
                        >
                          {h.precipProbability}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* ── Stat tiles ──────────────────────────────────────────────────── */}
        {current && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
              marginBottom: 16,
            }}
          >
            <StatTile
              icon={<Wind size={13} />}
              label="Wind"
              value={`${Math.round(current.windSpeed)} km/h`}
            />
            <StatTile
              icon={<Droplets size={13} />}
              label="Humidity"
              value={`${current.humidity}%`}
              sub={`Feels like ${Math.round(current.feelsLike)}°`}
            />
            {daily[0] && (
              <StatTile
                icon={<Sunrise size={13} />}
                label="Daylight"
                value={`${formatTime(daily[0].sunrise)} → ${formatTime(daily[0].sunset)}`}
                sub={daylightDuration(daily[0].sunrise, daily[0].sunset)}
              />
            )}
          </motion.div>
        )}

        {/* ── Lower grid: 7-day + Noticed for you ─────────────────────────── */}
        {(daily.length > 0 || ambientNotes.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
              gap: 14,
            }}
          >
            {/* 7-day */}
            {daily.length > 0 && (
              <Card style={{ padding: 0 }}>
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}
                    >
                      Seven days
                    </div>
                    <div
                      style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}
                    >
                      {location ?? '—'} · hourly model
                    </div>
                  </div>
                </div>
                {/* Column headers */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 28px 38px 1fr 36px 40px',
                    gap: 10,
                    padding: '8px 20px 4px',
                    fontSize: 8,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  <div>Day</div>
                  <div style={{ textAlign: 'center' }}>Cond</div>
                  <div style={{ textAlign: 'right' }}>Pop</div>
                  <div style={{ paddingLeft: 4 }}>Range</div>
                  <div style={{ textAlign: 'right' }}>Low</div>
                  <div style={{ textAlign: 'right' }}>High</div>
                </div>
                {daily.map((d, i) => {
                  const barLeft = isFinite(tempRange.min)
                    ? ((d.tempMin - tempRange.min) / (tempRange.max - tempRange.min)) * 100
                    : 0
                  const barWidth = isFinite(tempRange.min)
                    ? ((d.tempMax - d.tempMin) / (tempRange.max - tempRange.min)) * 100
                    : 10
                  const pop =
                    d.precipProbability ??
                    (d.precipSum > 0 ? Math.min(99, Math.round(d.precipSum * 20)) : 0)
                  const isToday = i === 0
                  return (
                    <div
                      key={d.date}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '60px 28px 38px 1fr 36px 40px',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 20px',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          color: isToday
                            ? 'var(--color-text-primary)'
                            : 'var(--color-text-secondary)',
                          fontWeight: isToday ? 600 : 400,
                        }}
                      >
                        {formatDate(d.date)}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'center',
                          color: 'var(--color-accent-high)',
                        }}
                      >
                        <WeatherIcon code={d.weatherCode} size={15} />
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          textAlign: 'right',
                          color: pop > 30 ? '#60a5fa' : 'var(--color-text-tertiary)',
                        }}
                      >
                        {pop}%
                      </div>
                      <div style={{ position: 'relative', height: 5 }}>
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 3,
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${barLeft}%`,
                            width: `${Math.max(barWidth, 4)}%`,
                            background:
                              'linear-gradient(90deg, #60a5fa 0%, var(--color-accent-mid, #8b5cf6) 60%, #fbbf24 100%)',
                            borderRadius: 3,
                            opacity: 0.8,
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          textAlign: 'right',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {Math.round(d.tempMin)}°
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          textAlign: 'right',
                          color: 'var(--color-text-primary)',
                          fontWeight: 500,
                        }}
                      >
                        {Math.round(d.tempMax)}°
                      </div>
                    </div>
                  )
                })}
              </Card>
            )}

            {/* Noticed for you */}
            <Card style={{ padding: 0 }}>
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}
                  >
                    Noticed for you
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    ambient signals · no push
                  </div>
                </div>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'rgba(139,92,246,0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent-high)',
                  }}
                >
                  <Sparkles size={13} />
                </div>
              </div>
              <div
                style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                {ambientNotes.length > 0 ? (
                  ambientNotes.map((note) => {
                    const borderColor =
                      note.tone === 'success'
                        ? '#34d399'
                        : note.tone === 'warning'
                          ? '#fbbf24'
                          : '#60a5fa'
                    return (
                      <div
                        key={note.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderLeft: `2px solid ${borderColor}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            marginBottom: 4,
                            lineHeight: 1.35,
                          }}
                        >
                          {note.title}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.55,
                          }}
                        >
                          {note.body}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-tertiary)',
                      textAlign: 'center',
                      padding: '24px 0',
                    }}
                  >
                    Signals appear here once weather loads.
                  </div>
                )}
                <div
                  style={{
                    paddingTop: 4,
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    marginTop: 4,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--color-text-tertiary)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Signals derive from forecast and saved places. Never uploaded.
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────────────── */}
        {loading && !current && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[260, 60, 200].map((h, i) => (
              <div key={i} className="skeleton" style={{ height: h, borderRadius: 14 }} />
            ))}
          </div>
        )}

        {/* ── Error empty state ────────────────────────────────────────────── */}
        {!loading && !current && !noLocation && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '80px 0',
              textAlign: 'center',
            }}
          >
            <Eye size={32} style={{ color: 'var(--color-text-tertiary)' }} />
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              Could not load weather data
            </div>
            <button
              onClick={() => void loadWeather()}
              style={{
                fontSize: 12,
                color: 'var(--color-accent-mid)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
