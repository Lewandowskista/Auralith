import type { SuggestionsRepo, EventsRepo, SettingsRepo } from '@auralith/core-db'
import type { SuggestionCandidate, GeneratorContext } from './types'

const TTL_24H = 24 * 60 * 60 * 1000
const TTL_4H = 4 * 60 * 60 * 1000
const TTL_1H = 60 * 60 * 1000

const HOBBY_TOPICS = [
  'Try a new recipe today',
  "Watch a documentary you've been putting off",
  'Pick up a book you started but never finished',
  "Take a walk somewhere you haven't been before",
  'Listen to an album start to finish',
  'Sketch something you see around you',
  'Write a few thoughts in a journal',
  "Play a game you haven't touched in a while",
  "Learn one small thing you've been curious about",
  'Tidy one small space and make it feel nice',
]

function isWeekend(now: Date): boolean {
  const day = now.getDay()
  return day === 0 || day === 6
}

function isWeekendModeOn(settingsRepo: SettingsRepo, now: Date): boolean {
  const all = settingsRepo.getAll()
  const mode = all['leisure.weekendMode']
  if (mode === 'always') return true
  if (mode === 'off') return false
  // default: 'auto' — detect by day-of-week
  return isWeekend(now)
}

// DownloadsCleanup — fires when Downloads has 5+ events older than 3 days
export async function generateDownloadsCleanup(
  eventsRepo: EventsRepo,
  suggestionsRepo: SuggestionsRepo,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (suggestionsRepo.hasOpenOfKind('downloads.cleanup')) return []

  const threeDaysAgo = new Date(ctx.now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const downloadEvents = eventsRepo.queryEvents({
    kind: 'file.download',
    before: threeDaysAgo,
    limit: 50,
  })
  const createEvents = eventsRepo.queryEvents({
    kind: 'file.create',
    before: threeDaysAgo,
    limit: 100,
  })
  const downloadsCreates = createEvents.filter((e) => {
    const p = e.path.toLowerCase().replace(/\\/g, '/')
    return p.includes('/downloads/')
  })

  const total = downloadEvents.length + downloadsCreates.length
  if (total < 5) return []

  return [
    {
      kind: 'downloads.cleanup',
      title: `Organize ${total} stale files in Downloads`,
      rationale: `You have ${total} files in Downloads that haven't been touched in 3+ days. Would you like to sort them into folders?`,
      proposedAction: { toolId: 'files.organizeDownloads', params: { olderThanDays: 3 } },
      tier: 'confirm',
      ttlMs: TTL_24H,
    },
  ]
}

// SessionRecap — fires when a session closed < 1h ago
export async function generateSessionRecap(
  eventsRepo: EventsRepo,
  suggestionsRepo: SuggestionsRepo,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (suggestionsRepo.hasOpenOfKind('session.recap')) return []

  const sessions = eventsRepo.listSessions({ limit: 5 })
  const recentClosed = sessions.find((s) => {
    if (s.endedAt === undefined) return false
    const age = ctx.now.getTime() - s.endedAt
    return age > 0 && age <= TTL_1H
  })

  if (!recentClosed) return []

  return [
    {
      kind: 'session.recap',
      title: 'Create a recap note for your last session',
      rationale:
        'You just finished a work session. Would you like to save a recap note based on your recent file activity?',
      proposedAction: { toolId: 'notes.createFromSession', params: { sessionId: recentClosed.id } },
      tier: 'confirm',
      ttlMs: TTL_1H,
    },
  ]
}

// ResumeWork — fires when user has been idle > 20 min after an active session
export async function generateResumeWork(
  eventsRepo: EventsRepo,
  suggestionsRepo: SuggestionsRepo,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (suggestionsRepo.hasOpenOfKind('work.resume')) return []

  const twentyMinAgo = new Date(ctx.now.getTime() - 20 * 60 * 1000)
  const recentEvents = eventsRepo.queryEvents({ after: twentyMinAgo, limit: 1 })
  if (recentEvents.length > 0) return [] // not idle

  // Look for a session that ended 20–90 min ago
  const sessions = eventsRepo.listSessions({ limit: 5 })
  const recentSession = sessions.find((s) => {
    if (s.endedAt === undefined) return false
    const age = ctx.now.getTime() - s.endedAt
    return age >= 20 * 60 * 1000 && age <= 90 * 60 * 1000
  })
  if (!recentSession) return []

  const sessionEvents = eventsRepo.queryEvents({ sessionId: recentSession.id, limit: 3 })
  const filePaths = sessionEvents.map((e) => e.path).filter(Boolean)
  if (filePaths.length === 0) return []

  const minsAgo =
    recentSession.endedAt !== undefined
      ? Math.round((ctx.now.getTime() - recentSession.endedAt) / 60000)
      : 0

  return [
    {
      kind: 'work.resume',
      title: 'Resume where you left off',
      rationale: `You were active ${minsAgo} min ago. Open your recent files to get back up to speed.`,
      proposedAction: {
        toolId: 'files.openRecent',
        params: { paths: filePaths, sessionId: recentSession.id },
      },
      tier: 'safe',
      ttlMs: TTL_4H,
    },
  ]
}

// NewsDigest — fires when there are 3+ unread news clusters
export async function generateNewsDigest(
  suggestionsRepo: SuggestionsRepo,
  getUnreadClusterCount: () => number,
  _ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (suggestionsRepo.hasOpenOfKind('news.digest')) return []

  const unread = getUnreadClusterCount()
  if (unread < 3) return []

  return [
    {
      kind: 'news.digest',
      title: `${unread} new story clusters in your news feed`,
      rationale: `You have ${unread} new story groups across your news topics. Ready for a quick digest?`,
      proposedAction: { toolId: 'news.openDigest', params: {} },
      tier: 'safe',
      ttlMs: TTL_4H,
    },
  ]
}

// WeatherAlert — fires when watch or warning is active
export async function generateWeatherAlert(
  suggestionsRepo: SuggestionsRepo,
  getAlertLevel: () => 'none' | 'watch' | 'warning',
  getWeatherSummary: () => string,
  _ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (suggestionsRepo.hasOpenOfKind('weather.alert')) return []

  const level = getAlertLevel()
  if (level === 'none') return []

  return [
    {
      kind: 'weather.alert',
      title: level === 'warning' ? '⚠ Severe weather alert' : 'Weather watch in effect',
      rationale: getWeatherSummary(),
      proposedAction: { toolId: 'weather.openScreen', params: {} },
      tier: 'safe',
      ttlMs: TTL_4H,
    },
  ]
}

// MorningBrief — fires between 06:00–10:00 if not yet shown today
export async function generateMorningBrief(
  suggestionsRepo: SuggestionsRepo,
  settingsRepo: SettingsRepo,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  const h = ctx.now.getHours()
  if (h < 6 || h > 10) return []
  if (suggestionsRepo.hasOpenOfKind('morning.brief')) return []

  const today = ctx.now.toISOString().slice(0, 10)
  // Use getAll() to avoid zod version mismatch between packages
  const all = settingsRepo.getAll()
  const lastBriefDay =
    typeof all['briefing.lastShownDate'] === 'string' ? all['briefing.lastShownDate'] : undefined
  if (lastBriefDay === today) return []

  return [
    {
      kind: 'morning.brief',
      title: 'Your morning briefing is ready',
      rationale: 'Start your day with a quick overview of news, weather, and recent activity.',
      proposedAction: { toolId: 'briefing.show', params: {} },
      tier: 'safe',
      ttlMs: TTL_4H,
    },
  ]
}

// WeekendBriefing — fires Sat/Sun 08:00–11:00 in place of the weekday morning brief
export async function generateWeekendBriefing(
  suggestionsRepo: SuggestionsRepo,
  settingsRepo: SettingsRepo,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (!isWeekendModeOn(settingsRepo, ctx.now)) return []
  const h = ctx.now.getHours()
  if (h < 8 || h > 11) return []
  if (suggestionsRepo.hasOpenOfKind('leisure.weekend-brief')) return []

  const today = ctx.now.toISOString().slice(0, 10)
  const all = settingsRepo.getAll()
  const lastBriefDay =
    typeof all['briefing.lastShownDate'] === 'string' ? all['briefing.lastShownDate'] : undefined
  if (lastBriefDay === today) return []

  const dayName = ctx.now.toLocaleDateString([], { weekday: 'long' })

  return [
    {
      kind: 'leisure.weekend-brief',
      title: `${dayName} morning — your lighter briefing`,
      rationale:
        'Catch up on what matters at your own pace. No tasks, no deadlines — just the good stuff.',
      proposedAction: { toolId: 'briefing.show', params: { tone: 'leisure' } },
      tier: 'safe',
      ttlMs: TTL_4H,
    },
  ]
}

// ReadingResurface — surfaces saved news items older than 7 days that haven't been re-read
export async function generateReadingResurface(
  suggestionsRepo: SuggestionsRepo,
  settingsRepo: SettingsRepo,
  getSavedOldItemCount: () => number,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (!isWeekendModeOn(settingsRepo, ctx.now)) return []
  if (suggestionsRepo.hasOpenOfKind('leisure.reading-resurfaced')) return []

  const count = getSavedOldItemCount()
  if (count === 0) return []

  return [
    {
      kind: 'leisure.reading-resurfaced',
      title: `${count} saved ${count === 1 ? 'article' : 'articles'} you haven't revisited`,
      rationale: 'You bookmarked these more than a week ago. A good time to catch up.',
      proposedAction: { toolId: 'news.openSaved', params: {} },
      tier: 'safe',
      ttlMs: TTL_24H,
    },
  ]
}

// HobbyIdea — surfaces a random leisure nudge on weekends
export async function generateHobbyIdea(
  suggestionsRepo: SuggestionsRepo,
  settingsRepo: SettingsRepo,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (!isWeekendModeOn(settingsRepo, ctx.now)) return []
  // Only in the afternoon window — less intrusive than morning
  const h = ctx.now.getHours()
  if (h < 13 || h > 18) return []
  if (suggestionsRepo.hasOpenOfKind('leisure.hobby-idea')) return []

  const all = settingsRepo.getAll()
  const today = ctx.now.toISOString().slice(0, 10)
  const lastHobbyDay =
    typeof all['leisure.lastHobbyDay'] === 'string' ? all['leisure.lastHobbyDay'] : undefined
  if (lastHobbyDay === today) return []

  const idx = ctx.now.getDate() % HOBBY_TOPICS.length
  const idea = HOBBY_TOPICS[idx] ?? HOBBY_TOPICS[0]

  // Record today so this generator fires at most once per day
  settingsRepo.set('leisure.lastHobbyDay', today)

  return [
    {
      kind: 'leisure.hobby-idea',
      title: idea ?? '',
      rationale: 'A small nudge for your free time — no pressure.',
      proposedAction: { toolId: 'leisure.dismissIdea', params: { idea } },
      tier: 'safe',
      ttlMs: TTL_4H,
    },
  ]
}

// CalendarPrep — fires when next calendar event is within 45 min
export async function generateCalendarPrep(
  suggestionsRepo: SuggestionsRepo,
  getNextCalendarEvent: (
    withinMs: number,
  ) => { title: string; startAt: Date; location?: string } | null,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (suggestionsRepo.hasOpenOfKind('calendar.prep')) return []

  const LOOKAHEAD_MS = 45 * 60 * 1000
  const event = getNextCalendarEvent(LOOKAHEAD_MS)
  if (!event) return []

  const minsUntil = Math.round((event.startAt.getTime() - ctx.now.getTime()) / 60_000)
  const timeStr = event.startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const locationNote = event.location ? ` at ${event.location}` : ''

  return [
    {
      kind: 'calendar.prep',
      title: `"${event.title}" in ${minsUntil} min`,
      rationale: `Your event starts at ${timeStr}${locationNote}. Take a moment to prepare.`,
      proposedAction: {
        toolId: 'briefing.showEventPrep',
        params: { title: event.title, startAt: event.startAt.toISOString() },
      },
      tier: 'confirm',
      ttlMs: LOOKAHEAD_MS,
    },
  ]
}

// FocusAlignedResume — fires when IDE/explorer is foregrounded after 20–90 min idle
export async function generateFocusAlignedResume(
  eventsRepo: EventsRepo,
  suggestionsRepo: SuggestionsRepo,
  getIdleMs: () => number,
  getFocusAppBucket: () => string | null,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  if (suggestionsRepo.hasOpenOfKind('focus.resume')) return []

  const idleMs = getIdleMs()
  const MIN_IDLE_MS = 20 * 60 * 1000
  const MAX_IDLE_MS = 90 * 60 * 1000
  if (idleMs < MIN_IDLE_MS || idleMs > MAX_IDLE_MS) return []

  const focusBucket = getFocusAppBucket()
  if (focusBucket !== 'ide' && focusBucket !== 'explorer') return []

  // Find a recent session to resume
  const sessions = eventsRepo.listSessions({ limit: 3 })
  const recentSession = sessions.find((s) => {
    if (s.endedAt === undefined) return false
    const age = ctx.now.getTime() - s.endedAt
    return age >= MIN_IDLE_MS && age <= MAX_IDLE_MS
  })
  if (!recentSession) return []

  const sessionEvents = eventsRepo.queryEvents({ sessionId: recentSession.id, limit: 3 })
  const filePaths = sessionEvents.map((e) => e.path).filter(Boolean)
  if (filePaths.length === 0) return []

  const bucketLabel = focusBucket === 'ide' ? 'code editor' : 'file explorer'
  const minsAgo =
    recentSession.endedAt !== undefined
      ? Math.round((ctx.now.getTime() - recentSession.endedAt) / 60_000)
      : 0

  return [
    {
      kind: 'focus.resume',
      title: 'Pick up where you left off',
      rationale: `You were working ${minsAgo} min ago and your ${bucketLabel} is open. Resume your last session?`,
      proposedAction: {
        toolId: 'files.openRecent',
        params: { paths: filePaths, sessionId: recentSession.id },
      },
      tier: 'confirm',
      ttlMs: TTL_4H,
    },
  ]
}

// EndOfDayRecap — fires 17:00–20:00 if there was activity today
export async function generateEndOfDayRecap(
  eventsRepo: EventsRepo,
  suggestionsRepo: SuggestionsRepo,
  ctx: GeneratorContext,
): Promise<SuggestionCandidate[]> {
  const h = ctx.now.getHours()
  if (h < 17 || h > 20) return []
  if (suggestionsRepo.hasOpenOfKind('eod.recap')) return []

  const startOfDay = new Date(ctx.now)
  startOfDay.setHours(0, 0, 0, 0)

  const todayEvents = eventsRepo.queryEvents({ after: startOfDay, limit: 200 })
  if (todayEvents.length < 5) return []

  const sessionIds = new Set(
    todayEvents.map((e) => e.sessionId).filter((s): s is string => s !== undefined),
  )

  return [
    {
      kind: 'eod.recap',
      title: 'End-of-day recap',
      rationale: `You had ${todayEvents.length} file events across ${sessionIds.size} session${sessionIds.size !== 1 ? 's' : ''} today. Review and save a summary?`,
      proposedAction: {
        toolId: 'briefing.showEod',
        params: { date: ctx.now.toISOString().slice(0, 10) },
      },
      tier: 'safe',
      ttlMs: TTL_4H,
    },
  ]
}
