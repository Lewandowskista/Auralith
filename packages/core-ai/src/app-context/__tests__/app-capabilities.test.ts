import { describe, it, expect } from 'vitest'
import {
  APP_CAPABILITY_MANIFEST,
  getCapabilityDef,
  getPromptSafeCapabilities,
  getCloudAllowedCapabilities,
  buildAppIdentityBlock,
  type AppCapabilityId,
} from '../../app-capabilities'

describe('App Capability Manifest', () => {
  const REQUIRED_CAPABILITIES: AppCapabilityId[] = [
    'weather',
    'news',
    'briefings',
    'activity',
    'knowledge',
    'suggestions',
    'routines',
    'settings',
  ]

  it('manifest contains all required capabilities', () => {
    const ids = APP_CAPABILITY_MANIFEST.map((c) => c.id)
    for (const req of REQUIRED_CAPABILITIES) {
      expect(ids).toContain(req)
    }
  })

  it('each capability has required fields', () => {
    for (const cap of APP_CAPABILITY_MANIFEST) {
      expect(cap.id).toBeTruthy()
      expect(cap.displayName).toBeTruthy()
      expect(cap.description.length).toBeGreaterThan(10)
      expect(cap.sourceOfTruth).toBeTruthy()
      expect(cap.dataAvailable.length).toBeGreaterThan(0)
      expect(cap.readActions.length).toBeGreaterThan(0)
      expect(cap.staleAfterMs).toBeGreaterThan(0)
      expect(typeof cap.promptSafe).toBe('boolean')
      expect(['low', 'medium', 'high']).toContain(cap.privacyLevel)
      expect(cap.maxContextChars).toBeGreaterThan(0)
      expect(typeof cap.cloudAllowed).toBe('boolean')
    }
  })

  it('weather capability exists with correct properties', () => {
    const weather = getCapabilityDef('weather')
    if (!weather) throw new Error('weather capability not found')
    expect(weather.displayName).toBe('Weather')
    expect(weather.sourceOfTruth).toBe('core-weather')
    expect(weather.readActions).toContain('weather.getCurrent')
    expect(weather.readActions).toContain('weather.getForecast')
    expect(weather.readActions).toContain('weather.getBriefing')
    expect(weather.privacyLevel).toBe('low')
    expect(weather.promptSafe).toBe(true)
    expect(weather.cloudAllowed).toBe(false)
  })

  it('news capability exists with correct properties', () => {
    const news = getCapabilityDef('news')
    if (!news) throw new Error('news capability not found')
    expect(news.displayName).toBe('News')
    expect(news.sourceOfTruth).toBe('core-news')
    expect(news.readActions).toContain('news.listTopics')
    expect(news.readActions).toContain('news.listClusters')
    expect(news.writeActions).toContain('news.triggerFetch')
    expect(news.promptSafe).toBe(true)
  })

  it('activity capability exists and is NOT promptSafe (paths need sanitizing)', () => {
    const activity = getCapabilityDef('activity')
    if (!activity) throw new Error('activity capability not found')
    expect(activity.promptSafe).toBe(false)
    expect(activity.privacyLevel).toBe('high')
    expect(activity.cloudAllowed).toBe(false)
  })

  it('knowledge capability exists and is NOT promptSafe (untrusted content)', () => {
    const knowledge = getCapabilityDef('knowledge')
    if (!knowledge) throw new Error('knowledge capability not found')
    expect(knowledge.promptSafe).toBe(false)
    expect(knowledge.privacyLevel).toBe('high')
    expect(knowledge.cloudAllowed).toBe(false)
  })

  it('routines capability exists', () => {
    const routines = getCapabilityDef('routines')
    if (!routines) throw new Error('routines capability not found')
    expect(routines.writeActions).toBeDefined()
    expect((routines.writeActions ?? []).length).toBeGreaterThan(0)
  })

  it('suggestions capability exists', () => {
    const suggestions = getCapabilityDef('suggestions')
    if (!suggestions) throw new Error('suggestions capability not found')
    expect(suggestions.readActions).toContain('suggest.list')
  })

  it('no capability has cloudAllowed=true (all local by default)', () => {
    const cloudAllowed = getCloudAllowedCapabilities()
    expect(cloudAllowed).toHaveLength(0)
  })

  it('promptSafe capabilities do not include high-privacy capabilities', () => {
    const safe = getPromptSafeCapabilities()
    const safeIds = safe.map((c) => c.id)
    expect(safeIds).not.toContain('activity')
    expect(safeIds).not.toContain('knowledge')
  })

  it('buildAppIdentityBlock mentions Auralith and key modules', () => {
    const block = buildAppIdentityBlock()
    expect(block).toContain('Auralith')
    expect(block).toContain('Weather')
    expect(block).toContain('News')
    expect(block).toContain('source of truth')
    expect(block).toContain('Do not invent app data')
  })
})
