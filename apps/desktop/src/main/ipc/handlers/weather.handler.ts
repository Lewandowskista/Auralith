import { registerHandler } from '../router'
import type { DbBundle } from '@auralith/core-db'
import { createSettingsRepo } from '@auralith/core-db'
import {
  WeatherGetCurrentParamsSchema,
  WeatherGetForecastParamsSchema,
  WeatherSetLocationParamsSchema,
  WeatherGetBriefingParamsSchema,
  WeatherSetLocationByCityParamsSchema,
} from '@auralith/core-domain'
import { fetchWeather, buildWeatherBriefing, geocodeCity } from '@auralith/core-weather'
import { z } from 'zod'

let _bundle: DbBundle | null = null

export function initWeatherDeps(bundle: DbBundle): void {
  _bundle = bundle
}

function getBundle(): DbBundle {
  if (!_bundle) throw new Error('Weather deps not initialized')
  return _bundle
}

function getLocation(
  bundle: DbBundle,
  paramLat?: number,
  paramLon?: number,
): { lat: number; lon: number } {
  if (paramLat !== undefined && paramLon !== undefined) {
    return { lat: paramLat, lon: paramLon }
  }
  const settings = createSettingsRepo(bundle.db)
  const lat = settings.get('weather.lat', z.union([z.number(), z.string()]))
  const lon = settings.get('weather.lon', z.union([z.number(), z.string()]))
  if (lat === undefined || lon === undefined) {
    throw Object.assign(new Error('No location set. Use weather.setLocation first.'), {
      code: 'NO_LOCATION',
    })
  }
  return { lat: Number(lat), lon: Number(lon) }
}

export function registerWeatherHandlers(): void {
  registerHandler('weather.getCurrent', async (params) => {
    const opts = WeatherGetCurrentParamsSchema.parse(params)
    const bundle = getBundle()
    const { lat, lon } = getLocation(bundle, opts.lat, opts.lon)
    const payload = await fetchWeather(lat, lon)
    return payload.current
  })

  registerHandler('weather.getForecast', async (params) => {
    const opts = WeatherGetForecastParamsSchema.parse(params)
    const bundle = getBundle()
    const { lat, lon } = getLocation(bundle, opts.lat, opts.lon)
    const payload = await fetchWeather(lat, lon)
    return {
      daily: payload.daily.slice(0, opts.days),
      hourly: payload.hourly,
      fetchedAt: payload.fetchedAt,
    }
  })

  registerHandler('weather.setLocation', async (params) => {
    const { lat, lon, label } = WeatherSetLocationParamsSchema.parse(params)
    const bundle = getBundle()
    const settings = createSettingsRepo(bundle.db)
    settings.set('weather.lat', lat)
    settings.set('weather.lon', lon)
    if (label !== undefined) settings.set('weather.label', label)
    return { updated: true }
  })

  registerHandler('weather.getBriefing', async (params) => {
    WeatherGetBriefingParamsSchema.parse(params)
    const bundle = getBundle()
    const { lat, lon } = getLocation(bundle)
    const payload = await fetchWeather(lat, lon)
    return buildWeatherBriefing(payload)
  })

  registerHandler('weather.setLocationByCity', async (params) => {
    const { city, country } = WeatherSetLocationByCityParamsSchema.parse(params)
    const bundle = getBundle()
    const settings = createSettingsRepo(bundle.db)
    const { lat, lon, resolvedName } = await geocodeCity(city, country)
    settings.set('weather.lat', lat)
    settings.set('weather.lon', lon)
    settings.set('weather.label', resolvedName)
    settings.set('weather.city', city)
    settings.set('weather.country', country ?? '')
    return { updated: true, resolvedName, lat, lon }
  })
}
