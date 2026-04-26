import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import * as schema from './schema'
import { loadVecExtension } from './vec-loader'
import { createChunkVecRepo, type ChunkVecRepo } from './repos/chunk-vec.repo'

export type DbClient = ReturnType<typeof createDb>

export type DbBundle = {
  db: DbClient
  vec: ChunkVecRepo
}

let _bundle: DbBundle | null = null

export function getDb(): DbBundle {
  if (!_bundle) throw new Error('DB not initialized — call initDb() first')
  return _bundle
}

export type DbInitOptions = {
  dataDir: string
}

export function initDb(opts: DbInitOptions): DbBundle {
  mkdirSync(opts.dataDir, { recursive: true })
  const dbPath = join(opts.dataDir, 'auralith.db')
  const sqlite = new Database(dbPath)

  loadVecExtension(sqlite)

  // WAL mode — better concurrency and crash recovery
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('busy_timeout = 5000')

  runMigrations(sqlite)
  const db = createDb(sqlite)
  const vec = createChunkVecRepo(sqlite)

  _bundle = { db, vec }
  return _bundle
}

function createDb(sqlite: Database.Database) {
  return drizzle(sqlite, { schema })
}

// Inline migrations — each is idempotent via IF NOT EXISTS.
// When adding columns or tables, append a new migration entry.
function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      rules_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS folder_rules (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      glob TEXT NOT NULL DEFAULT '**/*',
      include INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS docs (
      id TEXT PRIMARY KEY,
      space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
      path TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK(kind IN ('md','txt','pdf')),
      title TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      hash TEXT NOT NULL,
      indexed_at INTEGER,
      redacted_flags TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      heading_path TEXT NOT NULL DEFAULT '',
      char_start INTEGER NOT NULL,
      char_end INTEGER NOT NULL,
      page INTEGER,
      text TEXT NOT NULL,
      tokens INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      text,
      content='chunks',
      content_rowid='rowid'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      path TEXT NOT NULL,
      prev_path TEXT,
      space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      payload_json TEXT NOT NULL DEFAULT '{}',
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
    CREATE INDEX IF NOT EXISTS idx_events_space_id ON events(space_id);

    CREATE TABLE IF NOT EXISTS news_feeds (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'en',
      region TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      fetch_interval INTEGER NOT NULL DEFAULT 3600
    );

    CREATE TABLE IF NOT EXISTS news_topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      analysis_opt_in INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS news_topic_feeds (
      topic_id TEXT NOT NULL REFERENCES news_topics(id) ON DELETE CASCADE,
      feed_id TEXT NOT NULL REFERENCES news_feeds(id) ON DELETE CASCADE,
      PRIMARY KEY (topic_id, feed_id)
    );

    CREATE TABLE IF NOT EXISTS news_clusters (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL REFERENCES news_topics(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL REFERENCES news_feeds(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      published_at INTEGER,
      raw_text TEXT NOT NULL DEFAULT '',
      summary TEXT,
      analysis TEXT,
      cluster_id TEXT REFERENCES news_clusters(id) ON DELETE SET NULL,
      fetched_at INTEGER NOT NULL,
      read_at INTEGER,
      saved INTEGER NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_guid ON news_items(feed_id, guid);

    CREATE TABLE IF NOT EXISTS weather_cache (
      location_key TEXT PRIMARY KEY,
      lat TEXT NOT NULL,
      lon TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      proposed_action_json TEXT NOT NULL,
      tier TEXT NOT NULL CHECK(tier IN ('safe','confirm','restricted')),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK(status IN ('open','accepted','dismissed','snoozed','expired')),
      created_at INTEGER NOT NULL,
      decided_at INTEGER,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tool_invocations (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      tool_id TEXT NOT NULL,
      params_json TEXT NOT NULL,
      tier TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','cancelled')),
      error TEXT,
      actor TEXT NOT NULL CHECK(actor IN ('user','suggestion','scheduler')),
      trace_id TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tool_invocations_ts ON tool_invocations(ts DESC);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      actor TEXT NOT NULL,
      subject TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts DESC);

    CREATE TABLE IF NOT EXISTS permission_grants (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL UNIQUE,
      granted_at INTEGER NOT NULL,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompts_cache (
      hash TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      completion TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      ttl INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      next_run_at INTEGER NOT NULL,
      last_run_at INTEGER,
      last_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(last_status IN ('success','failure','running','pending')),
      backoff INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS voice_transcripts (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      text TEXT NOT NULL,
      routed_to TEXT,
      session_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_voice_transcripts_ts ON voice_transcripts(ts DESC);

    CREATE TABLE IF NOT EXISTS voice_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      installed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      trigger_json TEXT NOT NULL,
      conditions_json TEXT NOT NULL DEFAULT '[]',
      action_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_run_at INTEGER,
      last_status TEXT CHECK(last_status IN ('success','failure','blocked','skipped')),
      run_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS routine_runs (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      ts INTEGER NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','blocked','skipped')),
      trace_id TEXT,
      meta_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_routine_runs_routine ON routine_runs(routine_id, ts DESC);

    -- M11: adaptive proactivity
    CREATE TABLE IF NOT EXISTS suggestion_weights (
      kind TEXT PRIMARY KEY,
      weight REAL NOT NULL DEFAULT 0,
      sample_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      start_at INTEGER NOT NULL,
      end_at INTEGER NOT NULL,
      title TEXT NOT NULL,
      location TEXT,
      description TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_at);

    CREATE TABLE IF NOT EXISTS suggestion_pauses (
      kind TEXT PRIMARY KEY,
      paused_until INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'consecutive_dismissals'
    );

    -- M12: rolling crash/error stats (30-day window, local only)
    CREATE TABLE IF NOT EXISTS crash_stats (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      level TEXT NOT NULL CHECK(level IN ('crash','error')),
      module TEXT NOT NULL,
      message TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_crash_stats_ts ON crash_stats(ts DESC);

    -- M15b: clipboard history (opt-in, local only)
    CREATE TABLE IF NOT EXISTS clipboard_history (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('text','image','file')),
      text_value TEXT,
      char_count INTEGER,
      redacted INTEGER NOT NULL DEFAULT 0,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clipboard_ts ON clipboard_history(ts DESC);

    -- M15b: app usage sessions (opt-in, privacy-bucketed, local only)
    CREATE TABLE IF NOT EXISTS app_usage_sessions (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      bucket TEXT NOT NULL CHECK(bucket IN ('ide','browser','explorer','media','productivity','other')),
      process_name TEXT NOT NULL,
      duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_app_usage_started ON app_usage_sessions(started_at DESC);

    -- M15: conversation history for multi-turn assistant
    CREATE TABLE IF NOT EXISTS conversation_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','tool_result')),
      content TEXT NOT NULL,
      tool_id TEXT,
      tool_params_json TEXT,
      tool_result_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversation_turns_session ON conversation_turns(session_id, created_at);

    -- M15: news media fields (additive ALTER — idempotent via try/catch in app code)
  `)

  // M15: additive news_items columns — SQLite ALTER TABLE is not idempotent, so wrap each
  const newsMediaCols: [string, string][] = [
    ['image_url', 'TEXT'],
    ['video_url', 'TEXT'],
    ['media_type', 'TEXT'],
    ['author', 'TEXT'],
    ['categories', 'TEXT'],
    ['reading_time_min', 'INTEGER'],
  ]
  for (const [col, type] of newsMediaCols) {
    try {
      sqlite.exec(`ALTER TABLE news_items ADD COLUMN ${col} ${type}`)
    } catch {
      // column already exists — ignore
    }
  }

  // M16: full article content fetching
  const m16cols: [string, string][] = [
    ['full_content', 'TEXT'],
    ['full_content_fetched_at', 'INTEGER'],
  ]
  for (const [col, type] of m16cols) {
    try {
      sqlite.exec(`ALTER TABLE news_items ADD COLUMN ${col} ${type}`)
    } catch {
      // column already exists — ignore
    }
  }

  // Wave 3: additive docs columns for wider ingestion
  const docsCols: [string, string][] = [['source_url', 'TEXT']]
  for (const [col, type] of docsCols) {
    try {
      sqlite.exec(`ALTER TABLE docs ADD COLUMN ${col} ${type}`)
    } catch {
      // column already exists — ignore
    }
  }

  // Wave 3: routines v2 — add actions_json column (multi-step)
  try {
    sqlite.exec(`ALTER TABLE routines ADD COLUMN actions_json TEXT`)
  } catch {
    /* already exists */
  }

  // M-V2: voice conversation tracking
  try {
    sqlite.exec(`ALTER TABLE voice_transcripts ADD COLUMN voice_conversation_id TEXT`)
  } catch {
    /* already exists */
  }

  // Wave 3: agent runs table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK(status IN ('running','completed','failed','cancelled')),
      plan_json TEXT,
      steps_json TEXT NOT NULL DEFAULT '[]',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id);

    CREATE TABLE IF NOT EXISTS browser_history_imports (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      visit_time INTEGER NOT NULL,
      visit_count INTEGER NOT NULL DEFAULT 1,
      imported_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_history_url ON browser_history_imports(url);
  `)

  // Perf indexes — idempotent, safe to re-run
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_news_items_feed_id ON news_items(feed_id);
    CREATE INDEX IF NOT EXISTS idx_news_items_cluster_id ON news_items(cluster_id);
    CREATE INDEX IF NOT EXISTS idx_news_items_published_at ON news_items(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
  `)

  // M14: docs quality columns (summary, pipeline_version) and docs_fts over summaries
  const m14DocsCols: [string, string][] = [
    ['summary', 'TEXT'],
    ['pipeline_version', 'INTEGER NOT NULL DEFAULT 0'],
  ]
  for (const [col, type] of m14DocsCols) {
    try {
      sqlite.exec(`ALTER TABLE docs ADD COLUMN ${col} ${type}`)
    } catch {
      // column already exists — ignore
    }
  }

  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
      summary,
      content='docs',
      content_rowid='rowid'
    );

    -- M14: IPC trace persistence (rolling 7-day window)
    CREATE TABLE IF NOT EXISTS traces (
      trace_id TEXT PRIMARY KEY,
      op TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      err_code TEXT,
      ts INTEGER NOT NULL,
      params_bytes INTEGER NOT NULL DEFAULT 0,
      result_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_traces_ts ON traces(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_traces_op_ts ON traces(op, ts DESC);

    -- M14: model structured-output reliability (hourly bucketed, rolling 30-day)
    CREATE TABLE IF NOT EXISTS model_reliability (
      id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      role TEXT NOT NULL,
      prompt_id TEXT NOT NULL DEFAULT '',
      hour_bucket INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      parse_failures INTEGER NOT NULL DEFAULT 0,
      validation_failures INTEGER NOT NULL DEFAULT 0,
      repaired INTEGER NOT NULL DEFAULT 0,
      successes INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_model_reliability_key
      ON model_reliability(model, role, prompt_id, hour_bucket);

    -- M14: retrieval quality traces (rolling 7-day window)
    CREATE TABLE IF NOT EXISTS retrieval_traces (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      query TEXT NOT NULL,
      hit_count INTEGER NOT NULL,
      top_score REAL,
      latency_ms INTEGER NOT NULL,
      hits_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_retrieval_traces_ts ON retrieval_traces(ts DESC);
  `)
}

export { schema }
