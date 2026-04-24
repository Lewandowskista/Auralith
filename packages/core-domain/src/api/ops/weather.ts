import { z } from 'zod'

const HourlySchema = z.object({
  time: z.number(),
  temp: z.number(),
  precipProbability: z.number(),
  weatherCode: z.number(),
})

const DailySchema = z.object({
  date: z.string(),
  tempMin: z.number(),
  tempMax: z.number(),
  precipSum: z.number(),
  weatherCode: z.number(),
  sunrise: z.number(),
  sunset: z.number(),
})

export const WeatherGetCurrentParamsSchema = z.object({
  lat: z.number().optional(),
  lon: z.number().optional(),
})
export const WeatherGetCurrentResultSchema = z.object({
  temp: z.number(),
  feelsLike: z.number(),
  humidity: z.number(),
  windSpeed: z.number(),
  weatherCode: z.number(),
  description: z.string(),
  fetchedAt: z.number(),
})

export const WeatherGetForecastParamsSchema = z.object({
  lat: z.number().optional(),
  lon: z.number().optional(),
  days: z.number().int().min(1).max(7).default(7),
})
export const WeatherGetForecastResultSchema = z.object({
  daily: z.array(DailySchema),
  hourly: z.array(HourlySchema),
  fetchedAt: z.number(),
})

export const WeatherSetLocationParamsSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  label: z.string().optional(),
})
export const WeatherSetLocationResultSchema = z.object({ updated: z.boolean() })

export const WeatherGetBriefingParamsSchema = z.object({})
export const WeatherGetBriefingResultSchema = z.object({
  summary: z.string(),
  alertLevel: z.enum(['none', 'watch', 'warning']),
})
