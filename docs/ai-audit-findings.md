# Auralith AI Infrastructure — Audit Findings Register

**Audit date:** 2026-04-27  
**Auditor:** Claude Sonnet 4.6  
**Scope:** M0–M13 codebase; AI infrastructure only (Ollama, voice, RAG, news, agent, context broker)

Severity scale: **Critical** > **High** > **Medium** > **Low**

---

## Area 1 — Safety & Prompt Injection

### F1.1 — DirectToolOutputSchema fallback can be reached silently (High)

**File:** `packages/core-ai/src/turn-runner.ts:102–112`

`parseTurnOutput` has three parse attempts in sequence. The third (DirectTool) parses any `{type: "<toolId>", params:{...}}` object and treats it as a tool call if the `type` field matches any registered tool ID. This fallback fires silently after both the structured schema and Llama-native schema fail. Because RAG chunks can contain arbitrary JSON (e.g., a code example containing `{"type":"screen.lock","params":{}}`), an injected payload could trigger this path and produce a tool call that bypasses the intent of the user's request. Tier checks happen in `executeTool` downstream, but by then the user-facing UI has already received a `toolCall` event.

**Fix:** Add a `console.warn` log when the DirectTool fallback fires. Additionally, do not allow `confirm` or `restricted` tier tools to be resolved via the DirectTool path — require them to match the primary `TurnOutputSchema` only.

---

### F1.2 — Agent loop passes all tiers to planner including `restricted` (Critical)

**File:** `apps/desktop/src/main/ipc/handlers/agent.handler.ts:110`, `packages/core-ai/src/agent-loop.ts:268–275`

`agent.handler.ts:110` calls `listToolsForModel()` with no tier filtering and passes the full result to `runAgentLoop`. The planner prompt receives the complete tool manifest, including tools with `tier: 'restricted'` (e.g., `screen.lock` in `system-lock.ts:8`, `shell` execution in `shell.ts:12`, `window.close` in `window-manager.ts:185`). `agent-loop.ts:268–275` validates that tool IDs exist in the manifest, but it does not check tier. The reflector prompt also has no tier awareness. A user prompt like "lock my screen and run a script" could produce a plan that directly executes restricted tools without additional confirmation.

`executeTool` itself does request confirmation for restricted tools via `deps.requestConfirmation`, so the final action is gated — but the plan is created and steps are persisted (including the tool ID and params) before any confirmation dialog appears, and the agent broadcasts the plan to the renderer, potentially revealing sensitive params.

**Fix:** In `agent.handler.ts`, filter the tool manifest before passing to `runAgentLoop` — strip tools where `tier === 'restricted'`. Optionally allow `confirm`-tier tools in the agent but ensure each step produces a visible confirmation before execution.

---

### F1.3 — XML body escaping is correct — no issue (Resolved)

**File:** `packages/core-ai/src/prompt-format.ts:123–165`

`xmlEscape` correctly escapes `&`, `<`, `>`, `"`, and `'` before they are placed in the body. `formatXmlBlock` calls `xmlEscape(body)` on the untrusted content before wrapping it. This finding is **closed** — the implementation is correct and injection-resistant.

---

### F1.4 — suggest.accept executes toolId from DB without live registry validation (Medium)

**File:** `apps/desktop/src/main/ipc/handlers/suggest.handler.ts:48–66`

`acceptSuggestionById` parses `proposedActionJson` from the `suggestions` table and calls `executeTool(action.toolId, ...)` directly. There is no check that `action.toolId` is a currently registered tool before the call. If a suggestion was created against a tool ID from a previous app version (e.g., `files.organize` renamed to `brain.organizeFiles`), the call silently fails at the executor level. The error is caught and logged, but the user sees "accepted" with no feedback.

**Fix:** Before calling `executeTool`, check `getTool(action.toolId)` from the registry. If not found, return `{ accepted: false, error: 'Tool no longer available' }` and set the suggestion to `dismissed` status.

---

### F1.5 — TOOL_CALL_V1 system prompt hardcodes tool prefixes (Low)

**File:** `packages/core-ai/src/prompts/role-prompts.ts:155–167`

The PC control section lists concrete tool prefixes (`app.launch`, `browser.navigate`, `screen.lock`, etc.) as hardcoded strings. This list will drift as tools are added or renamed. Currently it is accurate, but the risk grows with each new tool milestone.

**Fix (deferred):** In a future milestone, generate the PC control section dynamically from tools with `tier !== 'safe'` in the registry, filtered to known PC-control category prefixes.

---

### What's working well in Area 1

- Tier enforcement in `executeTool` is solid — all three tiers (`safe`, `confirm`, `restricted`) are handled, `restricted` always calls `requestConfirmation`.
- `PlanSchema.max(PLAN_STEP_LIMIT)` caps the agent plan at 15 steps.
- Tool ID validation in the agent loop (checking against `knownToolIds`) is present and would catch hallucinated tool names.
- `formatXmlBlock` correctly XML-escapes all untrusted article and document content.

---

## Area 2 — Runtime Reliability & Retry Logic

### F2.1 — Schema hint builder falls back silently for non-ZodObject schemas (Medium)

**File:** `packages/core-ai/src/runtime.ts:241–258`

The retry hint builder introspects `_def.shape` — only valid for `ZodObject`. For `ZodEnum`, `ZodArray`, `ZodDiscriminatedUnion`, and `ZodUnion` schemas, it falls back to emitting `contract.id` as the hint (e.g., `"route.classify.v1"` instead of `{"intent":"chat|tool|news|rag|coding|routine|settings|unknown","confidence":...}`). The contracts most affected are `ROUTE_CLASSIFY_V1` (discriminated output), `INTENT_CLASSIFY_V1` (ZodObject — fine), and `RewriteOutputSchema` (ZodObject — fine). The retry hint for `ROUTE_CLASSIFY_V1` is unhelpful, reducing the repair success rate for the classifier on which all assistant routing depends.

**Fix:** Extend the hint builder:

- `ZodObject`: current behaviour (field name → typeName map)
- `ZodEnum`: emit `{"allowed": [...values]}`
- `ZodArray`: emit `[<element hint>]` recursively
- Wrap in a try/catch per-branch so no new failure modes are introduced

---

### F2.2 — Reliability stats flush is wired correctly (Resolved)

**File:** `apps/desktop/src/main/index.ts:567`

`flushReliabilityToRepo(obsRepo)` is called at app startup with a 60-second interval. This finding is **closed**.

---

### F2.3 — stream() path in turn-runner bypasses AiQueue (High)

**File:** `apps/desktop/src/main/ipc/handlers/assistant.handler.ts:462–468, 281–284`

The assistant handler calls `sendQueue?.beginForegroundAiTask()` before the turn, and `sendQueue?.endForegroundAiTask()` in the `finally` block. However, the actual Ollama streaming call inside `runTurn` (`deps.chatClient.stream(...)`, turn-runner.ts:295) runs directly on the `OllamaClient` — it does not go through `enqueueForegroundAiTask`. This means the queue ref-count is correctly incremented (blocking background tasks), but if two concurrent `assistant.send` IPC calls arrive simultaneously (possible from renderer), both will call `stream()` on Ollama at the same time. With `fgConcurrency: 1`, the intent was to allow only one foreground Ollama call — this is not enforced for the stream path.

Additionally, `client.ts` has a 30-second timeout on `generate()` calls but **no timeout on `stream()`**. A hung stream (Ollama process deadlock or network drop mid-stream) will hold the `speaking`/`thinking` state forever.

**Fix:**

1. Wrap `runTurn(...)` in `sendQueue.enqueueForegroundAiTask(...)` instead of using the manual `begin/end` pattern, so concurrent calls are actually serialised.
2. Add a wall-clock timeout on the `for await` stream loop in `turn-runner.ts` — if the deadline is exceeded, break the loop and treat partial output as the response.

---

### F2.4 — Agent reflection failures are silently swallowed (Medium)

**File:** `packages/core-ai/src/agent-loop.ts:384`

```ts
} catch {
  // Reflection failed — continue with original plan
}
```

Reflection parse failures produce no log output and no state update. A model returning consistently malformed JSON for the reflection step will silently cause the agent to skip all reflection checkpoints and execute all remaining steps unconditionally. This defeats the safety mechanism of reflection (detecting runaway plans, failed steps, etc.).

**Fix:** Log the failure with `console.warn('[agent] reflection failed:', err)`. Track consecutive reflection failures; after 3 consecutive failures, set `state.status = 'failed'` with an appropriate error message.

---

### F2.5 — turn-runner correction retry at temperature=0 is correct and intentional (Resolved)

The original stream uses `temperature: 0.3` (creative/conversational), but the correction retry uses `temperature: 0` (deterministic/compliant). This is the correct design — the retry is specifically trying to force strict JSON format compliance, not produce a creative response. This finding is **closed**.

---

### What's working well in Area 2

- `client.generate()` has a 30-second timeout enforced via `AbortSignal`.
- `runPrompt()` retry logic is sound for `ZodObject` schemas — the hint is meaningful and the two-attempt pattern is well-structured.
- `STATS_MAP_MAX = 1000` prevents unbounded memory growth in the reliability stats map.
- `flushReliabilityToRepo` is correctly started at app boot with a 60s interval.
- `AiQueue.getStats()` is available for diagnostics.

---

## Area 3 — Prompt Contracts & Output Schemas

### F3.1 — INTENT_CLASSIFY_V1 is still live in one call site (Low)

**File:** `apps/desktop/src/main/ipc/handlers/observability.handler.ts:148–150`

`INTENT_CLASSIFY_V1` (5-label contract) is imported and used in `observability.handler.ts` — likely as a smoke test for the classifier model. It is not used in any live assistant routing path; all routing uses `ROUTE_CLASSIFY_V1`. The contract is not dead but is not serving a routing function. The label set mismatch (5 vs 8 labels) creates a maintenance hazard if anyone assumes it reflects the current routing behaviour.

**Fix:** In `observability.handler.ts`, replace the `INTENT_CLASSIFY_V1` smoke-test call with `ROUTE_CLASSIFY_V1` so the observability test validates the actual production contract. Then the `INTENT_CLASSIFY_V1` contract and its file can be safely deleted.

---

### F3.2 — NEWS_SYNTHESIS_V1 and DIGEST_PROMPT source_ids_used not post-validated (Medium)

**Files:** `packages/core-ai/src/prompts/role-prompts.ts:69`, `packages/core-news/src/prompts.ts`

Both news synthesis contracts declare `source_ids_used: z.array(z.string())`. Zod validates the type but not whether the values are real article IDs from the input. The model can hallucinate source IDs that don't correspond to any article in the digest input, causing citation links in the renderer to resolve to nothing or to the wrong article.

**Fix:** In the news pipeline and any caller of `NEWS_SYNTHESIS_V1`, add a post-validation step:

```ts
const knownIds = new Set(articles.map((a) => a.id))
const validSourceIds = output.source_ids_used.filter((id) => knownIds.has(id))
```

Log a warning if any IDs were filtered. Store only `validSourceIds`.

---

### F3.3 — TOOL_CALL_V1 message field has no length cap (Low)

**File:** `packages/core-ai/src/prompts/role-prompts.ts:113`, `maxTokens: 320`

The `message` field in `ToolCallOutputSchema` is `z.string()` with no maximum length. With `maxTokens: 320`, the model is unlikely to produce an extremely long message, but adding `z.string().max(800)` makes the constraint explicit and prevents edge-case IPC payload bloat.

**Fix:** Change to `z.string().max(800)` on the `message` field.

---

### F3.4 — ROUTE_CLASSIFY_V1 truncates from the front only (Low)

**File:** `packages/core-ai/src/prompts/role-prompts.ts:318`

```ts
;`Message: "${(message ?? '').slice(0, 800)}"\n\n...`
```

Front-only truncation works well when intent is stated at the start of the message. However, users who paste long text then ask a question at the end (e.g., a document paste followed by "summarise this") will have their question truncated away. The classifier then sees only document content and is likely to classify as `rag` when the actual intent might be `summarize`.

**Fix:** Use a centre-skipping truncation: take the first 400 and last 400 characters with a `…[truncated]…` join, preserving both the opening context and the closing intent signal.

---

### What's working well in Area 3

- All 14 active prompt contracts have `outputSchema: z.ZodType<TOut>` — no unvalidated model outputs reach application logic.
- `temperature: 0` is correctly set on all classification/extraction contracts; synthesis uses ≤0.3.
- `format: 'json'` is passed to Ollama in `runPrompt` for all contracts, enforcing JSON mode at the inference level.
- `cacheTtlMs` is appropriately set only on deterministic (temperature=0) contracts.

---

## Area 4 — App Context Broker

### F4.1 — Context budget is first-come-first-served with no intent-based priority (Medium)

**File:** `packages/core-ai/src/app-context/broker.ts:144–187`

Providers run via `Promise.allSettled` and results are processed in `allowedCapabilities` array order. If weather and news both return near the `maxForCap` limit (~800 chars each), they can consume ~1600 of the 4000-char budget before knowledge or activity context is evaluated. For a `rag` intent query, knowledge context is the highest-value signal — but it may be omitted due to budget exhaustion by lower-value providers.

The `resolveContextCapabilities` in `intent-router.ts` already routes by intent, but the budget allocation within those capabilities is not prioritised.

**Fix:** After filtering by capabilities, sort the `allowedCapabilities` array by an intent-specific priority map before processing. For `rag` intent: `[knowledge, activity, settings, news, weather, suggestions, routines]`. For `news` intent: `[news, weather, suggestions, ...]`. This is a small change in `broker.ts` and does not require modifying any provider.

---

### F4.2 — Settings provider does not expose personaOverride — no double injection (Resolved)

**File:** `packages/core-ai/src/app-context/providers/settings-context-provider.ts`

The settings provider surfaces: weather location, feature toggle states (news, activity, voice, briefing, leisure), and clipboard history toggle. It does **not** expose `assistant.personaOverride`. This finding is **closed** — no double injection risk.

---

### F4.3 — Provider error strings appear in prompt context (Low)

**File:** `packages/core-ai/src/app-context/broker.ts:145–148`, `broker.ts:210–231`

Rejected provider promises produce `Provider error: <String(reason)>` which is added to `allWarnings`. These warnings are then rendered into the prompt context section (via `buildPromptContextSection`) as `⚠ Provider error: ...` lines. This means internal error messages (stack traces, file paths, DB error strings) could end up in the model prompt.

The filter in `buildPromptContextSection:215–219` only includes warnings containing `stale`, `Refresh`, `missing`, or `excluded` — so generic `Provider error:` strings are actually filtered out before prompt injection. The risk is lower than initially assessed.

**Fix (low priority):** Log provider errors to the main process logger via `console.error`. The current filter already prevents them reaching the prompt, but the errors are otherwise invisible during operation.

---

### What's working well in Area 4

- Cloud model restrictions are correctly enforced — 6 of 7 active providers are excluded when `isCloudModel: true`.
- Provider isolation via `Promise.allSettled` is correct — one failing provider does not block others.
- Per-capability `maxContextChars` cap prevents any single provider from consuming the full budget.
- Staleness detection is implemented in all providers with appropriate thresholds.

---

## Area 5 — RAG Pipeline

### F5.1 — LLM reranker uses classifier model (phi4-mini, 1024-token ctx) for 24 candidates (Medium)

**File:** `apps/desktop/src/main/ipc/handlers/assistant.handler.ts:419–422`

```ts
createLlmReranker(embedClient, router.modelFor('classifier'))
```

phi4-mini has `num_ctx: 1024`. The default rerank pool is 24 candidates (`DEFAULT_RERANK_POOL = 24` in `hybrid.ts`). Each candidate includes its full chunk text. At typical chunk sizes (200–500 chars), passing 24 candidates would require 4800–12000 chars of context — well beyond the 1024-token window. The reranker likely receives severely truncated input, producing unreliable relevance scores that degrade retrieval quality rather than improve it.

**Fix:** Use `router.modelFor('rag')` (qwen3:8b, 6144 ctx) for reranking, or reduce `rerankPool` to 8 when using the classifier model. Since reranking is gated behind `settings.get('retrieval.reranker')` (default `false`), this is low urgency for most users — but critical when enabled.

---

### F5.2 — RAG chunk format in assistant.handler differs from rag-answer.ts citation format (Medium)

**File:** `apps/desktop/src/main/ipc/handlers/assistant.handler.ts:442–445`

```ts
ragContext = assembled.chunks
  .map((chunk) => `[${chunk.n}] (${chunk.path})\n${chunk.text}`)
  .join('\n\n---\n\n')
```

This plain text format uses `[n]` as the citation marker. The RAG system prompt (`rag-answer.ts:RAG_SYSTEM_PROMPT`) instructs the model to cite with `[^n]` (Markdown footnote syntax). These are different formats. The model will attempt to cite with `[^n]` but the context it receives uses `[n]` — a mismatch that causes citation extraction in `assembleCitations` to fail or produce mismatched references.

**Fix:** Either:

- Change the context formatting to use `[^n]` prefixes to match the citation instruction, **or**
- Use `buildRagUserPrompt` from `rag-answer.ts` (which uses mixed TOON/XML and `[^n]` consistently) for the streaming path as well.

The second option is cleaner as it unifies both the streaming and structured RAG paths.

---

### F5.3 — query-rewrite timeout is a Promise.race; the Ollama call continues after timeout (Medium)

**File:** `packages/core-retrieval/src/query-rewrite.ts:52–56`

```ts
const raceResult = await Promise.race([
  runPrompt(QUERY_REWRITE_CONTRACT, ...),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
])
```

`Promise.race` resolves with `null` after 1.5s, but the `runPrompt` Promise continues executing in the background — the Ollama HTTP call is not cancelled. This wastes CPU/VRAM for the remaining time of the classifier call (~0.5–2s more). For a 1.5s window, this means every query-rewrite timeout consumes ~4s of classifier model time total.

**Fix:** Pass an `AbortController.signal` to `runPrompt` / `client.generate`, and abort it when the race resolves with `null`. This requires adding `signal?: AbortSignal` to `OllamaClient.generate` opts and threading it through to the `fetch` call in `client.ts`.

---

### What's working well in Area 5

- `hybridSearch` correctly implements RRF fusion with configurable pool sizes.
- `mmrSelectById` provides MMR diversification after reranking — correct ordering (rerank first, then diversify).
- `assembleCitations` handles the case where the model returns no citations gracefully.
- Query rewriting is gated behind a user setting (`retrieval.queryRewrite`) with a sensible default (true).
- The reranker is off by default (`retrieval.reranker: false`), limiting exposure to F5.1.

---

## Area 6 — Voice Pipeline

### F6.1 — Whisper hallucination filter fires after inference (waste), patterns are case-sensitive (Medium)

**File:** `apps/desktop/src/workers/whisper/index.js`

The RMS energy check and hallucination pattern filter run **after** the Whisper binary has already been invoked and produced a transcript — they are post-inference filters, not pre-inference gates. Silent audio still triggers a full Whisper inference cycle. On phi4-mini class hardware this is ~300–800ms of unnecessary compute per triggered PTT release.

Pattern matching: patterns like `"you"`, `"thank you"`, `"[blank_audio]"` — need to verify case-sensitivity. If these are exact-match string comparisons (not regex with `i` flag), `"Thank you"` or `"YOU"` would pass through as valid transcripts.

**Fixes:**

1. Pre-inference: check RMS energy on the PCM buffer before spawning the Whisper CLI. Only spawn if energy > threshold.
2. Ensure hallucination pattern matching is case-insensitive (use `transcript.toLowerCase()` before comparison).

---

### F6.2 — No timeout on the thinking state in VoiceOrchestrator (High)

**File:** `apps/desktop/src/main/voice/voice-orchestrator.ts:699–752`

`routeToAssistant` calls `this.deps.sendToAssistant(...)` and awaits it with no timeout. If Ollama hangs (model deadlock, network drop mid-stream), the orchestrator stays in `thinking` state indefinitely. There is no wall-clock guard. The `finally` block at line 739–751 does transition to idle on error, but it only fires if `sendToAssistant` throws — a silent hang does not throw.

The `turn-runner.ts` has a `WALL_CLOCK_MS = 30_000` deadline on the tool-calling loop, but this only guards the tool iteration loop, not the stream itself. A hung stream inside `for await` does not trigger the deadline check.

**Fix:** Wrap `sendToAssistant` in a `Promise.race` with a 45-second timeout in `routeToAssistant`. On timeout, call `this.tts.cancel()`, broadcast `voice:error`, and transition to idle. 45 seconds is chosen to exceed the 30s stream deadline in turn-runner while still being a reasonable UX bound.

---

### F6.3 — Whisper crash auto-disable reset path needs verification (Medium)

**File:** `apps/desktop/src/main/voice/whisper-client.ts`

After 3 crashes in 60s, STT is auto-disabled. The question is whether `voice.setEnabled(true)` via IPC resets the crash counter. This requires reading the `voice.handler.ts` `setEnabled` path — not yet read in this audit.

**Action:** Read `voice.handler.ts` lines around `setEnabled` to confirm whether the crash counter is reset on re-enable. If not, add a `this.whisper.resetCrashState()` call.

---

### What's working well in Area 6

- `routeToAssistant` `finally` block at line 739 correctly transitions out of `speaking` or `thinking` on any error, preventing stuck states from thrown errors.
- Barge-in detection is implemented (VAD running during TTS playback, elevated threshold to reduce bleed-through).
- Piper → SAPI fallback is implemented with a broadcast to the renderer.
- Conversation mode idle timeout is implemented in `conversation-session.ts`.

---

## Area 7 — News Pipeline

### F7.1 — AI analysis vs summary visual distinction: requires renderer verification (Medium)

**File:** `apps/desktop/src/renderer/screens/NewsScreen.tsx` (not yet read)

The news pipeline stores both `summary` (neutral, from `SUMMARIZE_ITEM_PROMPT`) and `analysis` (AI opinion, from `ANALYZE_ITEM_PROMPT`, `temperature: 0.3`). Whether these are visually distinguished in the renderer is not verifiable from the backend audit alone. This finding requires a renderer read to confirm.

**Action:** Read `NewsScreen.tsx` and search for rendering of the `analysis` field. If it is rendered identically to `summary`, add an "AI take" badge/label to the analysis section.

---

### F7.2 — news pipeline `runFullPipeline` bypasses AiQueue (High)

**File:** `apps/desktop/src/main/ipc/handlers/news.handler.ts:207–228`

```ts
void runFullPipeline({...})
  .then(...)
  .catch(...)
```

`runFullPipeline` calls `runPrompt` (via `summarizePending`) directly on the `OllamaClient` without going through `enqueueBackgroundAiTask`. The news handler has no import of `getAiQueue` at all. This means news summarization runs concurrently with foreground assistant turns — causing VRAM contention on the shared Ollama process. With qwen3:8b active for a user chat and phi4-mini being called simultaneously for news clustering labels, both models may be loaded into VRAM at once, likely causing an OOM or severe slowdown on an 8GB card.

This is the same issue identified in F8.1.

**Fix:** In `news.handler.ts`, wrap `runFullPipeline` in `getAiQueue().enqueueBackgroundAiTask(...)`. Since the news pipeline is already run as a fire-and-forget `void`, this change is transparent to the caller.

---

### F7.3 — article-fetcher has a timeout but no max body size (Low)

**File:** `packages/core-news/src/article-fetcher.ts:27–39`

`AbortSignal.timeout(8000)` correctly limits request duration. However, `res.text()` reads the full response body with no size cap. A large HTML page (some news sites serve 5–15MB HTML with embedded data) will be fully loaded into memory before Readability processes it. Readability itself will then process a very large DOM, which is CPU-intensive.

**Fix:** Add a streaming body reader with a max byte limit (e.g., 1MB):

```ts
const MAX_BYTES = 1_000_000
const reader = res.body?.getReader()
// read chunks until MAX_BYTES or end
```

Or simpler: check `Content-Length` header before reading; if > 2MB, return null.

---

### What's working well in Area 7

- Article bodies are wrapped in `buildSingleArticleContext` (XML block) before being passed to the model — correct injection mitigation.
- `SUMMARIZE_ITEM_PROMPT` has a `cacheTtlMs: 30 * 60 * 1000` (30 min) — deterministic summaries are cached.
- `CLUSTER_LABEL_PROMPT` has `cacheTtlMs: 60 * 60 * 1000` (1 hour) — cluster labels are cached.
- `ANALYZE_ITEM_PROMPT` is opt-in per-topic (`setTopicAnalysisOptIn`) — users must explicitly enable AI analysis.

---

## Area 8 — Concurrency & AiQueue Coverage

### F8.1 — News pipeline bypasses AiQueue (High) — confirmed

Documented as F7.2. Confirmed: `news.handler.ts` has no `getAiQueue` import. `runFullPipeline` runs raw Ollama calls outside the queue.

---

### F8.2 — Background queue starvation is theoretically possible but bounded (Low)

**File:** `packages/core-ai/src/ai-queue.ts:124`

Background tasks are blocked while `foregroundActive`. In principle, a user sending many rapid messages could indefinitely delay the morning briefing. In practice, the briefing scheduler is time-triggered (once per morning), not event-triggered, and the user's active session will eventually end. No hard starvation limit is needed, but adding a max background wait time (e.g., 10 minutes) would be a defensive measure for edge cases.

**Fix (deferred):** Add a `maxBackgroundWaitMs` option to `AiQueueOptions`. If a background task has been queued for longer than this limit, allow it to run even while foreground is active (with a 1-slot concurrency limit). Default: disabled.

---

### What's working well in Area 8

- `briefing-job.ts:118` correctly uses `enqueueBackgroundAiTask`.
- `brain.ts:147, 198` correctly uses `enqueueBackgroundAiTask` for ingest operations.
- `agent.handler.ts` correctly calls `beginForegroundAiTask` / `endForegroundAiTask` with a `null`-guard against double-release.
- `AiQueue.getStats()` is available for diagnostics.

---

## Area 9 — Observability

### F9.1 — flushReliabilityToRepo is correctly started at boot (Resolved)

`apps/desktop/src/main/index.ts:567`: `flushReliabilityToRepo(obsRepo)` is called at app startup. Finding **closed**.

---

### F9.2 — INTENT_CLASSIFY_V1 used in observability smoke test instead of ROUTE_CLASSIFY_V1 (Low)

**File:** `apps/desktop/src/main/ipc/handlers/observability.handler.ts:148–150`

The observability handler tests the classifier using `INTENT_CLASSIFY_V1` (5-label contract) rather than `ROUTE_CLASSIFY_V1` (8-label, production contract). A regression in `ROUTE_CLASSIFY_V1`'s routing labels would not be caught by this smoke test. Documented as F3.1.

---

### F9.3 — Whisper crash events and STT-disabled state: needs handler verification (Medium)

Documented as F6.3 — requires reading `voice.handler.ts` setEnabled path.

---

### What's working well in Area 9

- Reliability stats are flushed to SQLite every 60 seconds.
- `model-health.ts` `checkModelHealth()` validates installed models against the active preset.
- `ollama.handler.ts` `testRole` provides per-role smoke tests.
- The crash reporter (M7) wraps main process unhandled exceptions.

---

## Area 10 — Test Coverage

### F10.1 — ai-queue.test.ts exists with background/foreground priority tests (Resolved)

`packages/core-ai/src/ai-queue.test.ts` has tests for background/foreground concurrency and priority. Finding **closed** for the queue itself.

---

### F10.2 — runPrompt retry logic: no unit test for the repair path (Medium)

**File:** `packages/core-ai/src/runtime.ts:229–267`

A search for test files in `core-ai` confirms `ai-queue.test.ts` exists but no `runtime.test.ts` was found. The two-attempt retry with schema hint — the main reliability mechanism for all structured AI outputs — has no unit test. A regression (e.g., the hint builder silently breaking for a contract type) would only surface as degraded model output quality in production.

**Fix:** Add `packages/core-ai/src/runtime.test.ts` with at minimum:

1. Mock `client.generate` to return invalid JSON on attempt 1, valid JSON on attempt 2 → assert `repairedJson` increments and result is `ok: true`.
2. Mock to return invalid JSON on both attempts → assert result is `ok: false`.
3. Mock to return valid JSON on attempt 1 → assert `repairedJson` does NOT increment.

---

### F10.3 — agent-loop tool ID validation: not directly tested (High)

**File:** `packages/core-ai/src/agent-loop.ts:268–275`

The tool ID validation (rejecting plans that reference unknown tool IDs) is a safety-critical path — it prevents the agent from executing hallucinated tool names. No test file for `agent-loop.ts` was found. A regression here could allow the agent to proceed with unvalidated tool calls.

**Fix:** Add `packages/core-ai/src/agent-loop.test.ts` with at minimum:

1. Mock planner response with a valid plan → assert run reaches `completed`.
2. Mock planner response with an unknown tool ID → assert run reaches `failed` with error containing "unknown tools".
3. Mock isCancelled returning true → assert run reaches `cancelled`.

---

### F10.4 — VoiceOrchestrator state machine: no unit tests found (Medium)

**File:** `apps/desktop/src/main/voice/voice-orchestrator.ts`

No test file for `voice-orchestrator.ts` was found in `test-e2e` or `packages/test-utils`. The state machine has 7 states and multiple edge-case transitions (barge-in, crash recovery, timeout). Regressions in state transitions are hard to detect without tests.

**Fix:** Add a unit test suite (ideally in `packages/test-utils` or a new `voice.test.ts`) covering:

1. PTT start → transcript → `routeToAssistant` → TTS → idle
2. Barge-in cancels TTS and re-enters listening
3. Empty transcript in conversation mode → follow-up listening
4. `routeToAssistant` throws → transitions to idle + broadcasts error

---

### What's working well in Area 10

- `ai-queue.test.ts` has well-structured priority/concurrency tests.
- `test-e2e/` Playwright specs provide end-to-end coverage of key user flows (M12).
- CI bundle-size gate prevents renderer bloat regressions.

---

## Summary Table

| ID    | Area          | Severity     | File                         | Issue                                                           |
| ----- | ------------- | ------------ | ---------------------------- | --------------------------------------------------------------- |
| F1.1  | Safety        | High         | turn-runner.ts:102           | DirectToolOutputSchema fallback fires silently                  |
| F1.2  | Safety        | **Critical** | agent.handler.ts:110         | Restricted tools in agent planner manifest                      |
| F1.4  | Safety        | Medium       | suggest.handler.ts:48        | stale toolId not validated against registry                     |
| F1.5  | Safety        | Low          | role-prompts.ts:155          | Hardcoded PC control tool list in prompt                        |
| F2.1  | Reliability   | Medium       | runtime.ts:241               | Schema hint falls back for non-ZodObject types                  |
| F2.3  | Reliability   | **High**     | assistant.handler.ts:462     | stream() bypasses AiQueue; no stream timeout                    |
| F2.4  | Reliability   | Medium       | agent-loop.ts:384            | Reflection failures swallowed silently                          |
| F3.1  | Contracts     | Low          | observability.handler.ts:148 | INTENT_CLASSIFY_V1 used instead of ROUTE_CLASSIFY_V1            |
| F3.2  | Contracts     | Medium       | role-prompts.ts:69           | source_ids_used not validated post-generation                   |
| F3.3  | Contracts     | Low          | role-prompts.ts:113          | message field has no length cap                                 |
| F3.4  | Contracts     | Low          | role-prompts.ts:318          | Front-only truncation loses intent signal                       |
| F4.1  | Broker        | Medium       | broker.ts:144                | Budget allocated FCFS, no intent-based priority                 |
| F4.3  | Broker        | Low          | broker.ts:145                | Provider errors appear in warnings (but filtered before prompt) |
| F5.1  | RAG           | Medium       | assistant.handler.ts:421     | Reranker uses phi4-mini (1024 ctx) for 24 candidates            |
| F5.2  | RAG           | Medium       | assistant.handler.ts:442     | `[n]` vs `[^n]` citation format mismatch                        |
| F5.3  | RAG           | Medium       | query-rewrite.ts:52          | Race timeout doesn't abort the Ollama call                      |
| F6.1  | Voice         | Medium       | whisper/index.js             | Hallucination filter is post-inference; case-sensitive patterns |
| F6.2  | Voice         | **High**     | voice-orchestrator.ts:720    | No timeout on thinking state; hung stream sticks forever        |
| F6.3  | Voice         | Medium       | whisper-client.ts            | Crash reset path needs verification                             |
| F7.1  | News          | Medium       | NewsScreen.tsx               | AI analysis vs summary visual distinction unverified            |
| F7.2  | News          | **High**     | news.handler.ts:213          | runFullPipeline bypasses AiQueue                                |
| F7.3  | News          | Low          | article-fetcher.ts:39        | No max body size on res.text()                                  |
| F8.2  | Concurrency   | Low          | ai-queue.ts:124              | Background starvation theoretically possible                    |
| F9.2  | Observability | Low          | observability.handler.ts:148 | Wrong classifier contract in smoke test                         |
| F10.2 | Tests         | Medium       | runtime.ts                   | No unit test for runPrompt retry/repair path                    |
| F10.3 | Tests         | **High**     | agent-loop.ts:268            | No unit test for tool ID validation (safety-critical)           |
| F10.4 | Tests         | Medium       | voice-orchestrator.ts        | No unit tests for voice state machine                           |

---

## Recommended Fix Order (Sonnet 4.6 implementation)

**Milestone A — Critical & High fixes (immediate)**

1. F1.2 — Strip restricted tools from agent manifest in `agent.handler.ts`
2. F2.3 — Wrap `runTurn` in `enqueueForegroundAiTask`; add stream timeout in `turn-runner.ts`
3. F6.2 — Add 45s timeout on `routeToAssistant` in `voice-orchestrator.ts`
4. F7.2 — Wrap `runFullPipeline` in `enqueueBackgroundAiTask` in `news.handler.ts`
5. F10.3 — Add `agent-loop.test.ts` with tool ID validation tests

**Milestone B — Medium fixes** 6. F1.1 — Log warning on DirectTool fallback; gate confirm/restricted from that path 7. F1.4 — Validate toolId from DB against live registry in `suggest.handler.ts` 8. F2.1 — Extend schema hint builder to handle ZodEnum/ZodArray 9. F2.4 — Log and count agent reflection failures; fail after 3 consecutive 10. F3.2 — Post-validate source_ids_used in news synthesis output 11. F4.1 — Add intent-based provider priority ordering in broker 12. F5.1 — Use rag-role model for reranker; or reduce rerankPool 13. F5.2 — Unify RAG chunk citation format to `[^n]` 14. F5.3 — Add AbortSignal to OllamaClient.generate for query-rewrite timeout 15. F6.1 — Pre-inference RMS check; case-insensitive pattern matching 16. F6.3 — Verify and fix Whisper crash counter reset on setEnabled 17. F7.1 — Verify and fix AI analysis label in NewsScreen renderer 18. F10.2 — Add `runtime.test.ts` with retry/repair tests 19. F10.4 — Add voice orchestrator state machine tests

**Milestone C — Low fixes (polish pass)** 20. F3.1 — Replace INTENT_CLASSIFY_V1 with ROUTE_CLASSIFY_V1 in observability handler; delete old contract 21. F3.3 — Add z.string().max(800) to TOOL_CALL_V1 message field 22. F3.4 — Centre-skipping truncation in ROUTE_CLASSIFY_V1 userTemplate 23. F7.3 — Add max body size guard in article-fetcher 24. F1.5 — Generate PC control tool list dynamically (deferred to tool registry milestone) 25. F8.2 — Consider maxBackgroundWaitMs option in AiQueue (deferred)
