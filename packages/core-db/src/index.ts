export { initDb, getDb, type DbClient, type DbBundle, type DbInitOptions } from './client'
export * from './schema'
export { createSettingsRepo, type SettingsRepo } from './repos/settings.repo'
export { createAuditRepo, type AuditRepo, type AuditEntry } from './repos/audit.repo'
export {
  createPermissionsRepo,
  type PermissionsRepo,
  type PermissionGrant,
} from './repos/permissions.repo'
export { createChunkVecRepo, type ChunkVecRepo } from './repos/chunk-vec.repo'
export {
  createEventsRepo,
  type EventsRepo,
  type EventRow,
  type SessionRow,
  type QueryEventsOpts,
  type ListSessionsOpts,
} from './repos/events.repo'
export {
  createSuggestionsRepo,
  type SuggestionsRepo,
  type SuggestionRow,
  type SuggestionStatus,
  type CreateSuggestionOpts,
} from './repos/suggestions.repo'
export {
  createRoutinesRepo,
  type RoutinesRepo,
  type RoutineRow,
  type RoutineRunRow,
  type RoutineStatus,
  type CreateRoutineOpts,
  type UpdateRoutineOpts,
} from './repos/routines.repo'
export {
  createSuggestionWeightsRepo,
  type SuggestionWeightsRepo,
  type SuggestionWeightRow,
} from './repos/suggestion-weights.repo'
export {
  createCalendarEventsRepo,
  type CalendarEventsRepo,
  type CalendarEventRow,
} from './repos/calendar-events.repo'
export {
  createSuggestionPausesRepo,
  type SuggestionPausesRepo,
  type SuggestionPauseRow,
} from './repos/suggestion-pauses.repo'
export {
  createCrashStatsRepo,
  type CrashStatsRepo,
  type CrashStatRow,
  type CrashStatLevel,
  type CrashStatSummary,
} from './repos/crash-stats.repo'
export { createClipboardRepo, type ClipboardRepo, type ClipboardRow } from './repos/clipboard.repo'
export {
  createAppUsageRepo,
  type AppUsageRepo,
  type AppUsageRow,
  type AppUsageBucket,
} from './repos/app-usage.repo'
export { eq, and, gte, lte, desc, count, isNull, inArray, lt } from 'drizzle-orm'
export { createPromptCacheRepo, type PromptCacheRepo } from './repos/prompt-cache.repo'
export {
  createObservabilityRepo,
  type ObservabilityRepo,
  type TraceRow,
  type ModelReliabilityRow,
  type RetrievalTraceRow,
  type TraceStat,
} from './repos/observability.repo'
