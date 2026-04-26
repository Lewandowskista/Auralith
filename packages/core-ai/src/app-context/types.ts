/**
 * Shared types for the App Context system.
 *
 * The App Context Broker asks each AppContextProvider for relevant data,
 * then assembles an AppContextSnapshot that the turn-runner injects into
 * the model prompt.
 */

import type { AppCapabilityId } from '../app-capabilities'

// ── Provider contract ─────────────────────────────────────────────────────────

export type AppContextRequest = {
  /** Classified intent from the route classifier */
  intent: string
  /** Raw user input — used by some providers to scope retrieval */
  userInput: string
  /** Which capabilities were explicitly requested (from intent router) */
  requestedCapabilities: AppCapabilityId[]
  /** Max total characters allowed across all providers */
  maxChars: number
  /** Whether this is running in a cloud model context (restricts data sharing) */
  isCloudModel: boolean
}

export type FreshnessStatus = 'fresh' | 'stale' | 'missing' | 'error'

export type AppContextProviderResult = {
  capability: AppCapabilityId
  /** Compact prompt-ready text for this capability */
  promptText: string
  /** Approximate character count of promptText */
  charCount: number
  freshness: FreshnessStatus
  /** ISO timestamp of the underlying data, if known */
  dataTimestamp?: string | undefined
  /** Human-readable warnings (stale, partial, redacted) */
  warnings: string[]
  /** IPC action to call if data is stale or missing */
  suggestedRefreshAction?: string | undefined
  /** Source module for audit/debug */
  source: string
}

export interface AppContextProvider {
  capability: AppCapabilityId
  /** True if this provider can contribute data for the given request */
  canHandle(request: AppContextRequest): boolean
  /** Fetch and format context for the given request */
  getContext(request: AppContextRequest): Promise<AppContextProviderResult>
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export type FreshnessRecord = {
  status: FreshnessStatus
  updatedAt?: string | undefined
}

export type AppContextSnapshot = {
  /** Capabilities evaluated by the broker */
  capabilitiesConsidered: AppCapabilityId[]
  /** Capabilities that actually provided data */
  capabilitiesIncluded: AppCapabilityId[]
  /** Per-capability freshness metadata */
  freshness: Partial<Record<AppCapabilityId, FreshnessRecord>>
  /** Raw data records per capability (for programmatic use) */
  records: Partial<Record<AppCapabilityId, AppContextProviderResult>>
  /** All warnings across providers */
  warnings: string[]
  /** Suggested refresh actions for stale/missing data */
  suggestedRefreshActions: string[]
  /** The combined prompt-ready context string to inject into system prompt */
  promptContext: string
  /** Total character count of promptContext */
  totalChars: number
  /** Whether any capability was excluded due to cloud model restrictions */
  hadCloudRestrictions: boolean
}
