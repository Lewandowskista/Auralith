import { z } from 'zod'
import type { PromptContract } from '../runtime'
import { formatToon, formatXmlBlock } from '../prompt-format'

// ─────────────────────────────────────────────────────────────────────────────
// Role-specific prompt contracts for the 4 roles added in v2:
//   rag, news_synthesis, tool_call, coding
//
// Each contract is purpose-built for its role:
//   - model family assumptions documented inline
//   - context format matches the role definition in roles.ts
//   - output schemas are strict Zod — never allow model invention of enum values
//   - TOON is only used for INPUT context, never for OUTPUT
// ─────────────────────────────────────────────────────────────────────────────

// ── RAG ───────────────────────────────────────────────────────────────────────
// Role: rag | Model: qwen3:8b (balanced/quality), phi4-mini:3.8b (fast)
//
// The RAG contract is used for structured fallback when streaming is not
// available. The streaming path uses RAG_SYSTEM_PROMPT + buildRagUserPrompt
// from rag-answer.ts directly. This contract produces a structured JSON answer
// useful for pipeline consumption or citation validation.

export const RagAnswerOutputSchema = z.object({
  answer: z.string().min(1),
  /** Chunk numbers (n) actually cited in the answer — for downstream citation checks. */
  chunk_ids_used: z.array(z.number().int().gte(0)),
  /** True when the context was insufficient and the answer is partial/uncertain. */
  insufficient_context: z.boolean(),
})

export type RagAnswerOutput = z.infer<typeof RagAnswerOutputSchema>

export const RAG_ANSWER_V1: PromptContract<RagAnswerOutput> = {
  id: 'rag.answer.v1',
  role: 'rag',
  system: [
    'You are a precise research assistant. Answer the question ONLY from the provided context chunks.',
    'Rules:',
    '- Cite every factual claim using chunk numbers as [^n].',
    '- If context is insufficient, set insufficient_context:true and say so briefly.',
    '- Do not invent or infer facts not present in the context.',
    '- Keep answers concise.',
    '- Output ONLY valid JSON — no prose, no markdown fences.',
  ].join('\n'),
  userTemplate: (ctx) =>
    `${ctx['chunksBlock'] ?? '(no context provided)'}\n\n---\n\nQuestion: ${ctx['query'] ?? ''}\n\nJSON: {"answer":"...","chunk_ids_used":[...],"insufficient_context":true|false}`,
  outputSchema: RagAnswerOutputSchema,
  maxTokens: 512,
  temperature: 0.1,
}

// ── News Synthesis ─────────────────────────────────────────────────────────────
// Role: news_synthesis | Model: qwen3:8b (all presets)
//
// Digest prompt supersedes the existing DIGEST_PROMPT in core-news/prompts.ts
// for the new role-routing path. The core-news version remains for backwards
// compatibility with the news pipeline that calls it directly.
//
// This version adds:
//   - explicit "duplicates" grouping field
//   - source attribution requirement in system prompt
//   - instruction to mention inter-source disagreement

export const NewsSynthesisOutputSchema = z.object({
  headline: z.string().min(1),
  briefing: z.string().min(1),
  key_points: z.array(z.string()).min(1),
  source_ids_used: z.array(z.string()),
  duplicates: z.array(z.array(z.string())),
  uncertainties: z.array(z.string()),
  importance: z.enum(['low', 'medium', 'high']),
})

export type NewsSynthesisOutput = z.infer<typeof NewsSynthesisOutputSchema>

export const NEWS_SYNTHESIS_V1: PromptContract<NewsSynthesisOutput> = {
  id: 'news.synthesis.v1',
  role: 'news_synthesis',
  system: [
    'You are a news digest editor. Given a set of article summaries, produce a concise daily briefing.',
    'Rules:',
    '- Use ONLY the provided articles — do not invent facts.',
    '- source_ids_used must contain only id values from the input.',
    '- Group near-duplicate stories in duplicates as arrays of ids.',
    '- Mention inter-source disagreement in uncertainties when present.',
    '- Prioritise by real-world impact and relevance.',
    '- Output ONLY valid JSON — no prose, no markdown fences.',
  ].join('\n'),
  userTemplate: (ctx) =>
    `${ctx['articlesBlock'] ?? '(no articles)'}\n\nProduce the digest JSON:\n{"headline":"...","briefing":"...","key_points":[...],"source_ids_used":[...],"duplicates":[[...]],"uncertainties":[...],"importance":"low|medium|high"}`,
  outputSchema: NewsSynthesisOutputSchema,
  maxTokens: 600,
  temperature: 0.1,
}

// ── Tool Call ─────────────────────────────────────────────────────────────────
// Role: tool_call | Model: qwen3:8b (all presets)
//
// Lighter than the full agent planner — produces exactly ONE tool call or a
// clarification question. Used when the classifier routes to a tool but the
// agent loop is not needed (single-step desktop action).

export const ToolCallOutputSchema = z.object({
  type: z.enum(['tool', 'speak']),
  /** Tool ID to call — must match an allowlisted tool ID exactly. */
  tool: z.string().nullable(),
  /** Arguments for the tool call. */
  args: z.record(z.string(), z.unknown()),
  /** Message to show the user (clarification, confirmation prompt, or final answer). */
  message: z.string().max(800),
  /** Must be true for any tool with tier 'confirm' or 'restricted'. */
  requires_confirmation: z.boolean(),
})

export type ToolCallOutput = z.infer<typeof ToolCallOutputSchema>

export type ToolEntry = {
  id: string
  tier: 'safe' | 'confirm' | 'confirm-transient' | 'restricted'
  description: string
}

/**
 * Build the user message for a tool_call prompt.
 * Tool catalog is TOON-encoded for token efficiency on qwen3:8b.
 */
export function buildToolCallUserMessage(request: string, tools: ToolEntry[]): string {
  const toolTable =
    tools.length > 0
      ? formatToon(
          tools.map((t) => ({ id: t.id, tier: t.tier, description: t.description })),
          ['id', 'tier', 'description'],
          'tools',
        )
      : '(no tools available)'

  return `Available tools:\n${toolTable}\n\nUser request: ${request}\n\nRespond with JSON only.`
}

export const TOOL_CALL_V1: PromptContract<ToolCallOutput> = {
  id: 'tool.call.v1',
  role: 'tool_call',
  system: [
    'You are a tool dispatcher. Given a user request and a list of available tools, decide on exactly one tool call or ask a clarification question.',
    'Rules:',
    '- type must be "tool" or "speak".',
    '- If type is "tool", tool must be an exact id from the list — never invent tool names.',
    '- If the request is ambiguous, use type:"speak" and ask one focused question in message.',
    '- requires_confirmation must be true for any tool with tier "confirm", "confirm-transient", or "restricted".',
    "- args must match the tool's expected parameters — use {} if no args are needed.",
    '- Never suggest arbitrary shell commands or file deletions without an explicit allowlisted tool.',
    '- Output ONLY valid JSON — no prose, no markdown fences.',
    '',
    'PC CONTROL: You can control this Windows PC using these tool prefixes:',
    '- app.launch / app.close / app.list: open or close any installed application',
    '- browser.navigate / browser.search / browser.click / browser.type / browser.playVideo: control Chrome via CDP',
    '- volume.set / volume.mute / volume.get: control system volume',
    '- media.play / media.next / media.prev: send media playback keys',
    '- window.list / window.minimize / window.maximize / window.restore / window.focus / window.close: manage windows',
    '- clipboard.read / clipboard.write: access clipboard',
    '- screen.lock / system.sleep: lock or sleep the PC (restricted — requires explicit confirmation)',
    '',
    'Multi-step browser tasks: call browser.search first, then browser.playVideo in a follow-up turn.',
    'Do not chain more than one browser.* tool call per turn.',
  ].join('\n'),
  userTemplate: (ctx) => ctx['body'] ?? '',
  outputSchema: ToolCallOutputSchema,
  maxTokens: 320,
  temperature: 0,
}

// ── Coding ────────────────────────────────────────────────────────────────────
// Role: coding | Model: qwen2.5-coder:7b (all presets)
//
// Streams Markdown directly — code blocks, explanations, warnings inline.
// Plugs into runCodingTurn() which bypasses the JSON turn-runner and streams
// raw tokens directly to the renderer, same as a RAG answer.
//
// The structured JSON variant (CODING_ASSISTANT_V1) is kept for pipeline use
// (batch code generation, tool integration). The streaming path uses
// CODING_SYSTEM_PROMPT + the raw user message.

export const CodingStructuredOutputSchema = z.object({
  code: z.string(),
  language: z.string(),
  explanation: z.string(),
  warnings: z.array(z.string()),
})

export type CodingStructuredOutput = z.infer<typeof CodingStructuredOutputSchema>

/** System prompt for the streaming coding path (runCodingTurn). */
export const CODING_SYSTEM_PROMPT = [
  'You are an expert coding assistant powered by Qwen2.5-Coder.',
  'You help with code generation, debugging, refactoring, scripting, and technical explanations.',
  '',
  'Guidelines:',
  '- Always produce complete, runnable code — never leave TODOs or fragments unless explicitly asked.',
  '- Use proper Markdown: fenced code blocks with the correct language tag (```python, ```typescript, etc.).',
  '- Explain what the code does in 1–3 sentences after each block.',
  '- If multiple approaches exist, briefly mention trade-offs then recommend one.',
  '- State any assumptions (OS, runtime version, library version) explicitly.',
  '- For shell or PowerShell commands, note side effects and reversibility.',
  '- Warn about destructive operations, privilege requirements, or security considerations.',
  '- Prefer idiomatic, safe patterns. Avoid deprecated APIs.',
  '- Keep explanations concise — code first, prose second.',
  '- If the request is ambiguous, answer the most likely interpretation and note what you assumed.',
].join('\n')

/** Context block injected when the user has relevant knowledge chunks. */
export function buildCodingContextBlock(ragChunks: string): string {
  if (!ragChunks.trim()) return ''
  return `\n\n## Relevant context from your knowledge base\n\n${ragChunks}\n`
}

// Structured JSON variant — kept for batch/pipeline callers.
export const CODING_ASSISTANT_V1: PromptContract<CodingStructuredOutput> = {
  id: 'coding.assistant.v1',
  role: 'coding',
  system: [
    'You are an expert coding assistant. Help with code generation, debugging, scripting, and automation.',
    'Rules:',
    '- Prefer safe, idiomatic code.',
    '- Always explain destructive or risky commands.',
    '- Never suggest irreversible system changes without a warning.',
    '- For shell/PowerShell commands, note side effects explicitly.',
    '- Be explicit about assumptions (OS, runtime version, dependencies).',
    '- Produce complete, runnable snippets rather than fragments.',
    '- Output ONLY valid JSON — no prose, no markdown fences outside code fields.',
  ].join('\n'),
  userTemplate: (ctx) => {
    const lang = ctx['language'] ? `Language/runtime: ${ctx['language']}\n` : ''
    const filePath = ctx['filePath'] ? `File: ${ctx['filePath']}\n` : ''
    return `${lang}${filePath}\nRequest: ${ctx['request'] ?? ''}\n\nJSON: {"code":"...","language":"...","explanation":"...","warnings":[...]}`
  },
  outputSchema: CodingStructuredOutputSchema,
  maxTokens: 1024,
  temperature: 0.2,
}

// ── Extract (generic) ──────────────────────────────────────────────────────────
// Role: extract | Model: phi4-mini:3.8b (all presets)
//
// Generic extraction contract. The existing ANALYZE_ITEM_PROMPT in
// core-news/prompts.ts handles the news-specific case; this handles
// general entity/date/action extraction from arbitrary text.

export const ExtractGenericOutputSchema = z.object({
  entities: z.array(z.string()),
  dates: z.array(z.string()),
  actions: z.array(z.string()),
  links: z.array(z.string()),
  preferences: z.array(z.string()),
  uncertain: z.boolean(),
})

export type ExtractGenericOutput = z.infer<typeof ExtractGenericOutputSchema>

/**
 * Wrap untrusted input text in an XML block before passing to the extract prompt.
 * Prevents prompt injection from pasted documents or clipboard content.
 */
export function buildExtractInputBlock(text: string, sourceHint?: string): string {
  return formatXmlBlock('input', text.slice(0, 4000), sourceHint ? { source: sourceHint } : {})
}

export const EXTRACT_GENERIC_V1: PromptContract<ExtractGenericOutput> = {
  id: 'extract.generic.v1',
  role: 'extract',
  system: [
    'You are a structured extractor. Extract entities, dates, actions, links, and preferences from the provided text.',
    'Rules:',
    '- Extract only what is explicitly present — use empty arrays for missing categories.',
    '- Do not infer private or sensitive facts.',
    '- Set uncertain:true if the text is ambiguous or incomplete.',
    '- Output ONLY valid JSON — no prose, no markdown fences.',
  ].join('\n'),
  userTemplate: (ctx) =>
    `${ctx['inputBlock'] ?? ''}\n\nJSON: {"entities":[...],"dates":[...],"actions":[...],"links":[...],"preferences":[...],"uncertain":true|false}`,
  outputSchema: ExtractGenericOutputSchema,
  maxTokens: 300,
  temperature: 0,
}

// ── Classifier (full intent routing) ──────────────────────────────────────────
// Role: classifier | Model: phi4-mini:3.8b (all presets)
//
// Richer than INTENT_CLASSIFY_V1 in intent-classify.ts which only has 5 labels.
// This version routes to all Auralith feature areas and detects risk level.
// INTENT_CLASSIFY_V1 is kept for backwards compatibility; callers can migrate
// to ROUTE_CLASSIFY_V1 for the richer routing label set.

export const RouteClassifyOutputSchema = z.object({
  intent: z.enum(['chat', 'tool', 'news', 'rag', 'coding', 'routine', 'settings', 'unknown']),
  confidence: z.number().min(0).max(1),
  requires_clarification: z.boolean(),
  clarifying_question: z.string().nullable(),
  risk: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
})

export type RouteClassifyOutput = z.infer<typeof RouteClassifyOutputSchema>

export const ROUTE_CLASSIFY_V1: PromptContract<RouteClassifyOutput> = {
  id: 'route.classify.v1',
  role: 'classifier',
  system: [
    'Classify the user message into exactly one intent. Reply with JSON only.',
    'Allowed intents: chat, tool, news, rag, coding, routine, settings, unknown.',
    'Do not invent new intent labels.',
    'risk: low=read-only, medium=writes data or controls apps/volume/windows, high=deletes/installs/sends/executes/locks/sleeps.',
    'PC control requests (open app, search browser, play video, set volume, lock screen, etc.) are always intent:tool.',
    'If ambiguous, set requires_clarification:true and provide one focused clarifying_question.',
    'reason: one sentence max explaining the classification.',
  ].join('\n'),
  userTemplate: ({ message }) => {
    const raw = message ?? ''
    const truncated = raw.length > 800 ? raw.slice(0, 400) + ' … ' + raw.slice(-400) : raw
    return `Message: "${truncated}"\n\nJSON: {"intent":"...","confidence":0.0,"requires_clarification":false,"clarifying_question":null,"risk":"low","reason":"..."}`
  },
  outputSchema: RouteClassifyOutputSchema,
  maxTokens: 120,
  temperature: 0,
}
