import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const weatherCache = sqliteTable('weather_cache', {
  locationKey: text('location_key').primaryKey(),
  lat: text('lat').notNull(),
  lon: text('lon').notNull(),
  payloadJson: text('payload_json').notNull(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
})

export const suggestions = sqliteTable('suggestions', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  proposedActionJson: text('proposed_action_json').notNull(),
  tier: text('tier', { enum: ['safe', 'confirm', 'restricted'] }).notNull(),
  status: text('status', {
    enum: ['open', 'accepted', 'dismissed', 'snoozed', 'expired'],
  })
    .notNull()
    .default('open'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
})

export const toolInvocations = sqliteTable('tool_invocations', {
  id: text('id').primaryKey(),
  ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
  toolId: text('tool_id').notNull(),
  paramsJson: text('params_json').notNull(),
  tier: text('tier', { enum: ['safe', 'confirm', 'restricted'] }).notNull(),
  outcome: text('outcome', { enum: ['success', 'failure', 'cancelled'] }).notNull(),
  error: text('error'),
  actor: text('actor', { enum: ['user', 'suggestion', 'scheduler'] }).notNull(),
  traceId: text('trace_id').notNull(),
})

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
  kind: text('kind').notNull(),
  actor: text('actor').notNull(),
  subject: text('subject').notNull(),
  metaJson: text('meta_json').notNull().default('{}'),
})

export const permissionGrants = sqliteTable('permission_grants', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull().unique(),
  grantedAt: integer('granted_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const promptsCache = sqliteTable('prompts_cache', {
  hash: text('hash').primaryKey(),
  model: text('model').notNull(),
  prompt: text('prompt').notNull(),
  completion: text('completion').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  ttl: integer('ttl').notNull(),
})

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }).notNull(),
  lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
  lastStatus: text('last_status', { enum: ['success', 'failure', 'running', 'pending'] })
    .notNull()
    .default('pending'),
  backoff: integer('backoff').notNull().default(0),
  configJson: text('config_json').notNull().default('{}'),
})

// M11: per-kind learned weights (EMA of accept/dismiss ratio, clamped ±0.5)
export const suggestionWeights = sqliteTable('suggestion_weights', {
  kind: text('kind').primaryKey(),
  weight: integer('weight', { mode: 'number' }).notNull().default(0),
  sampleCount: integer('sample_count').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// M11: imported calendar events from a local ICS file
export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(),
  startAt: integer('start_at', { mode: 'timestamp_ms' }).notNull(),
  endAt: integer('end_at', { mode: 'timestamp_ms' }).notNull(),
  title: text('title').notNull(),
  location: text('location'),
  description: text('description'),
})

// M11: per-kind cooldown pauses (3 consecutive dismissals in 48h → 24h suppression)
export const suggestionPauses = sqliteTable('suggestion_pauses', {
  kind: text('kind').primaryKey(),
  pausedUntil: integer('paused_until', { mode: 'timestamp_ms' }).notNull(),
  reason: text('reason').notNull().default('consecutive_dismissals'),
})

// M12: rolling 30-day crash/error stats — never transmitted, surfaced in Settings → Privacy
export const crashStats = sqliteTable('crash_stats', {
  id: text('id').primaryKey(),
  ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
  level: text('level', { enum: ['crash', 'error'] }).notNull(),
  module: text('module').notNull(),
  message: text('message').notNull(),
})

// M15b: opt-in clipboard history
export const clipboardHistory = sqliteTable('clipboard_history', {
  id: text('id').primaryKey(),
  ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
  kind: text('kind', { enum: ['text', 'image', 'file'] }).notNull(),
  textValue: text('text_value'),
  charCount: integer('char_count'),
  redacted: integer('redacted', { mode: 'boolean' }).notNull().default(false),
  sessionId: text('session_id'),
})

// M15b: opt-in app usage sessions (privacy-bucketed, no titles or URLs)
export const appUsageSessions = sqliteTable('app_usage_sessions', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  bucket: text('bucket', {
    enum: ['ide', 'browser', 'explorer', 'media', 'productivity', 'other'],
  }).notNull(),
  processName: text('process_name').notNull(),
  durationMs: integer('duration_ms'),
})
