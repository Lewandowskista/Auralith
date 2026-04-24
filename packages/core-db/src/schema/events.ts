import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { spaces } from './spaces'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  summary: text('summary'),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
  kind: text('kind', {
    enum: [
      'file.create',
      'file.edit',
      'file.move',
      'file.rename',
      'file.delete',
      'file.download',
      'assistant.action',
      'app.focus',
    ],
  }).notNull(),
  source: text('source', { enum: ['watcher', 'assistant', 'user', 'signal'] }).notNull(),
  path: text('path').notNull(),
  prevPath: text('prev_path'),
  spaceId: text('space_id').references(() => spaces.id, { onDelete: 'set null' }),
  actor: text('actor').notNull().default('system'),
  payloadJson: text('payload_json').notNull().default('{}'),
  sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
})
