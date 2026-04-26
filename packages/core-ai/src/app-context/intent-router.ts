/**
 * Intent-to-Context Router
 *
 * Maps a classified intent string to a set of AppCapabilityIds that should
 * be fetched for that request. The broker uses this to call the right providers
 * without dumping all app data into every prompt.
 */

import type { AppCapabilityId } from '../app-capabilities'

export type IntentContextMap = {
  /** Minimum capabilities always fetched for this intent */
  required: AppCapabilityId[]
  /** Optional capabilities included if available and within budget */
  optional: AppCapabilityId[]
}

// ── Routing table ─────────────────────────────────────────────────────────────

const INTENT_CONTEXT_MAP: Record<string, IntentContextMap> = {
  // ROUTE_CLASSIFY_V1 intents
  chat: {
    required: [],
    optional: ['suggestions'],
  },
  tool: {
    required: [],
    optional: ['tools', 'settings'],
  },
  news: {
    required: ['news'],
    optional: ['suggestions'],
  },
  rag: {
    required: ['knowledge'],
    optional: [],
  },
  coding: {
    required: [],
    optional: [],
  },
  routine: {
    required: ['routines'],
    optional: ['settings'],
  },
  settings: {
    required: ['settings'],
    optional: [],
  },
  unknown: {
    required: [],
    optional: ['suggestions'],
  },

  // Extended intents (from message content analysis)
  weather: {
    required: ['weather'],
    optional: [],
  },
  briefing: {
    required: ['weather', 'news'],
    optional: ['suggestions', 'routines'],
  },
  activity: {
    required: ['activity'],
    optional: ['suggestions'],
  },
  leisure: {
    required: ['suggestions'],
    optional: ['news', 'weather'],
  },
  system: {
    required: ['system'],
    optional: ['settings'],
  },
}

// ── Keyword patterns for extended intent detection ─────────────────────────────

type KeywordRule = {
  patterns: RegExp[]
  intent: string
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    patterns: [
      /\b(weather|temperature|forecast|rain|snow|wind|humidity|umbrella|coat|sunny|cloudy|storm|celsius|fahrenheit)\b/i,
    ],
    intent: 'weather',
  },
  {
    patterns: [
      /\b(briefing|brief me|morning brief|daily brief|daily update|today['']?s update)\b/i,
    ],
    intent: 'briefing',
  },
  {
    patterns: [/\b(news|headlines|articles|feeds|clusters|what['']?s new|what happened|latest)\b/i],
    intent: 'news',
  },
  {
    patterns: [
      /\b(working on|was i doing|activity|timeline|recent files|file events|session recap|what did i do|work history|worked on)\b/i,
    ],
    intent: 'activity',
  },
  {
    patterns: [/\b(documents|knowledge|my notes|search my|find in|look in|brain|spaces|rag)\b/i],
    intent: 'rag',
  },
  {
    patterns: [/\b(routine|automation|trigger|when i|automate|workflow)\b/i],
    intent: 'routine',
  },
  {
    patterns: [/\b(suggestion|suggest|proactive|idea|reminder|resurface)\b/i],
    intent: 'chat', // maps to chat + suggestions optional
  },
  {
    patterns: [/\b(weekend|leisure|hobby|relax|reading|free time)\b/i],
    intent: 'leisure',
  },
]

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Given a classified intent and the raw user input, return the recommended
 * capabilities to include in the app context snapshot.
 *
 * The extended intent may override the classified intent when the user input
 * contains strong domain-specific keywords.
 */
export function resolveContextCapabilities(
  classifiedIntent: string,
  userInput: string,
): { capabilities: AppCapabilityId[]; resolvedIntent: string } {
  // Detect extended intent from keywords — takes precedence over generic chat/tool/unknown
  let resolvedIntent = classifiedIntent
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((re) => re.test(userInput))) {
      // Only override generic intents — don't override specific domain intents
      if (['chat', 'tool', 'unknown', 'settings'].includes(classifiedIntent)) {
        resolvedIntent = rule.intent
      } else if (classifiedIntent === 'news' && rule.intent === 'briefing') {
        resolvedIntent = 'briefing'
      }
      break
    }
  }

  const map = INTENT_CONTEXT_MAP[resolvedIntent] ??
    INTENT_CONTEXT_MAP['chat'] ?? { required: [], optional: [] }
  const capabilities = dedupe([...map.required, ...map.optional])

  return { capabilities, resolvedIntent }
}

/**
 * Get only the required (non-optional) capabilities for an intent.
 * Used when prompt budget is very tight.
 */
export function getRequiredCapabilities(intent: string): AppCapabilityId[] {
  const map = INTENT_CONTEXT_MAP[intent]
  return map?.required ?? []
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}
