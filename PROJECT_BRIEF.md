# PROJECT_BRIEF.md

# Project Brief — Local-First AI Desktop Command Center

## Working title

**Auralith**  
Alternative directions to explore during discovery: **EtherDesk**, **Glassmind**, **Nexa Local**, **Halo OS**, **Lumen Desk**.

---

## 1. Product vision

Build a **single, premium-feeling, local-first AI desktop app** that combines:

1. a **local voice command center**
2. a **second-brain knowledge app**
3. a **live desktop/system activity intelligence layer** that visually shows file and folder changes
4. **personalized news delivery** for topics chosen by the user
5. **weather**
6. **AI analysis of news and developments**
7. a **full AI-powered desktop assistant** for productivity and leisure tasks
8. all of the above **integrated and centralized under one polished app**

The product should feel like a **premium AI operating layer for the desktop**: calm, futuristic, polished, minimal, fluid, and visually impressive without becoming noisy or gimmicky.
It is explicitly a **Windows-only desktop product**, and feature planning should prefer Windows-native capabilities over cross-platform parity.

---

## 2. Product principles

### Must-have principles

- **Local-first by default**
- **Premium UX is mandatory**
- **Deterministic systems over agent magic**
- **Light Ollama model compatibility**
- **Clear permissions and reversibility**
- **Maintainable architecture**
- **Readable, tasteful visual effects**
- **Strong offline behavior**

### AI behavior principles

The local model should mainly handle:

- classification
- extraction
- routing
- summarization
- ranking
- short rewriting
- light reasoning over bounded context
- simple planning under constraints

Deterministic application code should handle:

- file watching
- OS integration
- scheduling
- notifications
- indexing pipelines
- persistence
- caching
- tool execution
- safety checks
- permissions
- background processing
- retry/fallback logic

---

## 3. User experience goals

The app should feel like a **high-end desktop product**, not a generic dashboard and not a toy demo.

### UX goals

- elegant first-launch experience
- strong typography and spacing
- smooth motion and transitions
- polished command palette
- beautiful visual timeline of system activity
- rich but restrained glassmorphism
- ambient liquid ether background
- clean onboarding and permission flow
- quick access to assistant, knowledge, timeline, news, and weather
- keyboard-first and voice-friendly interaction

### Emotional qualities

- calm
- premium
- ambient
- capable
- trustworthy
- private
- modern
- refined

---

## 4. Visual direction

### Core UI direction

Use **React Bits-inspired** components and patterns as a primary visual foundation where appropriate.

### Required aesthetic characteristics

- **glassmorphism** on selected surfaces
- **liquid ether-style animated background**
- premium modern minimalism
- polished microinteractions
- subtle but luxurious motion
- strong hierarchy and readability
- layered floating surfaces for key panels
- cohesive design system, not a collage of fancy effects

### Visual rules

- Do not let blur/transparency hurt usability.
- Use frosted glass for important elevated surfaces, not everywhere.
- Use solid or nearly-solid surfaces when density or legibility matters.
- Keep motion smooth and intentional.
- Keep the background ambient, not attention-stealing.
- Prioritize a “productized” feel over dribbble-shot excess.

### Likely style blend

- 50% calm premium desktop software
- 30% soft futuristic atmosphere
- 20% command center clarity

---

## 5. Core feature pillars

## 5.1 Command center

A unified assistant entry point for voice and text.

### Capabilities

- command palette
- typed assistant
- voice assistant
- tool invocation
- safe action confirmations
- shortcuts, routines, and automations
- context-aware suggestions
- session continuity

---

## 5.2 Second brain

A local knowledge and retrieval layer over user content.

### Sources to support over time

- local folders
- notes
- markdown
- txt
- PDFs
- screenshots
- bookmarks
- browser exports
- email exports
- calendar exports

### Core behaviors

- local ingestion
- indexing
- semantic search
- hybrid retrieval
- citations
- project grouping
- recent work awareness
- timeline-aware knowledge surfacing

---

## 5.3 Desktop activity intelligence

A visually appealing activity layer that shows what changed on the system.

### Examples of events

- files downloaded
- folders created
- files created
- files moved
- files renamed
- files deleted
- files edited
- apps launched
- assistant-triggered actions
- optionally clipboard history
- optionally active app sessions

### UX outcomes

- "What changed today?"
- "Show me files downloaded this morning"
- "Summarize recent project activity"
- "What did I create in the last 3 days?"
- visual work sessions and activity clusters

---

## 5.4 News and weather

A personalized daily intelligence layer.

### News capabilities

- topic subscriptions
- trusted-source preferences
- region/language controls
- deduplication
- topic clustering
- summaries
- AI analysis
- morning/evening briefings

### Weather capabilities

- current weather
- short forecast
- practical daily briefing
- optional severe-weather emphasis

---

## 5.5 Productivity and leisure assistant

A general assistant layer for useful daily workflows.

### Productivity examples

- summarize selected text
- summarize clipboard
- search files
- search notes
- organize downloads
- create note
- daily brief
- end-of-day recap
- reminders
- routines
- project summaries
- resume work context

### Leisure examples

- curated reading/watch/play suggestions
- hobby idea generation
- “interesting things from your saved knowledge”
- weekend briefing
- low-pressure conversational mode

---

## 6. Target architecture direction

### Recommended shell

**Electron** for v1, unless discovery reveals a strong reason to prefer Tauri.

### Why

This product needs strong desktop integrations:

- background services
- file watchers
- notifications
- tray behaviors
- voice workflows
- system event collection
- updater/distribution support
- rich local APIs

Electron is likely the fastest, least fragile path to a real desktop product for v1.

### Suggested stack

- **Electron**
- **React**
- **TypeScript**
- **Vite**
- **Tailwind CSS**
- **Framer Motion**
- **shadcn/ui**
- **React Bits-inspired UI patterns/components**
- **SQLite**
- **Ollama** for local model integration
- **Node-based background services**
- optional **Python sidecar** only when genuinely beneficial

---

## 7. AI and model strategy

### Primary local model assumptions

The app must work with a **light Ollama local model**.

### Design implications

Prompts should be:

- short
- highly structured
- task-specific
- constrained
- schema-driven
- retrieval-backed

### Preferred AI patterns

- JSON outputs
- explicit tool schemas
- bounded-context prompts
- model only decides within constrained options
- deterministic execution layer
- clear fallback when Ollama is unavailable

### Avoid

- giant context dumps
- vague agent loops
- open-ended autonomous behavior
- hidden side effects
- fragile chain-of-thought-dependent flows

---

## 8. Home screen vision

The home experience should feel like a **premium AI command deck**.

### Likely regions

- top global command bar
- left navigation rail
- central adaptive dashboard
- right contextual assistant / details pane
- ambient background layer
- lightweight status surfaces

### Home content examples

- daily briefing
- key news cards
- weather strip
- recent activity summary
- second-brain resurfacing
- quick actions
- ongoing session state
- suggestions based on recent work

### Modes to evaluate

- calm ambient cockpit
- high-information command center
- adaptive hybrid based on user preference

---

## 9. Proposed information architecture

### Core sections

- Home
- Assistant
- Activity
- Knowledge
- News
- Weather
- Automations
- Settings

### Supporting surfaces

- command palette
- quick action overlay
- global search
- details drawer
- notification center
- onboarding
- permissions center

---

## 10. Security and privacy posture

### Defaults

- local-first
- explicit permissions
- transparent data flows
- event retention controls
- redaction controls
- export/delete support
- local audit log
- privacy-friendly defaults

### Sensitive areas requiring clear design

- clipboard history
- app usage tracking
- watched folders
- downloaded files
- assistant-triggered actions
- any optional external feeds/services

---

## 11. MVP definition

The MVP must feel coherent, attractive, and truly useful.

### MVP should include

- desktop shell
- polished navigation and design system foundation
- command palette
- typed assistant
- Ollama integration
- core tool registry
- second-brain ingestion for local files/docs
- citations
- selected-folder and downloads activity timeline
- personalized news topics
- weather
- AI briefings
- settings and permissions
- fallback behavior when model is unavailable

### Defer if needed

- wake word
- clipboard history
- app usage tracking
- advanced automation
- mobile companion
- cloud sync
- graph visualization
- highly autonomous routines
- broad third-party integrations

---

## 12. Delivery approach

### Phase 0 — Discovery and design decisions

Output:

- decision log
- clarified scope
- product direction
- risk register
- approved architecture recommendation

### Phase 1 — Foundation and shell

Output:

- app shell
- design system
- navigation
- state architecture
- settings
- permissions
- local DB setup

### Phase 2 — Assistant core

Output:

- Ollama client
- prompt contracts
- tool registry
- structured outputs
- safe action execution
- logging/fallbacks

### Phase 3 — Second brain MVP

Output:

- ingestion pipeline
- indexing
- retrieval
- citations
- core knowledge UX

### Phase 4 — Activity timeline

Output:

- file watchers
- event normalization
- timeline UX
- privacy controls
- filters/grouping

### Phase 5 — Voice layer

Output:

- push-to-talk
- transcription
- response UX
- voice routing

### Phase 6 — News + weather + analysis

Output:

- personalized topics
- feeds ingestion
- summaries
- weather module
- briefing UX

### Phase 7 — Productivity workflows

Output:

- routines
- reminders
- quick actions
- end-of-day and resume-work flows

### Phase 8 — Leisure layer

Output:

- entertainment/recommendation surfaces
- weekend mode
- discovery UX

### Phase 9 — Proactive intelligence

Output:

- suggestion engine
- scheduled briefings
- automation triggers
- configurable notification behavior

### Phase 10 — Hardening and release prep

Output:

- security/privacy hardening
- performance optimization
- packaging/updater
- QA and release readiness

---

## 13. Key technical expectations for planning

The implementation plan should specify:

- recommended architecture with rationale
- repo structure
- package/module map
- local API boundaries
- database schema
- event schema
- ingestion pipelines
- indexing pipelines
- worker architecture
- model routing strategy
- prompt strategy for small local models
- caching strategy
- offline behavior
- fallback behavior when Ollama is unavailable
- safety model for action execution
- screen-by-screen breakdown
- component inventory
- phased milestone plan
- detailed implementation order
- testing and release strategy

---

## 14. Constraints

- Prioritize real-product viability over cleverness.
- Optimize for a light local Ollama model.
- Prefer deterministic systems over agentic complexity.
- Keep the UI premium from the start.
- Avoid premature complexity where simpler systems scale.
- Design with maintainability in mind.
- Keep glassmorphism and liquid ether tasteful and performant.
- Use React Bits-inspired UI intentionally, not blindly.

---

## 15. Mandatory planning workflow for Claude Code

### Planning phase

Use **Claude Opus 4.7** for:

- requirements clarification
- design-decision questions
- PRD creation
- architecture recommendations
- module boundaries
- roadmap and milestones
- risk analysis
- implementation planning

### Implementation phase

Use **Claude Sonnet 4.6** for:

- scaffolding
- coding
- refactors
- tests
- documentation updates
- milestone delivery

### Required behavior

- ask grouped design questions before final planning
- provide recommendation + options + default for each
- do not code before the plan is approved
- after plan approval, switch to Sonnet 4.6
- implement in small milestones with checkpoints
- maintain momentum and avoid unnecessary pauses

---

## 16. Initial design-decision groups to ask

### A. Platform and packaging

- Confirm the Windows-only scope and packaging strategy for v1 and beyond.
- Electron vs Tauri?
- desktop-only vs desktop + future mobile companion?
- local-only vs optional sync later?

### B. Product identity

- app name direction
- visual tone
- color direction
- density/spacing
- motion intensity
- typography
- calm vs high-tech emphasis

### C. Voice interaction

- wake word or push-to-talk?
- always-listening vs manual activation?
- transcription engine?
- TTS style?
- interruption behavior?
- confirmation style for risky actions?

### D. Desktop/system intelligence

- which events to track first?
- which folders to watch first?
- clipboard history?
- app usage tracking?
- event retention duration?
- privacy/redaction defaults?

### E. Second-brain behavior

- source types to support first
- knowledge model
- citation style
- RAG design
- semantic search/timeline/graph priorities

### F. News and weather

- preferred topics
- trust controls
- region/language
- summary depth
- analysis style
- opinionated takeaways or not
- weather detail level

### G. Assistant capabilities

- productivity actions first
- leisure actions first
- permission model
- proactive vs reactive behavior
- notification style
- routines/automations scope

### H. Security/privacy

- encryption
- audit log
- export/delete controls
- local telemetry
- permission UX

### I. Technical preferences

- TypeScript everywhere?
- Python sidecar?
- Rust?
- SQLite choice?
- testing coverage target?
- updater strategy?

### J. UI system specifics

- how far to push glassmorphism
- where liquid ether appears
- when to prefer solid panels
- motion strength
- Apple-luxury vs sci-fi-premium vs editorial-tech
- React Bits usage strategy
- acceptable extra UI libraries
- home screen: ambient cockpit vs command center

---

## 17. Success criteria

The product is successful when:

- it looks and feels premium immediately
- it gives the user real daily value
- it works locally with a lighter Ollama model
- it remains understandable and maintainable
- the assistant feels helpful without being chaotic
- the activity timeline is beautiful and useful
- the second brain provides trustworthy retrieval with citations
- news/weather/analysis feel integrated, not bolted on
- voice adds usefulness rather than friction
- privacy and permissions feel explicit and trustworthy
