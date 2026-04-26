/**
 * App Capability Manifest
 *
 * Describes what Auralith can track, provide, and act on.
 * The AI uses this as its understanding of the app's first-party data domains.
 * The App Context Broker uses it to decide which providers to invoke.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AppCapabilityId =
  | 'weather'
  | 'news'
  | 'briefings'
  | 'activity'
  | 'knowledge'
  | 'files'
  | 'suggestions'
  | 'routines'
  | 'settings'
  | 'voice'
  | 'tools'
  | 'leisure'
  | 'system'

export type PrivacyLevel = 'low' | 'medium' | 'high'

export type AppCapabilityDef = {
  id: AppCapabilityId
  displayName: string
  description: string
  /** Which core-* package owns this data */
  sourceOfTruth: string
  /** Human-readable list of data fields/views this capability provides */
  dataAvailable: string[]
  /** Safe read-only IPC operations */
  readActions: string[]
  /** Write/mutating operations (require confirmation tier) */
  writeActions?: string[]
  /** After this many ms, data should be considered stale */
  staleAfterMs: number
  /** Whether it is safe to inject this data into model prompts without scrubbing */
  promptSafe: boolean
  /** Privacy sensitivity — determines redaction policy and cloud-sharing rules */
  privacyLevel: PrivacyLevel
  /** Maximum recommended characters of context to inject for this capability */
  maxContextChars: number
  /** Whether cloud models may receive this context (default false) */
  cloudAllowed: boolean
}

// ── Manifest ──────────────────────────────────────────────────────────────────

export const APP_CAPABILITY_MANIFEST: AppCapabilityDef[] = [
  {
    id: 'weather',
    displayName: 'Weather',
    description:
      'Local weather forecast and current conditions from the Auralith Weather module (Open-Meteo). Includes current temperature, WMO weather code, alert level, daily briefing text, and multi-day forecast.',
    sourceOfTruth: 'core-weather',
    dataAvailable: [
      'current conditions (temp, feels-like, wind, humidity, WMO code)',
      '24h hourly forecast',
      '7-day daily forecast',
      'daily weather briefing text',
      'alert level (none / watch / warning)',
      'configured location (city, lat/lon)',
    ],
    readActions: ['weather.getCurrent', 'weather.getForecast', 'weather.getBriefing'],
    writeActions: ['weather.setLocation', 'weather.setLocationByCity'],
    staleAfterMs: 60 * 60 * 1000, // 1 hour
    promptSafe: true,
    privacyLevel: 'low',
    maxContextChars: 800,
    cloudAllowed: false,
  },
  {
    id: 'news',
    displayName: 'News',
    description:
      'Personalized RSS feeds, topics, article clusters, unread items, saved items, summaries, and optional AI analysis from the Auralith News module.',
    sourceOfTruth: 'core-news',
    dataAvailable: [
      'configured topics',
      'enabled feeds per topic',
      'article clusters with labels and summaries',
      'unread cluster count',
      'saved items',
      'per-topic digest and briefing',
      'topic AI analysis (opt-in)',
      'cluster importance ranking',
    ],
    readActions: ['news.listTopics', 'news.listClusters', 'news.listItems'],
    writeActions: ['news.markRead', 'news.saveItem', 'news.triggerFetch'],
    staleAfterMs: 30 * 60 * 1000, // 30 minutes
    promptSafe: true,
    privacyLevel: 'medium',
    maxContextChars: 1800,
    cloudAllowed: false,
  },
  {
    id: 'briefings',
    displayName: 'Briefings',
    description:
      'Daily morning and evening briefings that combine weather conditions, top news clusters, suggestions, and optional leisure mode content.',
    sourceOfTruth: 'core-ai (briefing-job)',
    dataAvailable: [
      'last generated briefing',
      'weather summary included',
      'top news clusters included',
      'briefing tone (default / leisure)',
      'generated timestamp',
    ],
    readActions: ['briefing.getLastBriefing'],
    writeActions: ['briefing.triggerNow'],
    staleAfterMs: 8 * 60 * 60 * 1000, // 8 hours
    promptSafe: true,
    privacyLevel: 'low',
    maxContextChars: 1200,
    cloudAllowed: false,
  },
  {
    id: 'activity',
    displayName: 'Activity',
    description:
      'Local desktop activity timeline: file events (create, edit, move, rename, delete, download), app focus sessions, and assistant-triggered actions. Grouped into work sessions.',
    sourceOfTruth: 'core-events + core-db events table',
    dataAvailable: [
      'recent file activity events',
      'work sessions (grouped)',
      'active / idle state',
      'event kinds: file.create, file.edit, file.move, file.rename, file.delete, file.download, assistant.action, app.focus',
      'watched folder paths (sanitized)',
    ],
    readActions: ['activity.query', 'activity.listSessions', 'activity.getSession'],
    writeActions: ['activity.setWatchedFolders', 'activity.setRetention'],
    staleAfterMs: 5 * 60 * 1000, // 5 minutes
    promptSafe: false, // paths must be sanitized before injection
    privacyLevel: 'high',
    maxContextChars: 1000,
    cloudAllowed: false,
  },
  {
    id: 'knowledge',
    displayName: 'Knowledge',
    description:
      'Local knowledge spaces with indexed documents (Markdown, PDF, DOCX, etc.) and hybrid FTS + vector retrieval with citation support.',
    sourceOfTruth: 'core-retrieval + core-db (chunks, docs, spaces)',
    dataAvailable: [
      'knowledge spaces list',
      'indexed document list per space',
      'hybrid search results (chunk id, title, score, snippet)',
      'citation-ready context chunks',
      'last indexed timestamp',
    ],
    readActions: ['brain.search', 'brain.listSpaces', 'brain.listDocs', 'brain.getChunk'],
    writeActions: ['brain.reindex', 'brain.createSpace', 'brain.deleteSpace'],
    staleAfterMs: 15 * 60 * 1000, // 15 minutes
    promptSafe: false, // document content must be treated as untrusted
    privacyLevel: 'high',
    maxContextChars: 3000,
    cloudAllowed: false,
  },
  {
    id: 'suggestions',
    displayName: 'Suggestions',
    description:
      'Proactive AI-generated suggestions from the Auralith Suggestion Engine: session recaps, morning briefs, weather alerts, news digests, reading resurface, and more.',
    sourceOfTruth: 'core-suggest',
    dataAvailable: [
      'open suggestions (status: open)',
      'suggestion kind and rationale',
      'related signal strength (e.g. unread news count, weather alert level)',
      'suggestion action payload',
    ],
    readActions: ['suggest.list'],
    writeActions: ['suggest.accept', 'suggest.dismiss', 'suggest.snooze'],
    staleAfterMs: 10 * 60 * 1000, // 10 minutes
    promptSafe: true,
    privacyLevel: 'medium',
    maxContextChars: 600,
    cloudAllowed: false,
  },
  {
    id: 'routines',
    displayName: 'Routines',
    description:
      'Local automation routines with event-based triggers, conditions, and action steps. Supports dry-run previews and run history.',
    sourceOfTruth: 'core-routines',
    dataAvailable: [
      'routine list (name, trigger, enabled status)',
      'recent run history per routine',
      'dry-run preview output',
      'trigger types: file, app, schedule, webhook',
    ],
    readActions: ['routines.list', 'routines.get', 'routines.history', 'routines.dryRun'],
    writeActions: [
      'routines.create',
      'routines.update',
      'routines.delete',
      'routines.run',
      'routines.enable',
      'routines.disable',
    ],
    staleAfterMs: 60 * 60 * 1000, // 1 hour
    promptSafe: true,
    privacyLevel: 'medium',
    maxContextChars: 800,
    cloudAllowed: false,
  },
  {
    id: 'settings',
    displayName: 'Settings',
    description:
      'Safe summaries of Auralith configuration: enabled features, privacy controls, watched folders, retention policies, and feature status.',
    sourceOfTruth: 'core-db settings table',
    dataAvailable: [
      'enabled features',
      'privacy settings (redact, clipboard opt-in, activity tracking)',
      'weather location label',
      'assistant persona override',
      'briefing schedule',
      'leisure mode',
    ],
    readActions: ['settings.get', 'settings.getAll'],
    writeActions: ['settings.set'],
    staleAfterMs: 5 * 60 * 1000,
    promptSafe: true,
    privacyLevel: 'medium',
    maxContextChars: 400,
    cloudAllowed: false,
  },
  {
    id: 'voice',
    displayName: 'Voice',
    description:
      'Voice input (STT via Whisper) and output (TTS) state, configured voices, push-to-talk binding, and model download status.',
    sourceOfTruth: 'core-ai (voice handlers)',
    dataAvailable: [
      'voice enabled / disabled',
      'STT model and status',
      'TTS voice and status',
      'push-to-talk key binding',
      'voice capture state',
    ],
    readActions: ['voice.getStatus', 'voice.getSettings'],
    writeActions: ['voice.setEnabled', 'voice.setSettings', 'voice.setPttBinding'],
    staleAfterMs: 60 * 60 * 1000,
    promptSafe: true,
    privacyLevel: 'low',
    maxContextChars: 300,
    cloudAllowed: false,
  },
  {
    id: 'tools',
    displayName: 'Tools',
    description:
      'Registered Auralith tool registry: available tool IDs, tiers (safe/confirm/restricted), and descriptions used by the AI agent.',
    sourceOfTruth: 'core-tools',
    dataAvailable: [
      'registered tool list',
      'tool tier (safe / confirm / restricted)',
      'tool descriptions',
      'sandbox roots for file tools',
    ],
    readActions: ['tools.list'],
    writeActions: ['tools.invoke'],
    staleAfterMs: 60 * 60 * 1000,
    promptSafe: true,
    privacyLevel: 'low',
    maxContextChars: 600,
    cloudAllowed: false,
  },
  {
    id: 'leisure',
    displayName: 'Leisure',
    description:
      'Weekend / leisure mode state, hobby suggestions, reading resurface, and relaxation-focused recommendations from the suggestion engine.',
    sourceOfTruth: 'core-suggest (leisure generators)',
    dataAvailable: [
      'leisure mode active / inactive',
      'hobby idea suggestions',
      'reading resurface suggestions',
      'weekend briefing',
    ],
    readActions: ['suggest.list'],
    staleAfterMs: 2 * 60 * 60 * 1000,
    promptSafe: true,
    privacyLevel: 'low',
    maxContextChars: 400,
    cloudAllowed: false,
  },
  {
    id: 'system',
    displayName: 'System',
    description:
      'Auralith app version, Ollama model status, data directory, and system-level information.',
    sourceOfTruth: 'core-ai (ollama-status), system handlers',
    dataAvailable: [
      'app version',
      'Ollama status (connected / error)',
      'active model list',
      'data directory path',
    ],
    readActions: [
      'system.getVersion',
      'ollama.ping',
      'ollama.listModels',
      'ollama.checkModelHealth',
    ],
    staleAfterMs: 5 * 60 * 1000,
    promptSafe: true,
    privacyLevel: 'low',
    maxContextChars: 200,
    cloudAllowed: false,
  },
]

// ── Lookup helpers ─────────────────────────────────────────────────────────────

const _byId = new Map<AppCapabilityId, AppCapabilityDef>(
  APP_CAPABILITY_MANIFEST.map((c) => [c.id, c]),
)

export function getCapabilityDef(id: AppCapabilityId): AppCapabilityDef | undefined {
  return _byId.get(id)
}

export function getPromptSafeCapabilities(): AppCapabilityDef[] {
  return APP_CAPABILITY_MANIFEST.filter((c) => c.promptSafe)
}

export function getCloudAllowedCapabilities(): AppCapabilityDef[] {
  return APP_CAPABILITY_MANIFEST.filter((c) => c.cloudAllowed)
}

/**
 * Returns the compact identity blurb that goes at the top of every system prompt.
 * Kept intentionally short — the broker injects per-capability context separately.
 */
export function buildAppIdentityBlock(): string {
  const capNames = APP_CAPABILITY_MANIFEST.map((c) => c.displayName).join(', ')
  return [
    'You are Auralith, a local-first Windows desktop command center and personal AI assistant.',
    `You have access to app-provided context from Auralith modules: ${capNames}.`,
    'When the user asks about data Auralith tracks, use the provided ## Auralith App Context section as the source of truth.',
    'Do not invent app data. If app context is missing or stale, say so and offer the relevant refresh action.',
    'Never claim you checked a feature unless the corresponding app context or tool result is present in this conversation.',
    'For risky or destructive actions, ask for confirmation before proceeding.',
  ].join('\n')
}
