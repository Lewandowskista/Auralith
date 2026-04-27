/**
 * App Context Broker
 *
 * Decides which Auralith app data to fetch for a given user request,
 * calls the relevant providers, enforces budget and privacy rules,
 * and returns a structured AppContextSnapshot ready for prompt injection.
 */

import type { AppCapabilityId } from '../app-capabilities'
import { getCapabilityDef } from '../app-capabilities'
import type { AppContextProvider, AppContextRequest, AppContextSnapshot } from './types'
import { resolveContextCapabilities, getRequiredCapabilities } from './intent-router'

// ── Config ────────────────────────────────────────────────────────────────────

export type BrokerConfig = {
  /** Master switch — set to false to disable all app context injection */
  enabled: boolean
  /** Max total chars of app context in a single prompt */
  maxChars: number
  /** Per-capability overrides: false = never include */
  capabilityEnabled: Partial<Record<AppCapabilityId, boolean>>
  /** Whether a cloud model is active — disables privacy-sensitive capabilities */
  isCloudModel: boolean
}

const DEFAULT_CONFIG: BrokerConfig = {
  enabled: true,
  maxChars: 4000,
  capabilityEnabled: {
    weather: true,
    news: true,
    briefings: true,
    activity: true,
    knowledge: true,
    suggestions: true,
    routines: true,
    settings: true,
    voice: false,
    tools: false,
    leisure: true,
    system: false,
  },
  isCloudModel: false,
}

// ── Broker ────────────────────────────────────────────────────────────────────

export type BrokerDeps = {
  providers: AppContextProvider[]
  config?: Partial<BrokerConfig>
}

export function createAppContextBroker(deps: BrokerDeps) {
  const config: BrokerConfig = { ...DEFAULT_CONFIG, ...deps.config }
  const providerMap = new Map<AppCapabilityId, AppContextProvider>(
    deps.providers.map((p) => [p.capability, p]),
  )

  return {
    getConfig(): BrokerConfig {
      return { ...config }
    },

    updateConfig(patch: Partial<BrokerConfig>): void {
      Object.assign(config, patch)
    },

    /**
     * Build an AppContextSnapshot for the given user input and classified intent.
     *
     * @param classifiedIntent - output of ROUTE_CLASSIFY_V1
     * @param userInput - raw user message
     * @param overrideCapabilities - caller can force specific capabilities (e.g. briefing path)
     */
    async buildSnapshot(opts: {
      classifiedIntent: string
      userInput: string
      overrideCapabilities?: AppCapabilityId[]
    }): Promise<AppContextSnapshot> {
      const { classifiedIntent, userInput, overrideCapabilities } = opts

      if (!config.enabled) {
        return emptySnapshot([])
      }

      // Resolve which capabilities to request
      const { capabilities: routedCapabilities, resolvedIntent } = resolveContextCapabilities(
        classifiedIntent,
        userInput,
      )

      const requestedCapabilities: AppCapabilityId[] = dedupe([
        ...(overrideCapabilities ?? routedCapabilities),
      ])

      // Filter by per-capability config and cloud model restrictions
      const allowedCapabilities = requestedCapabilities
        .filter((capId) => {
          const capEnabled = config.capabilityEnabled[capId]
          if (capEnabled === false) return false

          if (config.isCloudModel) {
            const def = getCapabilityDef(capId)
            if (def && !def.cloudAllowed) return false
          }

          return true
        })
        .sort((a, b) => {
          // Required capabilities for the resolved intent get budget priority over optional ones
          const required = getRequiredCapabilities(resolvedIntent)
          const aRequired = required.includes(a) ? 0 : 1
          const bRequired = required.includes(b) ? 0 : 1
          return aRequired - bRequired
        })

      const hadCloudRestrictions =
        config.isCloudModel && allowedCapabilities.length < requestedCapabilities.length

      // Build context request
      const request: AppContextRequest = {
        intent: resolvedIntent,
        userInput,
        requestedCapabilities: allowedCapabilities,
        maxChars: config.maxChars,
        isCloudModel: config.isCloudModel,
      }

      // Run providers concurrently — failures in one don't block others
      const providerResults = await Promise.allSettled(
        allowedCapabilities
          .filter((capId) => {
            const provider = providerMap.get(capId)
            return provider?.canHandle(request) ?? false
          })
          .map(async (capId) => {
            const provider = providerMap.get(capId)
            return provider?.getContext(request)
          }),
      )

      // Collect results
      const capabilitiesIncluded: AppCapabilityId[] = []
      const freshness: AppContextSnapshot['freshness'] = {}
      const records: AppContextSnapshot['records'] = {}
      const allWarnings: string[] = []
      const suggestedRefreshActions: string[] = []
      const promptParts: string[] = []
      let totalChars = 0

      for (const settled of providerResults) {
        if (settled.status === 'rejected') {
          allWarnings.push(`Provider error: ${String(settled.reason)}`)
          continue
        }

        const result = settled.value
        const def = getCapabilityDef(result.capability)
        const maxForCap = def?.maxContextChars ?? 800

        if (result.charCount === 0 || !result.promptText) {
          // Capability responded but had no data
          freshness[result.capability] = { status: result.freshness }
          allWarnings.push(...result.warnings)
          if (result.suggestedRefreshAction) {
            suggestedRefreshActions.push(result.suggestedRefreshAction)
          }
          continue
        }

        // Enforce per-capability and total budget
        if (totalChars + Math.min(result.charCount, maxForCap) > config.maxChars) {
          allWarnings.push(`${result.capability} context omitted — prompt budget exhausted.`)
          continue
        }

        const truncatedText =
          result.promptText.length > maxForCap
            ? result.promptText.slice(0, maxForCap) + '\n…(truncated)'
            : result.promptText

        capabilitiesIncluded.push(result.capability)
        freshness[result.capability] = {
          status: result.freshness,
          ...(result.dataTimestamp !== undefined ? { updatedAt: result.dataTimestamp } : {}),
        }
        records[result.capability] = result
        allWarnings.push(...result.warnings)
        if (result.suggestedRefreshAction) {
          suggestedRefreshActions.push(result.suggestedRefreshAction)
        }
        promptParts.push(truncatedText)
        totalChars += truncatedText.length
      }

      const promptContext = buildPromptContextSection(promptParts, allWarnings)

      return {
        capabilitiesConsidered: allowedCapabilities,
        capabilitiesIncluded,
        freshness,
        records,
        warnings: allWarnings,
        suggestedRefreshActions: dedupe(suggestedRefreshActions),
        promptContext,
        totalChars: promptContext.length,
        hadCloudRestrictions,
      }
    },
  }
}

export type AppContextBroker = ReturnType<typeof createAppContextBroker>

// ── Prompt section builder ────────────────────────────────────────────────────

function buildPromptContextSection(parts: string[], warnings: string[]): string {
  if (parts.length === 0) return ''

  const noteLines = warnings
    .filter(
      (w) =>
        w.includes('stale') ||
        w.includes('Refresh') ||
        w.includes('missing') ||
        w.includes('excluded'),
    )
    .slice(0, 3)
    .map((w) => `⚠ ${w}`)

  return [
    '## Auralith App Context',
    'The following data comes from Auralith local app modules. Treat it as the source of truth.',
    'If a section is absent, do not claim to have checked that module.',
    '',
    ...parts,
    ...(noteLines.length > 0 ? ['', ...noteLines] : []),
  ].join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptySnapshot(considered: AppCapabilityId[]): AppContextSnapshot {
  return {
    capabilitiesConsidered: considered,
    capabilitiesIncluded: [],
    freshness: {},
    records: {},
    warnings: ['App context disabled.'],
    suggestedRefreshActions: [],
    promptContext: '',
    totalChars: 0,
    hadCloudRestrictions: false,
  }
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}
