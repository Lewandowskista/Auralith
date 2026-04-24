Auralith — Full Feature Review & Improvement Plan
Context
Auralith is a local-first AI desktop command center at c:\Users\Stefan\ProjectTank. Milestones M0–M13 are complete. The product is Windows-only and should lean into Windows-native capabilities rather than preserving cross-platform abstractions. It has a solid foundation: Electron + React + TypeScript, pnpm monorepo with 13 core-\* packages, Ollama integration with Zod-validated structured outputs, multi-turn tool chaining, RAG with hybrid FTS + vector search, activity timeline, proactive suggestions with EMA learning, voice PTT, routines DSL, crash telemetry, E2E suite, light/dark theme, mini companion window.

User's objective for this review: push Auralith toward "the ultimate AI-powered assistant with the most control possible." That reframes the product: the existing roadmap treated control as a danger (three-tier permissions, sandboxed tools, mostly-safe actions). The new goal treats control as a feature — but still behind explicit consent. So the plan below is less about new screens and more about widening the assistant's reach into the OS and web, deepening the knowledge layer, and tightening feedback loops so the user feels in command.

This is a review, not an implementation. The goal is a prioritized, scannable inventory the user can approve / reorder / veto before any code is written. Each item links to the concrete file(s) that would change.

How to read this document
Every item has:

Effort: S (≤0.5 day) / M (1–3 days) / L (4–10 days) / XL (2+ weeks)
Impact: how much it moves the product toward "ultimate control"
Why: the user-visible behavior change
Touches: the specific files/packages
Sections are ordered by a loose ROI ranking, not by milestone. At the end, § Recommended sequencing proposes a concrete three-wave rollout.

1. Current-state snapshot
   Verified against the code:

Layer Depth Notes
Assistant core Strong Multi-turn tool chaining (max 4 calls/turn, 30s budget) in turn-runner.ts; streaming tokens; per-session in-memory history + persistent conversation_turns table; abort support.
Tool library Thin ~15 tools across apps/desktop/src/main/tools/builtin/ (brain, email-mailto-only, files, filesystem, navigation, notes, system-ext clipboard, web.openUrl + web.search). No shell, no HTTP fetch, no browser automation, no screen capture, no window control.
Voice Functional but minimal PTT-only; Windows-only TTS; no VAD, no wake word, no barge-in, no streaming TTS. Intentional gaps documented in M8.
Automations Solid but flat Single-action routines only; no variable interpolation; no webhooks; hour:minute cron only.
Second brain Solid core, narrow surface MD/TXT/PDF only; no web clipper, no email, no browser history, no whole-doc summarization, no backlinks/graph.
Activity intel File-only No clipboard capture, no app-usage sessions, no window-focus history (FocusAppTracker exists but only feeds suggestions — not the timeline).
Suggestions Mature 12 generators, EMA ranker, cooldowns, calendar + idle + focus signals. Only surfaced on Home rail + tray badge — no toasts.
Home screen Static Greeting + briefing + suggestion rail + 4 fixed quick-access tiles. No widgets, no layout, no dashboard.
Design system Minimal 6 primitives (packages/design-system/src/): Button, Badge, KeyHint, Surface, EtherBackdrop, motion primitives. No charts, no tables, no split panes, no drag-drop, no tooltips, no dropdowns (ad-hoc inline).
Settings Good breadth 10+ tabs; ~70% user-configurable.
Shell Bare Single main window + mini companion; tray is Open/Quit + badge; no jump lists, no Windows Search participation, no notification toasts. 2. Quick wins (<1 day each)
These are low-risk, high-delight changes that make the product feel measurably more capable before any large work starts.

2.1 · Desktop toast notifications for suggestions
Effort: S · Impact: High
Why: The suggestion engine already produces ranked, tier-aware candidates every 60s, but they only appear if the user opens the app or notices the tray badge number tick. A native new Notification(...) on tier === 'confirm' suggestions (with click → focus window + scroll to card) makes the proactive layer actually proactive.
Touches: apps/desktop/src/main/signals/suggestion-bridge.ts (new), wire from SuggestionEngine.tick() result. Respect settings.suggestions.notificationsEnabled (new setting, default off, opt-in during onboarding).
2.2 · Conversation thread persistence & picker
Effort: S · Impact: High
Why: Turn history exists in conversation_turns (persistent) but the Assistant screen discards the session on reload. Add a thread list on the left (last 20, title = first user message truncated), "New thread" button, and persist activeThreadId in settings. Unlocks coming back to yesterday's investigation.
Touches: apps/desktop/src/renderer/screens/AssistantScreen.tsx, new assistant.listThreads / assistant.loadThread ops in apps/desktop/src/main/ipc/handlers/assistant.handler.ts.
2.3 · System prompt / persona customization
Effort: S · Impact: Medium-High
Why: Persona is hardcoded in buildSystemPrompt() (turn-runner.ts:49). A single textarea in Settings → Assistant, persisted to settings['assistant.personaOverride'], appended after the default prompt, costs almost nothing and gives the user a huge lever.
Touches: turn-runner.ts, apps/desktop/src/renderer/screens/settings/AssistantSection.tsx.
2.4 · Tool: shell.run (restricted tier, typed CONFIRM)
Effort: S · Impact: High
Why: The biggest single gap. Existing restricted tier already requires the user to type "CONFIRM" — reuse it. One tool that runs a PowerShell command, returns stdout+stderr+exitCode, always logs full command to audit. This unlocks 10× the automation surface without sacrificing safety.
Touches: new apps/desktop/src/main/tools/builtin/shell.ts, register in builtin/index.ts.
2.5 · Tool: web.fetch (safe, allowlisted)
Effort: S · Impact: High
Why: web.search returns DuckDuckGo results but the assistant cannot actually read any of them. Add a web.fetch(url) tool that pulls HTML, strips to readable text (use @mozilla/readability + jsdom — already reasonable for Electron main), caps at 100 KB, caches per-URL for 10 min. Safe tier with domain-blocklist (e.g., no file://).
Touches: new handler in apps/desktop/src/main/tools/builtin/web.ts.
2.6 · Keyboard shortcut reference (Ctrl+/ and ?)
Effort: S · Impact: Medium
Why: Shortcuts are scattered; the user has no map. Single modal listing all registered shortcuts with current bindings. Opens on ? when no input is focused.
Touches: new ShortcutsDialog component, single global keydown in AppShell.tsx.
2.7 · Rich tray menu
Effort: S · Impact: Medium
Why: Tray is Open/Quit + badge today. Add "Ask assistant…" (focus + open palette), open suggestions as sub-menu items (click → accept), "Start listening" (triggers PTT), "Today's activity" (opens Activity filtered to today).
Touches: apps/desktop/src/main/tray.ts (or wherever tray is built — check main/index.ts).
2.8 · Command palette: actions, not just navigation
Effort: S-M · Impact: Medium-High
Why: Today palette opens/closes via IPC but only routes to screens. Make it the single entry point for all commands: invoke any tool, start a routine, open a thread, search brain, toggle setting. Each provider registers via a client-side registry; palette shows results grouped. This is the "command" in "command center."
Touches: apps/desktop/src/renderer/components/CommandPalette.tsx.
2.9 · Home dashboard: one pinnable widget
Effort: S · Impact: Medium
Why: Low-ceremony first step toward a customizable home — let users pin a single free-form card (markdown note persisted in settings). Proves the widget framework before building the grid.
Touches: HomeScreen.tsx. 3. Expanding control — medium efforts (1–3 days each)
3.1 · Tool: browser automation via Playwright
Effort: M · Impact: Very High
Why: Reading one page is useful. Driving a browser — login-gated pages, filling forms, multi-step flows — is the single biggest capability unlock for a "do things for me" assistant. Ship Playwright's chromium in the installer (adds ~150 MB but it's worth it for this positioning), expose browser.open, browser.click, browser.type, browser.extract(selector), browser.screenshot. All confirm tier; log every action; show a small "browser is doing things" indicator in the tray.
Touches: new packages/core-browser/, new apps/desktop/src/main/tools/builtin/browser.ts.
Risk: Binary size + the assistant can now reach anything on the open web that the user is logged into. Mitigation: opt-in during onboarding; per-domain permission grants.
3.2 · Tool: screen capture + OCR
Effort: M · Impact: High
Why: The assistant currently has no "eyes." A screen.capture(region?) (safe, returns base64 + OCR'd text via Tesseract.js or bundled tesseract-binary) lets the user say "what's on my screen?" and unlocks workflows like "summarize the PDF I'm viewing" without re-uploading anything. Also enables error-message diagnosis.
Touches: new apps/desktop/src/main/tools/builtin/screen.ts, uses Electron's desktopCapturer.
3.3 · Full filesystem tools with proper sandbox UI
Effort: M · Impact: High
Why: Today the sandbox is Desktop/Documents/Downloads. Add files.list, files.delete (confirm), files.copy, files.search (glob), files.read (already exists) across arbitrary roots the user has granted. Make the permission grant explicit per root — today sandbox.ts is hardcoded. UI: "Grant access to folder…" button in Settings → Permissions with a native picker.
Touches: sandbox.ts, filesystem.ts, PermissionsSection.tsx.
3.4 · Clipboard history
Effort: M · Impact: Medium-High
Why: Listed in PROJECT_BRIEF as optional. A 100-entry rolling clipboard_history table, opt-in, clipboard-watcher polling every 1s, UI in Activity → Clipboard tab (blur-on-hover for security). The assistant gets clipboard.recent(n) as a tool.
Touches: new apps/desktop/src/main/clipboard/watcher.ts, new table migration in core-db/client.ts.
3.5 · Web clipper (browser extension + protocol handler)
Effort: M · Impact: High
Why: The biggest single widener of the knowledge base. Register auralith://clip?url=… protocol in main process; ship a tiny Chrome/Edge extension that posts current page HTML + selection to it; goes straight into a "Clippings" space with source URL preserved. Citation-ready.
Touches: main-process protocol registration, new tools/auralith-clipper/ extension, ingest adapter in core-ingest.
3.6 · Activity capture widening (app usage + window focus)
Effort: M · Impact: High
Why: FocusAppTracker already runs for suggestions but its output never reaches the events table. Emit an app.focus event each time the foreground bucket changes; add sessions grouped by app. Now "what did I work on today?" surfaces IDE/browser/docs time, not just file saves. Opt-in, bucket-only (already enforced).
Touches: apps/desktop/src/main/signals/focus-app-tracker.ts, event schema extension in core-events.
3.7 · Routines v2: variables, multi-step, and webhooks
Effort: M-L · Impact: High
Why: Current routines are one-shot single-action. Add: {{trigger.eventKind}} / {{trigger.path}} interpolation; ordered actions: ToolCall[] with pass-through context ({{step1.result}}); two new triggers — webhook (local HTTP server on random high port with user-copyable URL + secret) and ai (fires when assistant decides a routine applies). Multi-step plus webhooks = the assistant can be driven by anything with HTTP.
Touches: core-routines/src/engine.ts, core-routines/src/evaluator.ts, RoutineEditor.tsx.
3.8 · Home screen: widget grid
Effort: M · Impact: Medium-High
Why: After the single-widget quick win (§2.9), introduce a real grid: 3×N layout, drag-drop via @dnd-kit/core, pluggable widget types — Weather, News cluster, Recent activity, Active suggestion, Top brain hits for today, Custom markdown, Shortcut button, System stats (CPU/RAM), Upcoming calendar. Layout persists per user. Unlocks the "premium command deck" feel without rewriting screens.
Touches: HomeScreen.tsx, new packages/design-system/src/primitives/WidgetGrid.tsx, individual widget components.
3.9 · Design system: the missing primitives
Effort: M · Impact: High (enables everything else)
Why: Six primitives isn't enough for the product's ambition. Add in priority order: Dialog, DropdownMenu, Tooltip, Popover, Tabs (shadcn adapters — already in tech stack); then DataTable (tanstack/table), Chart (recharts, light theme-aware), Sparkline, SplitPane (allotment), ResizablePanel. Most future features need these; building ad-hoc keeps eroding cohesion.
Touches: packages/design-system/src/.
3.10 · NL query over activity ("what did I work on yesterday afternoon?")
Effort: M · Impact: High
Why: Activity is already queryable by filter chips but the assistant can't invoke it. Add activity.query(timeRange, kind?, text?) tool wired to existing EventsRepo.query. The assistant becomes the universal timeline interface: natural language in, ranked events + summary out.
Touches: new tool handler, reuse core-events query.
3.11 · Prompt library / reusable assistant commands
Effort: M · Impact: Medium-High
Why: A prompts table (name, template, defaults) + palette entries ("Summarize this page", "Extract action items", "Refine this email"). Each prompt ties to optional context providers (current clipboard, current selection, current page OCR). This is where the assistant transitions from chat to a toolkit.
Touches: new migration, new palette provider, new Settings → Prompts tab.
3.12 · Voice: VAD + barge-in
Effort: M · Impact: Medium
Why: Today PTT holds a hotkey; adding Silero-VAD (small WASM model) means natural endpointing — "release" is inferred. Barge-in: user pressing PTT during TTS cancels the speaking stream via TtsService.cancel(). Feels drastically more natural.
Touches: packages/core-voice/, PttManager, TtsService.
3.13 · Notification center screen
Effort: M · Impact: Medium
Why: Listed in PROJECT_BRIEF but not built. A log of every toast, briefing, suggestion, routine run, crash — with filters. This is the "what has my assistant done for/to me lately?" ledger, and it builds trust in proportion to how powerful the assistant gets.
Touches: new screen reading from audit_log + routine_runs + suggestions. 4. Big bets — larger efforts (1+ weeks each)
4.1 · Always-listening + wake word
Effort: L · Impact: High
Why: Ship an opt-in lightweight wake-word model (Picovoice Porcupine free tier, or openWakeWord WASM). Always-on VAD + wake-word → transcribe → assistant. Push-to-talk stays as the privacy default. This is the single biggest UX leap toward "Jarvis on your desktop."
Touches: core-voice, voice-orchestrator.
Risk: Always-listening raises the privacy bar. Mitigation: bright indicator pill in the titlebar whenever the mic is live; 100% local; all audio discarded post-transcription (already the pattern).
4.2 · Agent loop with planning & reflection
Effort: L · Impact: Very High
Why: The current turn runner caps at 4 tool calls / 30s. For "do this multi-step task and report back," add an opt-in "agent mode": a planner prompt produces a JSON plan (list of steps with expected tools), an executor iterates through steps with reflection after each ("did step N succeed? revise plan?"), a supervisor (cheap model) watches for loops / timeouts / budget. All planning steps visible to the user in a collapsible "thoughts" side panel; the user can pause/intervene/correct at any step. Use tool-allowlist per task.
Touches: new apps/desktop/src/main/assistant/agent-loop.ts, new AgentThoughtsPanel.tsx in AssistantScreen.
Risk: Cost of model time + autonomous action. Mitigation: hard step cap (configurable, default 15); budget (default 3 min wall-clock); tool-tier ceiling for agent mode (default safe+confirm, restricted always denied); the user can cancel at any step.
4.3 · Knowledge: everything-ingestion
Effort: L · Impact: High
Why: Widen the funnel. In priority order:
Browser history import (SQLite read of Chrome/Edge History, opt-in, dedup by URL, space = "Browsing")
Email via IMAP adapter (user provides creds; stored encrypted in keytar; OFF by default)
DOCX / HTML / EPUB parsers
Images with CLIP embeddings — search photos by description
Audio / meeting transcripts — drop an .mp3/.wav, get whisper transcription + summary
Touches: core-ingest + per-source adapters.
4.4 · Graph view + backlinks for the second brain
Effort: L · Impact: Medium-High
Why: A force-directed graph (react-flow or sigma.js) of docs ↔ chunks ↔ assistant mentions ↔ activity events. Click a node → details drawer. Solves "I know I read something about X, where was it?" when retrieval misses. Also reveals disconnected islands (docs never referenced).
Touches: new screen, reuses existing repos; precompute edges nightly.
4.5 · Automation marketplace (local)
Effort: L · Impact: Medium
Why: Ship 20 curated example routines as JSON under apps/desktop/resources/routines/examples/. User browses them in Automations → Browse. One click installs. Easy content-based way to show off routines v2.
Touches: resources folder, new AutomationsScreen tab.
4.6 · Multi-window workspaces
Effort: L-XL · Impact: Medium
Why: "Pop out" any screen into its own window (assistant, activity, a specific thread). Each window remembers position/size per display. Unlocks multi-monitor workflows — Assistant on one screen, work on another.
Touches: apps/desktop/src/main/index.ts window manager, per-screen router changes.
4.7 · Cross-device sync (local network only)
Effort: XL · Impact: Medium
Why: Opt-in LAN sync (syncthing-style or custom over libp2p/Noise). Keeps local-first while unlocking "start on laptop, continue on desktop." Syncs: settings, threads, routines, brain index metadata (not raw docs — they stay at source). This is the single feature that makes daily use across machines viable.
Risk: Large. Defer unless the user wants it specifically.
4.8 · OS-level global AI shortcut (Ctrl+Shift+Space anywhere)
Effort: L · Impact: High
Why: Register a global shortcut (already have Ctrl+Shift+Space for PTT — pick a different combo, e.g. Ctrl+Shift+A) that opens a minimal floating spotlight-style window at the cursor, accepts a quick command ("summarize selection", "what is this?"), executes, shows inline result, disappears. Uses Electron's hidden-always-on-top-transparent-window pattern already proven by the mini companion. This makes the assistant ambient — always one keystroke away, not just when the app is focused.
Touches: new apps/desktop/src/main/spotlight/ + new renderer entry similar to mini.html.
4.9 · Granular model routing
Effort: M-L · Impact: Medium
Why: Today one chat model + one embedder is configured. Add per-task model selection: classification uses llama3.2:3b, chat uses qwen2.5:7b, summarization uses phi-3, heavy reasoning uses whatever's local-and-big. Each task in core-ai/prompts.ts declares its preferred tier; settings tab lets users override per tier. Cheaper + faster for most ops.
Touches: core-ai, Settings → Ollama tab.
4.10 · Encrypted storage (SQLCipher)
Effort: L · Impact: Medium
Why: Listed as an intentional gap in M12. As the assistant grows wider (clipboard, browser history, email), encryption-at-rest becomes the minimum bar for a "privacy-trustworthy" claim. Key derived from OS keychain via keytar; migration path on first run.
Risk: SQLCipher bindings for better-sqlite3 can be fragile on Electron; budget time for the integration. 5. Polish & accessibility
Smaller items worth batching together:

Reduced-motion parity — confirm all new Framer Motion usage honors prefers-reduced-motion (pattern exists in primitives.tsx).
Focus visible on every interactive — existing Button does this; ad-hoc inline buttons across settings don't. Audit with axe-core E2E spec already in M12.
Light-mode liquid ether — noted as an M13 gap. Duplicate palette in shader, switch uniforms by theme.
Mini window theme sync — also an M13 gap, 30-min fix.
Empty-state illustrations — EmptyState exists but uses lucide icons; a single set of 6–8 custom SVGs would lift the premium feel.
Toasts everywhere — sonner is in the stack but under-used. Every tool execution outcome should toast (success/failure with "Undo" if applicable). 6. Telemetry & evaluation (user-facing only)
Latency budgets in-app — show the user per-operation timing (retrieval X ms, model Y ms, tool Z ms) in a "slow queries" view. Today traceId is logged but never surfaced.
Assistant quality feedback — 👍/👎 on each answer; optional comment; stored locally; surfaces in Settings → Assistant → Feedback history. This is the signal that would fund future offline fine-tuning if the user ever wanted it.
Self-diagnostics — a "Run checkup" button in Settings that pings Ollama, validates DB, re-plays the last crashed op if any, runs a sample RAG query, reports pass/fail. 7. Honest risks & decisions to make
How autonomous do you want the agent to be? §4.2 (agent loop) is the difference between "assistant that answers" and "agent that does." Recommend opt-in + hard budgets + visible plan. Default off.
Browser automation = large installer. §3.1 adds ~150 MB. The alternative is a "bring your own Chrome" CDP attach, which is finicky on Windows. Bundling is the right call if the goal is "ultimate."
Wake word = always-live mic. §4.1 needs a visual indicator the user cannot hide. Mitigates the creepiness well if done right.
SQLCipher is not free. §4.10 is the right move eventually but drags scope. Ok to land the control expansion first and encrypt later — the threat model is "laptop theft," and full-disk encryption already covers that on Windows 11.
Emails are a rabbit hole. §4.3 item 2 (IMAP) has huge surface area (OAuth for Gmail, app passwords elsewhere, spam, threading). Consider starting with read-only .eml drop-folder ingestion and deferring live IMAP. 8. Recommended sequencing
Three waves. Each wave is independently shippable and makes the product measurably better.

Wave 1 — Widen the assistant's reach (≈ 2 weeks)
Goal: the assistant can do 5× more without scope creep.

§2.4 shell.run (restricted, CONFIRM)
§2.5 web.fetch
§3.3 Full filesystem tools + grantable sandbox roots
§3.2 Screen capture + OCR
§3.10 Activity NL-query tool
§2.3 Persona override
§2.2 Thread persistence
§2.1 Desktop toast notifications
§2.6 Keyboard shortcut reference
§2.7 Rich tray menu
Wave 2 — Make the shell feel like a command deck (≈ 2 weeks)
Goal: the product looks and feels measurably more premium.

§3.9 Design-system primitives (Dialog/Tooltip/DataTable/Chart/SplitPane)
§2.8 Palette-as-command-center
§2.9 → §3.8 Widget dashboard on Home
§4.8 Spotlight floating window (global Ctrl+Shift+A)
§3.11 Prompt library
§3.6 Activity widening (app focus → events)
§3.4 Clipboard history
§3.13 Notification center
Polish batch (§5)
Wave 3 — True agent & deep knowledge (≈ 3–4 weeks)
Goal: cross the threshold from "assistant" to "agent" and broaden the brain.

§3.5 Web clipper + extension
§4.3 Ingestion wideners (browser history, DOCX, images, audio)
§3.1 Browser automation (Playwright)
§3.7 Routines v2 (variables, multi-step, webhooks)
§4.2 Agent loop with planning + reflection
§4.1 Wake word (opt-in)
§3.12 VAD + barge-in
§4.4 Knowledge graph view
§4.9 Per-task model routing
§4.5 Automation marketplace
Deferred / optional: §4.6 Multi-window workspaces · §4.7 LAN sync · §4.10 SQLCipher.

9. Verification
   Once waves are approved and implemented, validate end-to-end by:

Smoke test after each wave — run pnpm typecheck && pnpm build && pnpm --filter test-e2e test locally; the Playwright suite in packages/test-e2e/ already covers startup, assistant chat, knowledge, routines, voice settings, offline fallback, and axe-core WCAG 2AA. Extend it per wave:
Wave 1: add a spec invoking shell.run (dry) and web.fetch (against a fixture server); verify CONFIRM gating.
Wave 2: add a spec that opens the spotlight window, types a command, asserts inline result.
Wave 3: add an agent-loop spec that runs a 3-step canned plan against fake tools and asserts visible plan + cancellation works.
Manual dog-fooding checklist per wave — real ambient use for ≥3 days; watch crash_stats (Settings → Privacy), latency traces, and audit_log for surprises.
Permission audit — after Wave 1 and Wave 3, verify every new tool appears in Settings → Permissions with the correct default tier, and that restricted tools really require typed CONFIRM (existing ConfirmActionSheet flow).
Privacy review before Wave 3 ship — ensure clipboard history, screen OCR, browser history, and wake word all have explicit onboarding toggles, visible status indicators, and retention respecting the Advanced Retention controls from M13. 10. Critical files likely to change
High-churn areas across all waves:

apps/desktop/src/main/tools/builtin/ — most new tools
apps/desktop/src/main/assistant/turn-runner.ts — persona, agent loop
apps/desktop/src/renderer/screens/AssistantScreen.tsx — threads, agent thoughts panel
apps/desktop/src/renderer/screens/HomeScreen.tsx — widget grid
apps/desktop/src/renderer/components/CommandPalette.tsx — provider registry
packages/design-system/src/ — new primitives
packages/core-routines/src/ — routines v2
packages/core-ingest/src/ — new source adapters
packages/core-voice/ — VAD, wake word, barge-in
apps/desktop/src/main/index.ts — window manager, protocol handler, global shortcuts
Implementation, once the user approves this plan, should switch to Claude Sonnet 4.6 per CLAUDE.md §2.
