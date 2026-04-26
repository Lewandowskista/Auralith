// WMO weather code → human-readable description + alert level
const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
}

const ALERT_CODES = new Set([65, 75, 82, 86, 95, 96, 99])
const WATCH_CODES = new Set([61, 63, 71, 73, 80, 81, 85])

export type AlertLevel = 'none' | 'watch' | 'warning'

export function wmoDescription(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? 'Unknown'
}

export function wmoAlertLevel(code: number): AlertLevel {
  if (ALERT_CODES.has(code)) return 'warning'
  if (WATCH_CODES.has(code)) return 'watch'
  return 'none'
}

export type CurrentWeather = {
  temp: number
  feelsLike: number
  humidity: number
  windSpeed: number
  weatherCode: number
  description: string
  fetchedAt: number
}

export type DailyForecast = {
  date: string
  tempMin: number
  tempMax: number
  precipSum: number
  weatherCode: number
  sunrise: number
  sunset: number
}

export type HourlyForecast = {
  time: number
  temp: number
  precipProbability: number
  weatherCode: number
}

export type WeatherPayload = {
  current: CurrentWeather
  daily: DailyForecast[]
  hourly: HourlyForecast[]
  fetchedAt: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

type CacheEntry = { payload: WeatherPayload; expiresAt: number }
const memCache = new Map<string, CacheEntry>()

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherPayload> {
  const key = cacheKey(lat, lon)
  const cached = memCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.payload

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
  )
  url.searchParams.set(
    'daily',
    'temperature_2m_min,temperature_2m_max,precipitation_sum,weather_code,sunrise,sunset',
  )
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code')
  url.searchParams.set('forecast_days', '7')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('wind_speed_unit', 'kmh')

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'Auralith/1.0' },
  })
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)

  const data = (await res.json()) as OpenMeteoResponse
  const now = Date.now()

  const current: CurrentWeather = {
    temp: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    weatherCode: data.current.weather_code,
    description: wmoDescription(data.current.weather_code),
    fetchedAt: now,
  }

  const daily: DailyForecast[] = (data.daily.time ?? []).map((date, i) => ({
    date,
    tempMin: data.daily.temperature_2m_min[i] ?? 0,
    tempMax: data.daily.temperature_2m_max[i] ?? 0,
    precipSum: data.daily.precipitation_sum[i] ?? 0,
    weatherCode: data.daily.weather_code[i] ?? 0,
    sunrise: new Date(data.daily.sunrise[i] ?? '').getTime() || 0,
    sunset: new Date(data.daily.sunset[i] ?? '').getTime() || 0,
  }))

  // Only keep next 24h of hourly
  const hourly: HourlyForecast[] = (data.hourly.time ?? []).slice(0, 24).map((t, i) => ({
    time: new Date(t).getTime(),
    temp: data.hourly.temperature_2m[i] ?? 0,
    precipProbability: data.hourly.precipitation_probability[i] ?? 0,
    weatherCode: data.hourly.weather_code[i] ?? 0,
  }))

  const payload: WeatherPayload = { current, daily, hourly, fetchedAt: now }
  memCache.set(key, { payload, expiresAt: now + CACHE_TTL_MS })
  return payload
}

export function buildWeatherBriefing(payload: WeatherPayload): {
  summary: string
  alertLevel: AlertLevel
} {
  const { current, daily } = payload
  const today = daily[0]
  const alertLevel = wmoAlertLevel(current.weatherCode)

  const parts: string[] = []
  parts.push(`Currently ${Math.round(current.temp)}°C, ${current.description.toLowerCase()}.`)
  if (today) {
    parts.push(`Today: ${Math.round(today.tempMin)}–${Math.round(today.tempMax)}°C.`)
    if (today.precipSum > 0) parts.push(`${today.precipSum.toFixed(1)} mm precipitation expected.`)
  }
  if (alertLevel === 'warning') parts.push('⚠ Severe weather alert.')
  else if (alertLevel === 'watch') parts.push('Watch for hazardous conditions.')

  return { summary: parts.join(' '), alertLevel }
}

type GeocodingResult = {
  latitude: number
  longitude: number
  name: string
  country: string
  country_code: string
}

type GeocodingResponse = {
  results?: GeocodingResult[]
}

export type GeocodeResult = {
  lat: number
  lon: number
  resolvedName: string
}

export async function geocodeCity(city: string, country?: string): Promise<GeocodeResult> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', city)
  url.searchParams.set('count', '10')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10_000),
    headers: { 'User-Agent': 'Auralith/1.0' },
  })
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`)

  const data = (await res.json()) as GeocodingResponse
  if (!data.results || data.results.length === 0) {
    throw Object.assign(new Error(`City not found: ${city}`), { code: 'CITY_NOT_FOUND' })
  }

  let match = data.results[0] as GeocodingResult
  if (country) {
    const normalizedCountry = country.trim().toUpperCase()
    const countryMatch = data.results.find(
      (r) => r.country_code.toUpperCase() === normalizedCountry,
    )
    if (countryMatch) match = countryMatch
  }

  return {
    lat: match.latitude,
    lon: match.longitude,
    resolvedName: `${match.name}, ${match.country}`,
  }
}

// Open-Meteo response shape (minimal)
type OpenMeteoResponse = {
  current: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    wind_speed_10m: number
    weather_code: number
  }
  daily: {
    time: string[]
    temperature_2m_min: number[]
    temperature_2m_max: number[]
    precipitation_sum: number[]
    weather_code: number[]
    sunrise: string[]
    sunset: string[]
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: number[]
    weather_code: number[]
  }
}
