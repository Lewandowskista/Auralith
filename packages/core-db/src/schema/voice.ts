import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const voiceTranscripts = sqliteTable('voice_transcripts', {
  id: text('id').primaryKey(),
  ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  text: text('text').notNull(),
  routedTo: text('routed_to'),
  sessionId: text('session_id'),
})

export const voiceModels = sqliteTable('voice_models', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  installedAt: integer('installed_at', { mode: 'timestamp_ms' }).notNull(),
})
