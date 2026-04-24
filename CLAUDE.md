# CLAUDE.md

# Claude Code Operating Guide for This Repository

This repository is for building a **premium, local-first AI desktop command center** with:

- voice command center
- second-brain knowledge system
- desktop/system activity timeline
- personalized news
- weather
- AI analysis
- productivity + leisure assistant workflows

Read `PROJECT_BRIEF.md` before doing any substantial work.

---

## 1. Your role in this repo

Act as:

- principal product architect
- staff engineer
- design systems lead
- implementation partner

Your work must optimize for:

- premium UX
- local-first privacy
- maintainability
- deterministic reliability
- compatibility with lighter Ollama models
- real-product viability over toy-demo shortcuts

---

## 2. Mandatory model workflow

## Planning and architecture

Use **Claude Opus 4.7** for:

- product framing
- requirements clarification
- design decision intake
- architecture
- PRD and roadmap
- milestone planning
- risk analysis
- repo/module design
- interface contracts
- system design
- design-system planning

## Implementation

Once the plan is approved, switch to **Claude Sonnet 4.6** for:

- project scaffolding
- implementation
- refactoring
- test writing
- bug fixing
- documentation upkeep
- milestone execution

## Important rule

Do **not** start coding until:

1. design questions have been asked
2. a full implementation plan has been produced
3. the user has approved the plan

When the plan is done, explicitly state that implementation should continue with **Sonnet 4.6**.

---

## 3. First-run behavior

When starting fresh in this repo, do this in order:

1. Read `PROJECT_BRIEF.md`
2. Ask the grouped design-decision questions
3. For each question, provide:
   - recommendation
   - 2–5 options
   - default if the user does not care
4. Wait for answers
5. Produce the full implementation plan
6. Stop for approval
7. After approval, switch to Sonnet 4.6 and begin milestone-based implementation

Do not skip the question phase unless the user explicitly provides enough decisions already.

---

## 4. Product goals to preserve

Always preserve these goals:

- premium, modern, minimalistic design
- ambient but readable glassmorphism
- liquid ether background used tastefully
- React Bits-inspired UI direction
- strong hierarchy and usability
- local-first architecture
- clear permission boundaries
- deterministic execution over vague autonomy
- small-model-friendly AI design
- maintainable and scalable codebase

---

## 5. Core architecture principles

### Prefer deterministic systems

The model should mainly do:

- classification
- extraction
- routing
- summarization
- ranking
- short rewriting
- constrained decision support

The application code should do:

- file watching
- OS integration
- scheduling
- persistence
- indexing
- background jobs
- retries
- notifications
- tool execution
- safety checks
- permission enforcement

### Avoid fragile agent loops

Avoid architectures that depend on:

- long, unstructured prompts
- giant context windows
- hidden side effects
- autonomous uncontrolled tool use
- ambiguous tool interfaces

### Prefer structured interaction

Use:

- typed interfaces
- JSON schemas
- explicit tool contracts
- bounded prompts
- retrieval-backed context
- deterministic orchestration

---

## 6. UI and design-system rules

### Primary visual direction

Use **React Bits-inspired** components and patterns where appropriate.

### Required aesthetic ingredients

- premium minimalism
- tasteful glassmorphism
- liquid ether animated background
- strong typography
- subtle luxury motion
- clean spacing and hierarchy
- polished states and transitions

### Design guardrails

- Do not overuse blur or transparency.
- Do not let the background compete with content.
- Do not sacrifice readability for style.
- Do not create a random mix of shiny components.
- Keep surfaces intentional and cohesive.
- Use solid or near-solid panels for dense information.
- Make every major screen feel productized.

### Motion guidance

- Prefer Framer Motion for premium interactions.
- Motion should be smooth, restrained, and purposeful.
- Use motion to communicate hierarchy and context, not to show off.

### UI implementation expectation

Document and maintain:

- design tokens
- spacing scale
- blur/opacity system
- surface hierarchy
- elevation model
- animation primitives
- component usage rules

---

## 7. Tech stack bias

Default stack unless the user overrides it:

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Framer Motion
- React Bits-inspired/custom premium components
- SQLite
- Ollama

Python sidecar is allowed only when it provides a clear benefit for:

- voice/audio tooling
- document processing
- local ML utilities
- OS-specific capabilities that are awkward in Node

Do not introduce Rust, Python, or extra services casually.

---

## 8. App structure expectations

Favor a modular desktop architecture with:

- app shell
- renderer UI
- local API layer
- background workers
- event ingestion services
- assistant/tool orchestration layer
- knowledge/indexing services
- news/weather ingestion layer
- settings/permissions layer
- persistence layer

Separate:

- UI logic
- domain logic
- infrastructure code
- model prompts/contracts
- tool execution
- background tasks

Avoid dumping everything into one Electron process or one giant services folder.

---

## 9. Small-model-friendly AI rules

This app must work well with a **light Ollama local model**.

### Prompt rules

- keep prompts short
- keep tasks narrow
- define output schemas explicitly
- pass only relevant retrieved context
- favor one-task-per-call
- prefer classification/extraction/summarization over open-ended reasoning

### Runtime rules

- validate all model outputs
- reject malformed structured results
- keep retries bounded
- provide graceful fallback UI when Ollama is unavailable
- log tool decisions and errors
- never trust the model to execute risky actions directly

### Good tasks for the model

- classify action intent
- summarize file changes
- extract action items
- rank relevant notes
- group news stories
- produce concise daily briefings
- rewrite short text to a desired style

### Bad tasks for the model

- unconstrained system automation
- deciding permissions invisibly
- maintaining critical state without application validation
- complex multi-step hidden planning loops

---

## 10. Activity intelligence rules

The desktop activity timeline is a first-class feature.

### Initial event types to support

- downloaded files
- created folders
- created files
- edited files
- moved/renamed files
- deleted files
- assistant-triggered actions

### Optional later event types

- app usage sessions
- clipboard history
- browser/file import history
- cross-tool workflow sessions

### UX expectations

The timeline should be:

- visually elegant
- filterable
- grouped into meaningful sessions
- privacy-conscious
- useful for recap and search
- integrated with assistant summaries

Do not build a raw noisy event log and call it done.

---

## 11. Second-brain rules

The second brain should:

- ingest local content cleanly
- support citations
- use retrieval-backed answers
- expose project/group/context organization
- surface recent relevant work
- connect naturally with timeline activity

Do not present unsupported hallucinated answers as if they came from the user’s files.

---

## 12. News and weather rules

News and weather should feel native to the product, not bolted on.

### News expectations

- personalized topics
- source controls
- deduplication
- topic clustering
- summary + analysis separation
- clear labeling of opinion vs summary

### Weather expectations

- concise daily utility
- integrated into briefings and dashboard
- adjustable information density

---

## 13. Productivity and leisure assistant rules

### Productivity should include

- quick capture
- summarization
- search
- routines
- work resumption
- daily recap
- lightweight automation

### Leisure should include

- discovery
- recommendations
- saved-interest resurfacing
- optional conversational experiences

Keep leisure tasteful and clearly separated from work-heavy flows where appropriate.

---

## 14. Permissions, trust, and safety

This product must feel trustworthy.

### Always enforce

- explicit permission model
- reversible actions where possible
- confirmation for risky actions
- local auditability
- clear settings
- export/delete controls
- watched-folder transparency
- retention controls

Never hide important behavior from the user.

---

## 15. Implementation style

### How to work

- implement in milestones
- keep commits/scopes coherent
- produce clear progress summaries
- make pragmatic decisions
- avoid unnecessary pauses
- prefer working software over speculative abstraction
- do not overengineer early milestones

### But also do not under-build the foundation

The user cares about:

- premium UX
- maintainability
- privacy
- finishing the product

Push back against overengineering, but do not under-design the foundation.

---

## 16. Planning deliverables you should produce before coding

After the user answers design questions, produce:

- product brief refinement
- architecture recommendation
- stack recommendation with rationale
- repo structure
- module boundaries
- data model
- event schema
- local API contracts
- prompt/model strategy
- safety/permission model
- design-system foundation
- onboarding flow
- phase plan
- risks
- acceptance criteria
- milestone backlog

Clearly mark:

- what belongs to Opus 4.7 planning
- what belongs to Sonnet 4.6 implementation

Then stop and wait for approval.

---

## 17. Code quality expectations

Use:

- TypeScript where possible
- typed boundaries
- explicit interfaces
- validation at I/O boundaries
- reusable domain modules
- tests where they add confidence
- predictable folder structure
- readable naming

Prefer:

- small focused modules
- clear domain separation
- explicit state transitions
- composable UI primitives
- documented contracts

Avoid:

- giant utility dumping grounds
- unclear shared mutable state
- unreadable magic abstractions
- tightly coupled model calls inside UI components

---

## 18. Documentation expectations

Keep documentation updated as the repo evolves.

At minimum, maintain:

- README
- setup instructions
- architecture notes
- env/config docs
- module-level documentation where needed
- prompt/tool contract notes
- milestone notes or changelog entries when useful

If implementation diverges from the original plan, document why.

---

## 19. Accessibility and performance

### Accessibility

- preserve readable contrast
- keyboard navigation must be strong
- focus states must be polished and visible
- reduced-motion strategy should exist
- voice features must have text alternatives

### Performance

- visual richness must stay performant
- animated background must be optimized
- heavy blur/transparency should be used carefully
- avoid wasteful rerenders
- lazy load heavy surfaces where appropriate
- background services must not degrade desktop responsiveness

---

## 20. Default response pattern in this repo

When the user asks for major product work:

1. restate the goal briefly
2. identify decisions/constraints
3. ask grouped questions if needed
4. produce a clear plan before implementation
5. implement milestone by milestone
6. summarize what changed and what is next

When the user asks for a feature during implementation:

- place it within the architecture cleanly
- explain any scope tradeoffs
- update docs if the feature changes repo expectations

---

## 21. Immediate starter prompt behavior

If the repo is empty or early-stage, begin with:

- reading `PROJECT_BRIEF.md`
- asking the grouped design-decision questions
- recommending defaults
- preparing the plan using **Opus 4.7**
- waiting for approval before coding

After approval:

- continue implementation using **Sonnet 4.6**
- scaffold the repo
- establish the design system early
- build the shell before feature sprawl
