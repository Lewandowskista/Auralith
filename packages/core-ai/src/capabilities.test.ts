import { describe, expect, it } from 'vitest'
import { buildAssistantCapabilityContext } from './capabilities'
import type { ToolManifestEntry } from './turn-runner'

const tool = (id: string, description: string): ToolManifestEntry => ({
  id,
  tier: 'safe',
  description,
  paramsSchema: { type: 'object', properties: {}, required: [] },
})

describe('buildAssistantCapabilityContext', () => {
  it('describes app capability areas and their available tools', () => {
    const context = buildAssistantCapabilityContext([
      tool('weather.getCurrent', 'Get current local weather.'),
      tool('activity.query', 'Query recent activity events.'),
      tool('routines.list', 'List routines.'),
    ])

    expect(context).toContain('Weather')
    expect(context).toContain('weather.getCurrent')
    expect(context).toContain('Activity')
    expect(context).toContain('activity.query')
    expect(context).toContain('Routines')
    expect(context).toContain('routines.list')
  })

  it('instructs the model to prefer safe read tools for current app data', () => {
    const context = buildAssistantCapabilityContext([
      tool('weather.getCurrent', 'Get current local weather.'),
    ])

    expect(context).toContain('Prefer safe read tools')
    expect(context).toContain('Do not give generic inability/refusal answers')
  })
})
