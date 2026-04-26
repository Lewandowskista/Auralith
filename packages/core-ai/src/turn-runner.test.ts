import { describe, expect, it } from 'vitest'
import { runTurn, type ToolManifestEntry } from './turn-runner'
import type { OllamaClient, GenerateOpts } from './client'

const weatherForecastTool: ToolManifestEntry = {
  id: 'weather.getForecast',
  tier: 'safe',
  description: 'Get local weather forecast.',
  paramsSchema: { type: 'object', properties: { days: { type: 'number' } }, required: [] },
}

function fakeClient(responses: string[]): OllamaClient {
  let index = 0
  const nextResponse = () => responses[index++] ?? '{"type":"speak","text":"Done."}'
  return {
    generate: async (_opts: GenerateOpts) => nextResponse(),
    stream: async function* (_opts: GenerateOpts) {
      yield nextResponse()
    },
  } as unknown as OllamaClient
}

describe('runTurn structured output parsing', () => {
  it('normalizes direct tool-id JSON so it is not rendered as a raw assistant message', async () => {
    const streamed: string[] = []
    const invoked: Array<{ toolId: string; params: unknown }> = []

    const result = await runTurn({
      userText: 'What is the temperature in five hours?',
      sessionId: 'session-1',
      history: [],
      tools: [weatherForecastTool],
      ragContext: '',
      deps: {
        chatClient: fakeClient([
          '{"type":"weather.getForecast","params":{"days":1}}',
          '{"type":"speak","text":"The forecast is available."}',
        ]),
        chatModel: 'test-model',
        onToken: (token) => streamed.push(token),
        executeTool: async (toolId, params) => {
          invoked.push({ toolId, params })
          return {
            outcome: 'success',
            result: {
              daily: [],
              hourly: [{ time: 1_700_000_000_000, temp: 22 }],
            },
          }
        },
      },
    })

    expect(invoked).toEqual([{ toolId: 'weather.getForecast', params: { days: 1 } }])
    expect(result.toolsInvoked).toEqual([{ toolId: 'weather.getForecast', outcome: 'success' }])
    expect(streamed.join('')).not.toContain('"type":"weather.getForecast"')
    expect(streamed.join('')).toBe('The forecast is available.')
    expect(result.finalText).toBe('The forecast is available.')
  })
})
