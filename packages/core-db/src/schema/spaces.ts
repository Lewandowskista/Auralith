import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  rulesJson: text('rules_json').notNull().default('[]'),
})

export const folderRules = sqliteTable('folder_rules', {
  id: text('id').primaryKey(),
  spaceId: text('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  glob: text('glob').notNull().default('**/*'),
  include: integer('include', { mode: 'boolean' }).notNull().default(true),
  priority: integer('priority').notNull().default(0),
})
