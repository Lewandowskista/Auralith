import { beforeAll, describe, expect, it } from 'vitest'
import { getTool } from '@auralith/core-tools'
import { registerAwarenessTools } from './awareness'

describe('assistant awareness read tools', () => {
  beforeAll(() => {
    registerAwarenessTools({
      getWeatherLocation: () => ({ lat: 44.43, lon: 26.1, label: 'Bucharest' }),
      fetchWeather: async () => ({
        fetchedAt: 1_700_000_000_000,
        current: {
          temp: 21.4,
          feelsLike: 20.9,
          humidity: 58,
          windSpeed: 12,
          weatherCode: 2,
          description: 'Partly cloudy',
          fetchedAt: 1_700_000_000_000,
        },
        daily: [],
        hourly: [],
      }),
      getNewsSummary: () => ({ topics: [], clusters: [], items: [], totalItems: 0 }),
      getRoutines: () => [],
      getRoutineHistory: () => [],
      getSuggestions: () => [],
      getClipboardItems: () => ({ enabled: true, items: [] }),
      getAppUsage: () => [],
      getSettingsSummary: () => ({ areas: [] }),
    })
  })

  it('registers weather.getCurrent as a safe read tool', async () => {
    const weather = getTool('weather.getCurrent')

    expect(weather?.tier).toBe('safe')
    const result = await weather?.execute({}, { traceId: 'test', actor: 'user' })

    expect(result).toMatchObject({
      location: 'Bucharest',
      current: {
        temp: 21.4,
        feelsLike: 20.9,
        description: 'Partly cloudy',
      },
    })
  })

  it('returns setup guidance when weather has no configured location', async () => {
    registerAwarenessTools({
      namespace: 'missingLocation',
      getWeatherLocation: () => undefined,
      fetchWeather: async () => {
        throw new Error('should not fetch')
      },
      getNewsSummary: () => ({ topics: [], clusters: [], items: [], totalItems: 0 }),
      getRoutines: () => [],
      getRoutineHistory: () => [],
      getSuggestions: () => [],
      getClipboardItems: () => ({ enabled: false, items: [] }),
      getAppUsage: () => [],
      getSettingsSummary: () => ({ areas: [] }),
    })

    const weather = getTool('missingLocation.weather.getCurrent')
    const result = await weather?.execute({}, { traceId: 'test', actor: 'user' })

    expect(result).toMatchObject({
      configured: false,
      message: expect.stringContaining('No weather location is set'),
    })
  })
})
