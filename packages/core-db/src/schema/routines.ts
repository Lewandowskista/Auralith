import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  triggerJson: text('trigger_json').notNull(),
  conditionsJson: text('conditions_json').notNull().default('[]'),
  actionJson: text('action_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
  lastStatus: text('last_status', { enum: ['success', 'failure', 'blocked', 'skipped'] }),
  runCount: integer('run_count').notNull().default(0),
})

export const routineRuns = sqliteTable('routine_runs', {
  id: text('id').primaryKey(),
  routineId: text('routine_id')
    .notNull()
    .references(() => routines.id, { onDelete: 'cascade' }),
  ts: integer('ts', { mode: 'timestamp_ms' }).notNull(),
  outcome: text('outcome', { enum: ['success', 'failure', 'blocked', 'skipped'] }).notNull(),
  traceId: text('trace_id'),
  metaJson: text('meta_json'),
})
