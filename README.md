# Auralith

A premium, local-first AI desktop command center for Windows 11.

Unifies knowledge retrieval, file activity intelligence, personalized news, weather, voice I/O, routines automation, weekend leisure mode, and an adaptive proactive AI assistant — all running entirely on your machine. Zero telemetry. Zero cloud dependency.

## Quick start

**Prerequisites:** Node 20+, pnpm 10+, [Ollama](https://ollama.ai) installed locally.

```bash
pnpm install
pnpm dev              # start Electron in dev mode with HMR
pnpm test             # run all tests (Vitest)
pnpm typecheck        # TypeScript strict check across all packages
pnpm build            # production build
pnpm build:installer  # produce NSIS installer (Windows only)
```

## Monorepo structure

```
apps/
  desktop/
    src/
      main/           Electron main process, IPC router, permission broker, updater
        briefing/     Morning briefing scheduled job
        ipc/          Route handler + per-feature handler modules
        signals/      M11 signal providers: calendar importer, idle tracker, focus tracker, learning job
        tools/        Built-in tool registry (files, notes, navigation, brain)
        voice/        PTT manager, whisper STT client, TTS service, voice orchestrator
        watcher/      File watcher, session job, retention job
      preload/        contextBridge typed surface (window.auralith)
      renderer/       React UI — screens, components, design system consumption
      workers/        utilityProcess workers (whisper STT)

packages/
  core-domain/        Zod schemas and shared types — zero infrastructure deps
  core-db/            Drizzle ORM schema, inline SQL migrations, SQLite repositories
  core-events/        Activity event schema, normalizer, session grouping
  core-ai/            Ollama client, prompt contracts, structured-output runtime
  core-tools/         Tool registry, executor, three-tier permission gate
  core-ingest/        MD/TXT/PDF parsing, heading-aware chunking, embedding
  core-retrieval/     Hybrid FTS+vector search (RRF), citation assembly
  core-news/          RSS adapter, dedup, clustering, summarization pipeline
  core-weather/       Open-Meteo client, local cache
  core-scheduler/     Cron-like scheduler with quiet-hours and jitter
  core-suggest/       Signal→candidate→ranker proactive suggestion pipeline
  core-routines/      Routine engine, trigger/condition evaluator, dry-run, CRUD
  core-voice/         SttClient + TtsClient interfaces, VoiceState schema, model ids
  design-system/      Tokens, Framer Motion primitives, composed components
  test-utils/         Vitest helpers, fixture builders, fake clocks
```

## Tech stack

| Layer      | Stack                                                        |
| ---------- | ------------------------------------------------------------ |
| Shell      | Electron 33 + electron-vite                                  |
| UI         | React 18, TypeScript strict, Tailwind CSS, Framer Motion     |
| Components | shadcn/ui, cmdk, sonner, vaul, lucide-react                  |
| Database   | better-sqlite3, Drizzle ORM, sqlite-vec (768-dim embeddings) |
| AI         | Ollama (local), Zod-validated structured outputs             |
| Voice STT  | whisper.cpp via utilityProcess + PCM-16 streaming            |
| Voice TTS  | Windows System.Speech.Synthesis via PowerShell               |
| Validation | Zod at every I/O boundary                                    |
| Tests      | Vitest                                                       |
| Build      | pnpm 10 workspaces, electron-vite, NSIS installer            |

---

## Implementation status

### Milestone 0 — Repo & tooling ✅

- pnpm 10 monorepo with all packages scaffolded
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` across all packages
- ESLint (typescript-eslint strict) + Prettier + Husky pre-commit hooks
- electron-vite unified build (replaces concurrently+tsc+wait-on setup — ADR 0002)
- electron-updater wired with GitHub Releases feed; NSIS installer pipeline
- GitHub Actions CI: test + build on Windows, installer artifact on main branch

### Milestone 1 — Design system + shell ✅

- **Token system** — TypeScript constants + CSS custom properties from one source of truth; Tailwind preset driven from tokens
- **Liquid ether backdrop** — WebGL2 GLSL simplex-noise shader, obsidian/violet/cyan palette, vignette; auto-pauses on `prefers-reduced-motion`, `document.hidden`, low-power, and explicit prop
- **Framer Motion primitives** — `FadeRise`, `FadeIn`, `Scale98`, `SlideInRight`, `SlideInUp`, `ShimmerLine`; all honor reduced-motion
- **App shell** — nav rail (7 sections, animated active indicator, keyboard nav, ARIA), `AnimatePresence` screen routing, skip-to-content link
- **Command palette** — cmdk-based, glass panel styling, group headers, keyboard hint footer, animates in/out
- **Button + Badge** — CVA-based with 5 variants × 5 sizes; `asChild` via Radix Slot; visible focus rings
- **Global shortcuts** — `Ctrl+K` (palette), `Ctrl+Shift+N` (quick capture) registered via `globalShortcut`
- **Tray icon** — show/focus/quit context menu, single-click to restore
- **Stub screens** — Home (ether + greeting), Assistant, Activity, Knowledge, News, Weather, Settings

### Milestone 2 — Persistence + IPC + permission broker ✅

- **Full SQLite schema** — 20 tables via inline idempotent migrations: spaces, folder_rules, docs, chunks, chunks_fts (FTS5 virtual), sessions, events, news_feeds, news_topics, news_topic_feeds, news_clusters, news_items, weather_cache, suggestions, tool_invocations, audit_log, permission_grants, settings, prompts_cache, jobs
- **sqlite-vec integration** — extension loader + `chunk_vec` virtual table (vec0, 768-dim float32); `createChunkVecRepo` with upsert/remove/search
- **Repositories** — `SettingsRepo` (Zod-validated key-value upsert), `AuditRepo` (write/query/count with date+kind+actor filters), `PermissionsRepo` (grant/revoke/has with expiry auto-revoke), `ChunkVecRepo` (cosine search)
- **IPC router** — request tracing (`traceId = randomUUID()`), per-op timing, typed `{ ok, data, requestId, traceId }` envelopes
- **API op Zod pairs** — 60+ typed ops across 9 namespaces: `palette.*`, `assistant.*`, `brain.*`, `activity.*`, `news.*`, `weather.*`, `suggest.*`, `settings.*`, `system.*`
- **Live IPC handlers** — settings CRUD, permissions grant/revoke/list, audit query/export (JSON + CSV), system version/updater/data-dir, palette open/close
- **Stub handlers** — all M3–M6 ops registered, return `NOT_IMPLEMENTED` for graceful degradation
- **core-tools** — typed `ToolDef` registry, `executeTool` with full three-tier enforcement: `restricted` auto-blocks suggestion/scheduler actors; `confirm` routes to renderer sheet; `safe` auto-runs; all outcomes written to audit log
- **Confirm Action Sheet** — glass modal with params preview, reversibility warning, typed `CONFIRM` gate for restricted tier; backed by promise/callback IPC bridge between main and renderer
- **Settings screen** — sidebar nav: Appearance (stubs), Permissions (live grant/revoke table), Privacy/Audit (live paginated table, JSON + CSV export)
- **Onboarding flow** — 5-step wizard (Welcome → Ollama → Folders → Spaces → News/Weather) with slide animations, shared state, persists to settings + permission grants on completion; `AppShell` gates behind settings check

### Milestone 3 — Assistant + Ollama + retrieval ✅

- **`core-ai`** — `OllamaClient` (ping/listModels/generate/stream/embed), `OllamaStatusMonitor` (30s interval + IPC push), `runPrompt` runtime (Zod-validated structured output, JSON fence strip, one-retry with schema reminder), `RAG_SYSTEM_PROMPT` + `buildRagUserPrompt`
- **`core-ingest`** — MD/TXT parsers, `pdf-parse` text-layer extractor, heading-aware chunker (~800 tokens / 100 overlap, sentence-boundary snapping), hash-based idempotency, `embedChunks` (batch=8, concurrency=2)
- **`core-retrieval`** — `hybridSearch` (FTS5 K=40 + vec0 K=40 → RRF merge → top-8), `assembleCitations` (numbered `[^n]` refs with char offsets, heading path, page), `parseCitationRefs`
- **Assistant screen** — streaming chat with `assistant:token/done/error` IPC listeners, inline `[^n]` citation chips, animated citation side panel, stop button (`assistant.abort`), disabled with banner when Ollama offline
- **Knowledge screen** — Spaces sidebar, doc list, 300ms debounce hybrid search, chunk preview panel, Reindex button, "FTS only" badge when offline
- **Spaces + folder rules** — full CRUD wired to DB; `spaceId` assigned at ingest time via folder rules; `brain.reindex` walks folder_rules dirs and re-ingests + re-embeds
- **Ollama-offline fallback** — `useOllamaStatus` hook (mount probe + `ollama:status` IPC), `OllamaBanner` component; search degrades to FTS-only; assistant input disabled; banner on both screens

### Milestone 4 — Activity timeline ✅

- **`core-events`** — `ActivityEvent` + `RawFileEvent` schema; `EventNormalizer` class with 500ms debounce per path, rename-pair detection (delete+create within 2s + same extension = rename), longest-prefix space assignment, secret-pattern path sanitizer
- **`EventsRepo`** — write/query/count events with after/before/kind/spaceId/sessionId filters; session CRUD (create/close/getOpen/getLatest); `assignSessionBatch`; `deleteOlderThan`; `deleteOrphanSessions`
- **`FileWatcher`** — chokidar-based watcher, ignores dotfiles/node_modules/git; `addPaths` + `updateFolderRules` for live updates; flushes pending on stop
- **`SessionJob`** — runs every 5 min; clusters unassigned events by 20-min idle gap into sessions; extends or creates sessions as needed
- **`RetentionJob`** — runs daily; reads `activity.retentionDays` setting (default 90, -1 = forever); prunes events + orphan sessions
- **`activity.*` IPC handlers** — `query`, `getSession`, `listSessions`, `setRetention`, `refreshWatcher` (live-updates watched paths after onboarding/settings change)
- **Activity screen** — filter chips for all 7 event kinds; date-section headers; collapsible session groups with event count + duration; animated event rows; event details side panel (path, time, source, actor, payload JSON, prev path); "Ask assistant" shortcut per session; 100-event paginated list that polls every 5s

### Milestone 5 — News + Weather + Briefings ✅

- **`core-news`** — `fetchFeed`/`parseFeed` RSS 2.0 + Atom adapter; `createNewsRepo` with full CRUD for feeds/topics/items/clusters + `upsertItems` GUID dedup; `clusterItems` DBSCAN-lite (cosine 0.75 threshold, Jaccard keyword-overlap fallback when offline); `runFullPipeline` (fetchAndIngest → summarizePending → clusterTopic); three `PromptContract` instances: `SUMMARIZE_ITEM_PROMPT`, `ANALYZE_ITEM_PROMPT` (analysis opt-in per topic), `CLUSTER_LABEL_PROMPT`
- **`core-weather`** — `fetchWeather(lat, lon)` Open-Meteo v1/forecast with current + 7-day + 24h hourly; 1-hour in-memory cache; `buildWeatherBriefing` → text summary + alert level (`none`/`watch`/`warning`); WMO code descriptions; no API key required
- **`core-scheduler`** — `Scheduler` class with `register(JobDef)` + `start()`; `JobDef` carries `cronHour/cronMinute/jitterMs/quietStart/quietEnd`; `msUntilNextRun` handles midnight-spanning quiet windows; `getScheduler()` singleton
- **`news.*` IPC handlers** — 11 ops live: `listTopics`, `createTopic`, `deleteTopic`, `setTopicAnalysisOptIn`, `listFeeds`, `addFeed`, `removeFeed`, `listClusters`, `listItems` (with clusterId/feedId/unreadOnly/savedOnly filters), `markRead`, `saveItem`, `triggerFetch`
- **`weather.*` IPC handlers** — 4 ops: `getCurrent`, `getForecast`, `setLocation`, `getBriefing`; reads lat/lon from settings or inline params
- **News screen** — topics sidebar with create/delete/AI-take toggle; cluster list panel (story groups with item count + age); article list with read/unread state, save toggle, summary preview; article reader panel with full summary, clearly-labeled "AI Analysis" section (opt-in), external link
- **Weather screen** — current conditions hero (temp, emoji, feels-like, humidity, wind); sunrise/sunset; severe alert banner; daily briefing text; 24h hourly scrollable strip; 7-day forecast with temperature range bars (violet gradient); location setup flow for first-run; Change Location control
- **Morning briefing job** — `setupBriefingScheduler` registers 07:00 daily job (2 min jitter, quiet hours 22–6) via `core-scheduler`; `buildBriefing` assembles weather payload + top 3 topic clusters; `broadcastBriefing` sends `briefing:morning` IPC event to renderer

### Milestone 6 — Proactive suggestions ✅

- **`SuggestionsRepo`** — full CRUD on the `suggestions` table: `create`, `get`, `list`, `listOpen`, `hasOpenOfKind`, `accept`, `dismiss`, `snooze`, `expireStale` (also wakes snoozed suggestions); exported from `core-db`
- **`core-suggest`** — `SuggestionEngine` class runs every 60s: calls `expireStale`, runs all 7 generators concurrently, passes candidates through `selectTopCandidates` (3-active cap, kind-priority + tier-penalty scoring), persists winners with a TTL-based `expiresAt`
- **7 generators** — `DownloadsCleanup` (5+ stale files in Downloads), `SessionRecap` (session closed < 1h ago), `ResumeWork` (idle 20–90 min after session), `NewsDigest` (3+ unread clusters), `WeatherAlert` (watch or warning active), `MorningBrief` (06:00–10:00, not yet shown today), `EndOfDayRecap` (17:00–20:00, 5+ events today)
- **`suggest.*` IPC handlers** — `list`, `accept`, `dismiss`, `snooze`; `assistant.invokeTool` also live
- **HomeScreen rebuilt** — adaptive greeting; morning briefing card; suggestion rail with `AnimatePresence`; per-card Accept / Snooze 4h / Dismiss; 30s polling
- **Tray badge** — rebuilds context menu every 60s with open suggestion count

### Milestone 7 — MVP hardening & release candidate ✅

- **Crash reporter** — `uncaughtException` + `unhandledRejection` capture; rolling 2MB log; `system.getCrashLog` IPC op; `ErrorBoundary` wraps each screen
- **System handler completion** — `system.installUpdate`, `system.exportData`, `system.deleteAllData`
- **`EmptyState` component** — used in Activity, Knowledge, News, Home no-content states
- **Settings → Updates tab** — version + channel + live updater status; `Check for updates`; `Restart & install`
- **Settings → Privacy & Data tab** — data directory path + disk size; Export data; Delete all data with staged confirmation and typed `DELETE`

### Milestone 8 — Voice I/O ✅

- **`core-voice`** — `SttClient` + `TtsClient` interfaces; `VoiceState` enum (idle/listening/transcribing/speaking); model ids (`tiny.en`, `base.en`, `small.en`); whisper worker protocol types
- **`PttManager`** — global hotkey binding (default `Ctrl+Shift+Space`) with conflict detection; idle → listening → transcribing state machine; broadcasts to renderer on every state transition
- **`WhisperClient`** — spawns whisper.cpp `utilityProcess`; PCM-16 audio streaming via stdin; partial + final transcript output; crash-recovery backoff (disables after 3 crashes in 60s); 60s idle auto-shutdown
- **`TtsService`** — Windows-only; PowerShell `System.Speech.Synthesis` queue; voice selection + rate control tuned for the Windows build target
- **`VoiceOrchestrator`** — wires PTT + STT + TTS; session tracking; transcript persistence to `voice_transcripts` table; routes transcribed text to the assistant pipeline; optional TTS playback for briefings and suggestion confirmations
- **`voice.*` IPC handlers** — 11 ops: `getStatus`, `startCapture`, `stopCapture`, `cancelCapture`, `speak`, `listTtsVoices`, `listSttModels`, `setEnabled`, `setPttBinding`, `setSettings`
- **Settings → Voice tab** — enable/disable toggle; mic permission gating; STT model selector (installed indicator); TTS voice dropdown; "speak briefings" + "speak suggestion confirmations" toggles; privacy note

**Intentional gaps (to resolve before M12):**

- `voice.downloadSttModel` is not implemented — models must be bundled at build time; a download + progress flow is needed for distribution
- Confidence scores from whisper output are hardcoded to `0.9` — real per-word confidence parsing is not wired
- TTS is implemented with Windows `System.Speech.Synthesis` and is intentionally scoped to the Windows product target
- No wake-word / always-listening mode — push-to-talk only; wake word would require a lightweight always-on VAD model
- No audio file logging — transcripts are stored but raw audio is discarded immediately; replay for debugging is not possible

### Milestone 9 — Tool library + Routines DSL ✅

- **`core-routines`** — `RoutineEngine` class with `onEvent`, `onSuggestionAccepted`, `onStartup`, `forceRun`, `start` (idle poll), `stop`; rate limiter (20 runs/hour per routine); audit logging on every execution
- **Trigger evaluator** — 5 trigger types: `schedule` (daily at cronHour:cronMinute), `on.event` (by eventKind), `suggestion.accepted` (by suggestionKind), `app.startup`, `on.idle` (after N minutes)
- **Condition evaluator** — 3 condition types (AND-joined): `time.between`, `weekday.in`, `setting.eq`
- **Dry-run engine** — simulates trigger evaluation against 24h of real event history; returns `matchCount` + up to 10 sample timestamps with reasons
- **`RoutinesRepo`** — full CRUD; `recordRun` (updates lastRunAt/lastStatus/runCount); `countRunsInWindow` for rate-limiting; `listRuns` for history
- **`routines.*` IPC handlers** — 11 ops: `list`, `get`, `create`, `update`, `delete`, `enable`, `disable`, `dryRun`, `run`, `history`
- **Automations screen** — routine cards (trigger label, tool target, last run time, run count, status icon); enable/disable toggle; Manual "Run now"; empty state
- **RoutineEditor** — 4-step wizard: Trigger → Conditions → Action → Confirm; trigger-type-specific input fields; multi-condition builder with add/remove; tool selector dropdown + JSON params editor; dry-run preview in the Confirm step
- **RoutineHistoryPanel** — slide-in panel with run outcome icons, timestamps, error messages, success/failure counts

**Intentional gaps (to resolve in M13+):**

- Cron expressions are hour:minute only — no day-of-month, month, or multi-day scheduling
- Action params are raw JSON with no variable substitution — `{{eventKind}}`, `{{sessionId}}`, and similar template tokens are not supported
- Only a single action per routine — multi-step sequences and conditional branches are not evaluated
- No completion notifications to the user — run outcomes are audit-logged but no in-app toast or tray badge update fires
- External triggers (webhooks, file system events beyond the watcher, IFTTT) are not in scope

### Milestone 10 — Leisure + weekend mode ✅

- **Weekend detection** — `isWeekendModeOn(settingsRepo, now)` reads `leisure.weekendMode` setting: `'auto'` (Sat/Sun detection), `'always'`, or `'off'`; consumed by all three leisure generators
- **3 new generators** — `WeekendBriefing` (Sat/Sun 08:00–11:00; lighter-tone variant of morning brief), `ReadingResurface` (surfaces saved news items ≥7 days old; signal injected via `getSavedOldNewsItemCount`), `HobbyIdea` (afternoon 13:00–18:00; deterministic rotation of 10 nudge strings, at most once per day)
- **Engine integration** — `MorningBrief` and `EndOfDayRecap` suppressed on weekends when leisure mode is active; new `getSavedOldNewsItemCount` signal slot added to `SuggestionEngineSignals`
- **Ranker entries** — `leisure.weekend-brief: 85`, `leisure.reading-resurfaced: 55`, `leisure.hobby-idea: 25`
- **2 new tools** — `news.openSaved` (navigate News screen filtered to saved items), `leisure.dismissIdea` (no-op acknowledgement for hobby nudges)
- **Settings → Leisure tab** — three-option radio selector (Auto-detect / Always on / Off) with per-option descriptions; bulleted summary of what changes in leisure mode; `Coffee` icon in settings nav
- **HomeScreen updates** — weekend-aware greeting ("Enjoy your afternoon." on weekends); "Weekend" badge with `Coffee` icon on the suggestion rail header when any leisure kind is active

**Intentional gaps (to resolve in M13+):**

- `getSavedOldNewsItemCount` signal is wired to a `() => 0` stub in `main/index.ts` — the actual query against `news_items` (saved=true, fetchedAt < 7 days ago) needs to be wired when the news handler initializes
- `briefing.show` is called with `{ tone: 'leisure' }` params but the briefing job ignores the `tone` field — a lighter-tone briefing path needs to be implemented in `briefing-job.ts`
- `leisure.lastHobbyDay` is read from settings to gate once-per-day hobby ideas but is never written back — the generator needs to call `settingsRepo.set('leisure.lastHobbyDay', today)` after producing a candidate
- No leisure-specific news topic preset — the onboarding flow does not offer cooking, film, books, or games as suggested topic subscriptions; this was deferred to avoid scope creep in M10

### Milestone 11 — Adaptive proactivity ✅

- **3 new DB tables** — `suggestion_weights` (EMA learned weight per kind, sample count, updated_at), `calendar_events` (start/end/title/location/description from ICS import), `suggestion_pauses` (per-kind cooldown until timestamp); all created via idempotent inline migrations
- **3 new repositories** — `SuggestionWeightsRepo` (get/upsert/clear), `CalendarEventsRepo` (upsert/listUpcoming/getNextEvent/clear), `SuggestionPausesRepo` (isKindPaused/pause/resume/expireStale/clear)
- **Dismissal-learning ranker** — `computeNextWeight(currentWeight, samples, outcome)` EMA formula (α=0.15); hard-clamped to ±0.5; `MIN_SAMPLES=5` threshold before learned weight is applied; `rankCandidates` multiplies base score by `(1 + learnedWeight)`
- **Cooldown policy** — `shouldPauseKind`: 3 consecutive dismissals in 48h → 24h pause; `SuggestionPausesRepo` persists pause state; engine clears expired pauses on every tick; paused kinds filtered from candidates before ranking
- **`SignalProviders` interface** — injectable signal contract in `core-suggest/src/signals.ts`: `getIdleMs`, `getFocusAppBucket`, `getNextCalendarEvent(withinMs)`; keeps `core-suggest` free of Electron dependencies
- **2 new generators** — `CalendarPrep` (fires when next event is within 45 min; tier=confirm; tool=`briefing.showEventPrep`) and `FocusAlignedResume` (fires when IDE/explorer is foregrounded after 20–90 min idle; tier=confirm)
- **`LearningRecomputeJob`** — nightly 03:00 (5 min jitter) EMA recompute over last 30 days of decided suggestions; grouped by kind, chronologically sorted, iterated through `computeNextWeight`; updates `suggestion_weights` table
- **`CalendarIcsImporter`** — minimal ICS parser (VEVENT blocks, DTSTART/DTEND/SUMMARY/LOCATION/DESCRIPTION; no RRULE recurrence); 15-min poll job; path persisted in settings; on import: clear + re-upsert all events
- **`IdleTracker`** — wraps `powerMonitor.getSystemIdleTime()` (converts seconds → ms)
- **`FocusAppTracker`** — opt-in; PowerShell `Win32_ForegroundWindowProcess` → process name → enum bucket (`ide`/`browser`/`explorer`/`other`); 60s poll; audit-logs bucket enum only (never process name, title, or URL); persisted toggle in settings
- **`signals.*` IPC handlers** — `signals.importCalendar` (import + start poll + audit), `signals.setFocusAppTracking` (toggle + audit), `signals.getStatus`
- **`suggest.insights` IPC handler** — aggregates accept/dismiss counts and 24-bucket per-hour histograms per kind from full history; joins learned weights and active pauses; returns `byKind[]` sorted by total interactions
- **`suggest.resetLearning` IPC handler** — clears weights, pauses, and calendar events tables; triggers immediate `recomputeWeights` (produces zero baseline)
- **`briefing.showEventPrep` tool** — `tier=confirm`; sends `briefing:show` IPC event with `type=event-prep`
- **Settings → Assistant → Suggestion Insights** — per-kind cards with accept/dismiss counts, accept rate bar, learned weight indicator (TrendingUp/TrendingDown/Minus), 24h heatmap (accept=violet / dismiss=rose), cooldown countdown badge; calendar ICS file import UI; focus-app tracking toggle; reset learning with confirmation flow

**Intentional gaps (to resolve in M12+):**

- Per-time-of-day generator shift is not implemented — the spec describes shifting `MorningBrief`'s time window when the user consistently dismisses it at 06:00 but accepts it at 08:30; this requires reading the `dismissByHour` heatmap at generator invocation time and is deferred
- Calendar recurrence (RRULE) is not parsed — only single-instance VEVENT blocks are imported; recurring meetings (daily standups, weekly reviews) will not appear unless the ICS file expands them to individual events
- `briefing.showEventPrep` emits the `briefing:show` IPC event but `HomeScreen.tsx` has no handler for `type=event-prep` — the renderer needs an event-prep card component to display the event title and a preparation prompt
- Focus-app tracking uses a synchronous `execSync` PowerShell call on a 60s interval — this blocks the Node event loop briefly; it should be refactored to `execFile` with a callback or moved to a background worker
- The auto-lift escape hatch described in the spec ("if 3+ kinds paused, auto-lift oldest pause") is not implemented — in the current code all pauses run their full 24h regardless of how many kinds are simultaneously suppressed
- Learned weights are recomputed nightly but the suggestion engine reads them fresh on every tick — there is no in-memory cache, so the `getAll()` DB read fires 60 times per hour; acceptable at current scale but worth caching if suggestion history grows large

---

## Architecture principles

- **Deterministic over autonomous** — the model classifies, extracts, summarizes, ranks. Application code handles scheduling, persistence, tool execution, and safety enforcement.
- **Three-tier permission model** — `safe` (auto-run + audit), `confirm` (one-click sheet, undoable), `restricted` (typed CONFIRM, never auto-proposed)
- **Local-first privacy** — file paths in the event log; file contents only in opted-in Knowledge spaces; zero outbound telemetry; focus-app tracking opt-in with enum-only audit values
- **Small-model-friendly** — bounded prompts, explicit JSON schemas, one-retry rule, graceful Ollama-offline fallback on every surface
- **No cross-package leakage** — renderer never imports `better-sqlite3`, `chokidar`, or `fs`; workers never import React; `core-domain` depends only on Zod

### Refinement pass — UX, UI & functionality polish ✅

- **Activity JSON crash fix** — `safeParseJson` helper wraps all `payloadJson` parsing; `PayloadDetailView` component renders key/value pairs naturally instead of raw `<pre>` JSON
- **`assistant.deleteSession` IPC handler** — deletes `conversation_turns` rows and clears the in-memory session history map; thread delete UI on `AssistantScreen` with inline confirm + toast
- **Conversation context window widened** — turn history slice extended from 6 → 10; DB fetch limit raised from 12 → 20
- **Weather geocoding** — `geocodeCity(city, country?)` in `core-weather` hits Open-Meteo geocoding API; `weather.setLocationByCity` IPC op saves resolved lat/lon + label; `WeatherScreen` replaces lat/lon fields with "City" + optional "Country code" inputs; geocoding loading state disables the save button during the call
- **Markdown renderer expanded** — `markdown.tsx` now handles fenced code blocks (with basic keyword highlighting), ordered lists, blockquotes, tables, horizontal rules, nested bullets, and `[text](url)` links; system prompt updated to allow markdown formatting
- **Markdown applied across surfaces** — briefing cluster summaries, Knowledge chunk previews, assistant message bubbles, news article summaries + AI analysis sections, and news cluster labels all render through `renderMarkdown`
- **News screen improvements** — summary clamp raised to 3 lines with animated expand toggle; video support in article reader (`<video>` for direct URLs, `<iframe>` for YouTube embeds); `NewsItemCard` extracted to its own component
- **Spotlight redesigned as in-app modal** — `SpotlightModal` variant added to `SpotlightApp.tsx`; `AppShell` renders it as an `AnimatePresence` overlay at high z-index with blur backdrop; main process global shortcut now sends `global-shortcut: spotlight.open` IPC event to renderer instead of opening a separate `BrowserWindow`
- **OllamaBanner recovery states** — `retryState` cycle (`idle → checking → success/failed → idle`) with contextual labels; post-retry `ollama.getStatus` probe confirms actual connectivity before showing "Connected!"
- **AI assistant intelligence** — system prompt additions: ask one clarifying question on ambiguous input; resolve pronouns/references from conversation history; session summary upserted to `sessions` table after each turn and passed as context in future turns
- **Suggestion action chip** — `describeSuggestedAction` helper on `HomeScreen` safely parses `proposedActionJson` and renders a small accent chip showing action type and key params
- **Agent loop + router hardening** — `core-ai` agent loop and router received significant improvements to structured output validation and retry logic

### Milestone 12 — Quality hardening ✅

- **`crash_stats` table** — rolling 30-day `crash`/`error` entries keyed by module; purged on startup; `CrashStatsRepo` with `record`, `getSummary`, `getTotalCount`, `purgeStale`, `clear`
- **Crash reporter late-binding** — `setCrashStatRecorder` wires the DB recorder after initialization so uncaught exceptions before DB init are still logged to file; `extractModule` derives a readable path from stack frames
- **`system.getCrashStats` + `system.clearCrashStats` IPC ops** — returns 30-day per-module summary with crash/error counts and last-seen timestamp
- **Settings → Privacy crash stats card** — shows per-module rows with counts and relative timestamps; Clear button; "local only" label
- **`packages/test-e2e/`** — new Playwright package: global setup/teardown with isolated `AURALITH_DATA_DIR`, `test.extend` fixture launching the packaged Electron binary, page objects (`HomePage`, `AssistantPage`, `SettingsPage`, `RoutinesPage`)
- **8 E2E spec files** — startup perf budget (2.5s), assistant chat + offline graceful degradation, knowledge space creation, routines editor, voice settings a11y, suggestion cards, offline mode, and a full axe-core WCAG 2AA scan across 5 screens + settings
- **Soak spec** — 4-hour idle run navigating screens every 5 minutes, verifiable in nightly CI
- **`.github/workflows/e2e.yml`** — nightly 02:00 UTC + manual dispatch; uploads Playwright HTML report; optional 4-hour soak job
- **CI bundle-size gate** — renderer JS gzip budget of 1.2 MB added to `ci.yml` post-build step

**Intentional gaps:**

- SQLCipher encryption is not implemented — the DB remains unencrypted at rest; SQLCipher requires native bindings and a key management strategy not yet designed
- Compact density mode is deferred to a later update
- E2E specs require the packaged binary (`pnpm build` first) — they cannot run against the dev server due to Electron fixture limitations
- Perceptual diff baselines (screenshot regression) are not set up — the spec scaffolding uses `screenshot: 'only-on-failure'` but no baseline images are committed

### Milestone 13 — Light mode, mini window, advanced retention ✅

- **`ThemeProvider` + `useTheme` hook** — `dark` / `light` / `system` modes; persisted to `settings['appearance.theme']`; resolved mode written to `settings['appearance.resolvedTheme']` so the main process can sync the native titlebar
- **Dynamic titlebar color** — `updateTitlebarColor()` in `settings.handler.ts` updates all `BrowserWindow` instances via `setTitleBarOverlay` + `setBackgroundColor` on every `appearance.resolvedTheme` setting change; startup restores from persisted value
- **`.light` CSS class** — completes the stub in `css-vars.css` with full light-mode overrides: backgrounds (#f4f4f8 / #eaeaf0 / #e0e0ea), text, borders, glass surface, accent, and all semantic state colors tuned for light-bg readability
- **`AppearanceSection` rebuilt** — 3-option theme selector (Dark / Light / System) with icons; Liquid ether toggle; Reduce motion toggle (also sets `data-reduce-motion` attribute on `<html>`); Mini companion window toggle; all backed by live `settings.set` calls
- **Mini companion window** — always-on-top, frameless, transparent `BrowserWindow` (320×120, max 400×180); second Vite entry (`mini.html` / `mini.tsx`); `MiniApp` component shows current time + top open suggestion with Accept/Skip; draggable via `-webkit-app-region: drag`; opened/closed via `system.openMiniWindow` / `system.closeMiniWindow` IPC ops; toggle in Appearance settings
- **Advanced retention controls** — Settings → Privacy rebuilt with a 7-option retention selector (7d / 30d / 60d / 90d / 6mo / 1yr / forever); "Purge old entries now" button hitting `audit.purge`; explicit list of what the policy covers; Knowledge index excluded from retention (managed separately via Spaces)
- **All existing settings screens migrated** to `var(--color-text-*)` and `var(--color-border-*)` CSS variables so they respond to light/dark switching

**Intentional gaps:**

- Light mode is not applied to the liquid ether WebGL background — the shader palette (obsidian/violet/cyan) is dark-mode-only; in light mode the ether should auto-disable or use a lighter palette
- The mini window does not receive the active theme — it always renders in dark glass style; a `ThemeProvider` wrapping `MiniApp` and reading the resolved theme from settings would fix this
- `data-testid` attributes referenced in E2E specs are not yet added to all components — specs will require these to be present before they can pass in a real run
- Compact density mode is not implemented — AppearanceSection notes it as "planned for a future update"

## Product direction

Auralith targets Windows 11. Future work is focused on deeper Windows integrations rather than a macOS port.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and layering rules
- [CONTRIBUTING.md](CONTRIBUTING.md) — dev workflow and conventions
- [docs/decisions/](docs/decisions/) — architectural decision records (ADR 0001 monorepo layout, ADR 0002 electron-vite)
