import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { spaces } from './spaces'

export const docs = sqliteTable('docs', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').references(() => spaces.id, { onDelete: 'set null' }),
  path: text('path').notNull().unique(),
  kind: text('kind', { enum: ['md', 'txt', 'pdf', 'docx', 'html', 'epub'] }).notNull(),
  sourceUrl: text('source_url'),
  title: text('title').notNull(),
  size: integer('size').notNull(),
  mtime: integer('mtime', { mode: 'timestamp_ms' }).notNull(),
  hash: text('hash').notNull(),
  indexedAt: integer('indexed_at', { mode: 'timestamp_ms' }),
  redactedFlags: text('redacted_flags').notNull().default('{}'),
})

export const chunks = sqliteTable('chunks', {
  id: text('id').primaryKey(),
  docId: text('doc_id')
    .notNull()
    .references(() => docs.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  headingPath: text('heading_path').notNull().default(''),
  charStart: integer('char_start').notNull(),
  charEnd: integer('char_end').notNull(),
  page: integer('page'),
  text: text('text').notNull(),
  tokens: integer('tokens').notNull(),
})
