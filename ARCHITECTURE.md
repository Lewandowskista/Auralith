# Architecture — Auralith

## Process model

```
Electron main (Node)
  ├── IPC router (typed ops, Zod-validated)
  ├── Permission broker (three-tier: safe / confirm / restricted)
  ├── electron-updater
  ├── Signal providers (M11)
  │     ├── CalendarIcsImporter   (15-min ICS poll → calendar_events table)
  │     ├── IdleTracker           (powerMonitor.getSystemIdleTime wrapper)
  │     └── FocusAppTracker       (opt-in; PowerShell → enum bucket; audit-logged)
  ├── Scheduled jobs
  │     ├── BriefingJob           (07:00 daily, 2-min jitter, quiet 22–06)
  │     └── LearningRecomputeJob  (03:00 nightly; EMA weight recompute)
  └── utilityProcess workers
        └── whisper-worker        (whisper.cpp PCM-16 STT)

Renderer — main window (React / Vite)
  ├── ThemeProvider (dark/light/system; persisted to settings; pushes .light class + titlebar color)
  ├── Per-screen state (useState + useEffect + IPC polling)
  └── Design system (tokens → primitives → composed)

Renderer — mini companion window (React / Vite, separate entry)
  ├── Always-on-top, transparent, frameless 320×120 BrowserWindow
  ├── Shows current time + top open suggestion with Accept/Skip controls
  └── Draggable via -webkit-app-region: drag; opened/closed via system.openMiniWindow op

Preload (contextBridge)
  └── window.auralith.invoke(op, params) → IpcResponse
      window.auralith.on(channel, handler)  → unsubscribe fn
```

## Package dependency rules

- `core-domain` — depends only on `zod`. No Node, no infrastructure.
- `core-*` packages — each imports from `core-domain`; never cross-import each other's internals. Only public `index.ts` exports.
- `core-suggest` — imports from `core-db` for repo types; does **not** import Electron or `child_process`. Signal providers are injected via `SignalProviders` interface.
- Renderer — never imports `better-sqlite3`, `chokidar`, `fs`, or `ollama`. Only the preload bridge.
- Workers — never import React.

## Local API (IPC)

All renderer→main communication goes through one typed invoke surface:

```ts
window.auralith.invoke(op: string, params: unknown): Promise<IpcResponse>
window.auralith.on(channel: string, handler: (data: unknown) => void): () => void
```

### Op namespaces

| Namespace       | Owner  | Key ops                                                                                                                                                                    |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `palette.*`     | M1     | `open`, `close`                                                                                                                                                            |
| `assistant.*`   | M3     | `send`, `abort`, `invokeTool`                                                                                                                                              |
| `brain.*`       | M3     | `search`, `reindex`, `spaces.*`, `docs.*`                                                                                                                                  |
| `activity.*`    | M4     | `query`, `listSessions`, `setRetention`, `refreshWatcher`                                                                                                                  |
| `news.*`        | M5     | `listTopics`, `listClusters`, `listItems`, `markRead`, `saveItem`, `triggerFetch`                                                                                          |
| `weather.*`     | M5     | `getCurrent`, `getForecast`, `setLocation`, `getBriefing`                                                                                                                  |
| `suggest.*`     | M6+M11 | `list`, `accept`, `dismiss`, `snooze`, `insights`, `resetLearning`                                                                                                         |
| `settings.*`    | M2     | `get`, `set`, `getAll`                                                                                                                                                     |
| `permissions.*` | M2     | `list`, `grant`, `revoke`                                                                                                                                                  |
| `audit.*`       | M2     | `query`, `export`, `purge`                                                                                                                                                 |
| `system.*`      | M7–M13 | `getVersion`, `getCrashLog`, `exportData`, `deleteAllData`, `installUpdate`, `getCrashStats`, `clearCrashStats`, `openMiniWindow`, `closeMiniWindow`, `getMiniWindowState` |
| `voice.*`       | M8     | `getStatus`, `startCapture`, `stopCapture`, `speak`, `listSttModels`, `setEnabled`                                                                                         |
| `routines.*`    | M9     | `list`, `create`, `update`, `delete`, `enable`, `disable`, `dryRun`, `run`, `history`                                                                                      |
| `signals.*`     | M11    | `importCalendar`, `setFocusAppTracking`, `getStatus`                                                                                                                       |

Zod schema pairs for every op live in `packages/core-domain/src/api/ops/`.

## Permission tiers

| Tier         | Behavior                                               |
| ------------ | ------------------------------------------------------ |
| `safe`       | Auto-executes, logged to audit_log                     |
| `confirm`    | Pre-drafted and queued; one-click Confirm Action Sheet |
| `restricted` | Blocked from auto-proposal; requires typed "CONFIRM"   |

## Suggestion pipeline (M6 + M10 + M11)

```
SuggestionEngine.tick() [every 60s]
  ├── suggestionsRepo.expireStale()
  ├── pausesRepo.expireStale()          [M11]
  ├── Run all generators concurrently
  │     Weekday:   MorningBrief, EndOfDayRecap, DownloadsCleanup,
  │                SessionRecap, ResumeWork, NewsDigest, WeatherAlert
  │     Weekend:   WeekendBriefing, ReadingResurface, HobbyIdea     [M10]
  │     M11:       CalendarPrep, FocusAlignedResume
  ├── Collect SuggestionCandidate[]
  ├── Build pausedKinds set (check DB + shouldPauseKind cooldown)   [M11]
  ├── Load suggestion_weights from DB                               [M11]
  └── selectTopCandidates(candidates, openCount, paused, weights)
        → ranked by (KIND_PRIORITY × learnedMultiplier) − TIER_PENALTY
        → max 3 active suggestions
        → persisted to suggestions table with TTL-based expiresAt

LearningRecomputeJob [nightly 03:00]                               [M11]
  ├── Read last 30 days of accepted/dismissed suggestions
  ├── Group by kind, sort chronologically
  └── Iterate EMA(α=0.15, clamp ±0.5) → upsert suggestion_weights
```

## Signal injection (M11)

`SignalProviders` in `core-suggest/src/signals.ts` defines the contract:

```ts
type SignalProviders = {
  getIdleMs?: () => number
  getFocusAppBucket?: () => FocusAppBucket | null
  getNextCalendarEvent?: (withinMs: number) => { title; startAt; location? } | null
}
```

Concrete providers live in `apps/desktop/src/main/signals/` and are injected into `SuggestionEngine.setSignals()` at startup. `core-suggest` has no Electron dependency.

## AI strategy

- Light Ollama local model (default: `qwen2.5:7b-instruct` for chat, `nomic-embed-text` for embeddings)
- Classification and extraction tasks designed for `llama3.2:3b` or lighter
- Prompts: short, schema-driven, one-task-per-call, Zod-validated outputs, one-retry with schema reminder
- Fallback: graceful degraded mode when Ollama is unreachable (FTS-only search, assistant input disabled)

## Database

SQLite at `%APPDATA%/Auralith/data/auralith.db`. WAL mode, `foreign_keys=ON`, `synchronous=NORMAL`.
Vector index via sqlite-vec extension (768-dim float32 `chunk_vec` virtual table).
ORM: Drizzle. Migrations: inline idempotent `CREATE TABLE IF NOT EXISTS` blocks in `client.ts`.

### Tables by milestone

| Table                                                                | Milestone | Purpose                                 |
| -------------------------------------------------------------------- | --------- | --------------------------------------- |
| spaces, folder_rules, docs, chunks, chunks_fts                       | M2/M3     | Knowledge spaces + FTS5                 |
| sessions, events                                                     | M4        | Activity timeline                       |
| news_feeds, news_topics, news_topic_feeds, news_clusters, news_items | M5        | News pipeline                           |
| weather_cache                                                        | M5        | Open-Meteo cache                        |
| suggestions, tool_invocations                                        | M6        | Suggestion + tool audit                 |
| audit_log, permission_grants, settings, prompts_cache, jobs          | M2        | Core infrastructure                     |
| voice_transcripts, voice_models                                      | M8        | Voice I/O                               |
| routines, routine_runs                                               | M9        | Automation DSL                          |
| suggestion_weights                                                   | M11       | EMA learned weights per suggestion kind |
| calendar_events                                                      | M11       | Imported ICS calendar events            |
| suggestion_pauses                                                    | M11       | Per-kind cooldown pause state           |

## Design system

Tokens → Tailwind preset → shadcn/ui primitives → Auralith-composed components.
Surface hierarchy: Canvas → Nav rail → Card (solid) → Glass panel (elevated floats only).
Motion: Framer Motion, medium-low intensity, `prefers-reduced-motion` honored.
Liquid ether background: Home + onboarding + idle only; auto-pauses on low-power.

## Milestones

| Milestone | Scope                                                                                           | Status |
| --------- | ----------------------------------------------------------------------------------------------- | ------ |
| M0        | Repo & tooling                                                                                  | ✅     |
| M1        | Design system + shell                                                                           | ✅     |
| M2        | Persistence + IPC + permission broker                                                           | ✅     |
| M3        | Assistant + Ollama + retrieval                                                                  | ✅     |
| M4        | Activity timeline                                                                               | ✅     |
| M5        | News + weather + briefings                                                                      | ✅     |
| M6        | Proactive suggestions                                                                           | ✅     |
| M7        | MVP hardening + release candidate                                                               | ✅     |
| M8        | Voice I/O (PTT + whisper STT + Windows TTS)                                                     | ✅     |
| M9        | Routines DSL (trigger/condition/action engine + UI)                                             | ✅     |
| M10       | Leisure + weekend mode                                                                          | ✅     |
| M11       | Adaptive proactivity (learning ranker + calendar + idle + focus signals)                        | ✅     |
| M12       | Quality hardening: Playwright E2E suite, axe-core a11y, crash_stats telemetry, bundle-size gate | ✅     |
| M13       | Light mode, mini companion window, advanced retention controls                                  | ✅     |
| Future    | Deeper Windows integrations and assistant capabilities                                          | 🔲     |
