import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const traces = sqliteTable('traces', {
  traceId: text('trace_id').primaryKey(),
  op: text('op').notNull(),
  durationMs: integer('duration_ms').notNull(),
  status: text('status', { enum: ['ok', 'error'] }).notNull(),
  errCode: text('err_code'),
  ts: integer('ts').notNull(),
  paramsBytes: integer('params_bytes').notNull().default(0),
  resultBytes: integer('result_bytes').notNull().default(0),
})

export const modelReliability = sqliteTable('model_reliability', {
  id: text('id').primaryKey(),
  model: text('model').notNull(),
  role: text('role').notNull(),
  promptId: text('prompt_id').notNull().default(''),
  hourBucket: integer('hour_bucket').notNull(),
  attempts: integer('attempts').notNull().default(0),
  parseFailures: integer('parse_failures').notNull().default(0),
  validationFailures: integer('validation_failures').notNull().default(0),
  repaired: integer('repaired').notNull().default(0),
  successes: integer('successes').notNull().default(0),
})

export const retrievalTraces = sqliteTable('retrieval_traces', {
  id: text('id').primaryKey(),
  ts: integer('ts').notNull(),
  query: text('query').notNull(),
  hitCount: integer('hit_count').notNull(),
  topScore: real('top_score'),
  latencyMs: integer('latency_ms').notNull(),
  hitsJson: text('hits_json').notNull().default('[]'),
})
