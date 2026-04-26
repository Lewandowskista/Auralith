# Local AI Setup — RTX 3060 Ti / 8 GB VRAM Guide

Auralith runs entirely on local Ollama inference. This guide covers the recommended
model setup for an RTX 3060 Ti with 8 GB VRAM.

---

## Quick start

```bash
# Install the two required models
ollama pull phi4-mini:3.8b
ollama pull qwen3:8b
ollama pull nomic-embed-text

# Optional: coding / automation assistant
ollama pull qwen2.5-coder:7b
```

Then launch Auralith. The **balanced** preset is active by default.

---

## Presets

Auralith ships three named presets. Switch between them in
**Settings → AI → Model routing → Preset**, or via `ollama.applyPreset` IPC.

| Role       | fast             | balanced (default) | quality          |
| ---------- | ---------------- | ------------------ | ---------------- |
| classifier | phi4-mini:3.8b   | phi4-mini:3.8b     | phi4-mini:3.8b   |
| summarize  | phi4-mini:3.8b   | phi4-mini:3.8b     | qwen3:8b         |
| extract    | phi4-mini:3.8b   | phi4-mini:3.8b     | phi4-mini:3.8b   |
| chat       | phi4-mini:3.8b   | qwen3:8b           | qwen3:8b         |
| agent      | qwen3:8b         | qwen3:8b           | qwen3:8b         |
| embed      | nomic-embed-text | nomic-embed-text   | nomic-embed-text |

### When to use each preset

- **balanced** — recommended for most users. Fast classification, high-quality chat.
- **fast** — lowest latency. Use when responsiveness matters more than output quality,
  or when VRAM is shared with other workloads.
- **quality** — best output. `qwen3:8b` handles summarization in addition to chat/agent.

### Per-role overrides

Individual roles can still be overridden after selecting a preset via
**Settings → AI → Model routing** or `ollama.saveModelRouting` IPC. When any role
diverges from a known preset the active preset displays as **Custom**.

---

## Model guide

### phi4-mini:3.8b

- Best for: classification, extraction, labelling, short summaries, intent detection
- Fits comfortably in 8 GB VRAM alongside the embed model
- Low latency — suitable for background jobs that run while you work

### qwen3:8b

- Best for: chat, agent planning, complex summarization, multi-step reasoning
- Uses ~5–6 GB VRAM. Keep only this or a similarly sized model active at a time.
- **Do not load qwen3:8b and qwen2.5-coder:7b at the same time on 8 GB VRAM**

### nomic-embed-text

- Required for knowledge search and RAG (retrieval-augmented generation)
- Produces 768-dimensional vectors (matches the sqlite-vec schema)
- Very small footprint — stays resident alongside any chat model

### qwen2.5-coder:7b _(optional)_

- Only for coding-specific tasks and automation script generation
- **Not suitable as a default chat or agent model** — swap it in explicitly when needed
- Roughly the same VRAM footprint as qwen3:8b; unload qwen3:8b first

---

## 8 GB VRAM rules

1. **Only one large model (≥ 7 B parameters) active at a time.** Loading two
   simultaneously causes OOM errors or severe slowdowns.
2. phi4-mini:3.8b and nomic-embed-text can coexist with a 7-8 B model in most
   configurations because they are quantized to 2–3 GB.
3. Background jobs (news summarization, morning briefing) use phi4-mini:3.8b for
   the classification and extraction steps, so they do not require qwen3:8b to be
   loaded.

---

## Background AI queue

Auralith uses a priority queue to prevent background AI jobs from competing with
your active chat or agent session.

- **Foreground slot (1)** — used by `assistant.send` and `agent.run`. Starts
  immediately.
- **Background slot (1)** — used by news summarization, morning briefing, and
  embeddings. **Paused while a foreground task is running.**

This ensures that background news refreshes (every 3 hours) do not make the
assistant feel sluggish during a conversation.

### API (packages/core-ai)

```typescript
import { getAiQueue } from '@auralith/core-ai'

const queue = getAiQueue()

// Signal that a user-facing call is starting
queue.beginForegroundAiTask()
// ... run your Ollama call ...
queue.endForegroundAiTask()

// Run a background task (pauses while foreground is active)
await queue.enqueueBackgroundAiTask(async () => {
  await runFullPipeline(...)
})

// Run a foreground task through the queue
await queue.enqueueForegroundAiTask(async () => {
  return runTurn(...)
})

// Diagnostics
console.log(queue.getStats())
// → { foregroundQueued, foregroundRunning, backgroundQueued, backgroundRunning, foregroundActive }
```

---

## Model health check

Auralith can report which required models are missing and generate the exact
`ollama pull` commands to install them.

**Via IPC (from renderer):**

```typescript
const { missing, pullCommands, hints } = await ipc('ollama.checkModelHealth')
```

**Via code:**

```typescript
import { checkModelHealth, formatMissingModelHints } from '@auralith/core-ai'

const report = await checkModelHealth(client, router.getConfig())
if (report.missing.length > 0) {
  console.log(formatMissingModelHints(report))
  // → "Missing 1 model(s). Run: ollama pull qwen3:8b ..."
}
```

> **Never auto-pull models without user confirmation.** Always present
> `pullCommands` to the user and let them run the commands manually.

---

## JSON reliability diagnostics

Auralith tracks structured JSON parse and validation failures per model and role
without storing any prompt content.

```typescript
import { getJsonReliabilityStats } from '@auralith/core-ai'

const stats = getJsonReliabilityStats()
// → [{ model, role, attempts, parseFailures, validationFailures, successes }]
```

**Via IPC:**

```typescript
const { stats } = await ipc('ollama.getJsonReliabilityStats')
```

A high `parseFailures` or `validationFailures` count for a given model/role
indicates the model struggles with structured output for that task. Consider
switching that role to a more capable model.

---

## Desktop-control tool safety

Auralith enforces a three-tier allowlist for all tool execution:

| Tier         | Confirmation required | Notes                               |
| ------------ | --------------------- | ----------------------------------- |
| `safe`       | No                    | Read-only operations                |
| `confirm`    | Yes (dialog)          | Potentially reversible writes       |
| `restricted` | Yes (type "CONFIRM")  | Deletions, system changes, messages |

The `suggestion` and `scheduler` actors are blocked from invoking `confirm` or
`restricted` tier tools entirely. Only the `user` actor can approve them.

**Never give the model unrestricted shell access.** All tool IDs must appear in
the registered allowlist. Unknown tool calls are rejected and logged to the audit
table.
