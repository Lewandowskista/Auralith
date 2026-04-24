# Contributing to Auralith

## Prerequisites

- Node 20+
- pnpm 10+
- Windows 11 (primary dev platform for v1)
- [Ollama](https://ollama.ai) running locally for AI features

## Setup

```bash
git clone <repo>
cd auralith
pnpm install
pnpm dev
```

## Workflow

- Branch from `main`; use `feature/`, `fix/`, `chore/` prefixes
- One logical change per PR
- Pre-commit hook runs `lint-staged` (ESLint + Prettier on changed files)
- CI runs typecheck + lint + test + build on every PR

## Conventions

### TypeScript

- Strict mode everywhere (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Zod at every I/O boundary (IPC, DB reads, model outputs, external API responses)
- `type` imports preferred (`import type { Foo }`)
- No `any` — use `unknown` and narrow

### Packages

- New domain logic → new or existing `packages/core-*`
- Never import Node APIs in the renderer
- Never import React in workers or core packages
- Every public API goes through a package's `src/index.ts`

### Tests

- Vitest for unit + integration
- Test domain logic and prompt validators, not just UI
- Fixtures in `packages/test-utils`
- Run: `pnpm test` (root) or `pnpm --filter @auralith/<pkg> test`

### Commits

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Keep scope to a single milestone ticket (e.g., `feat(T3.5): hybrid retrieval with RRF`)

### Comments

- Write comments only for non-obvious WHY — not what
- No multi-paragraph docstrings; no inline changelogs

## Milestone gates

Each milestone has acceptance criteria in the plan. Do not start the next milestone before the current one passes its gate.

## Plan deviations

If you need to deviate from the approved plan, document it in `docs/decisions/` as an ADR before proceeding.
