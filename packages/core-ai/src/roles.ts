import type { ModelRole } from './router'

// ── AiRoleDefinition ───────────────────────────────────────────────────────────
//
// Each AI role has a fixed definition describing its model preference,
// prompt style, output mode, queue priority, and safety constraints.
// This makes routing, prompt selection, and queue behavior deterministic
// rather than ad hoc per call site.
//
// RTX 3060 Ti / 8 GB VRAM notes:
//   - maxInputCharsRecommended: conservative limit to avoid OOM on small models
//   - Only one ≥7B model should be active at a time where practical
//   - backgroundAllowed: roles where user does not need an instant response

export type ContextFormat = 'plain' | 'markdown' | 'toon' | 'xml' | 'auto'
export type OutputMode = 'json' | 'markdown' | 'text' | 'embedding'
export type QueuePriority = 'critical' | 'foreground' | 'background'
export type SafetyLevel = 'low' | 'medium' | 'high'

export type AiRoleDefinition = {
  role: ModelRole
  displayName: string
  /** Model ID from the active ModelConfig — resolved at runtime via ModelRouter. */
  defaultModel: string
  /** Fallback model IDs if the preferred model is unavailable. */
  alternatives: string[]
  /** ID of the PromptContract or prompt template used for this role. */
  promptTemplateId: string
  /** Strategy for formatting input context (not model output). */
  contextFormat: ContextFormat
  /** Expected output mode — drives Ollama format flag and Zod validation. */
  outputMode: OutputMode
  /** Queue lane this role runs in by default. */
  queuePriority: QueuePriority
  /** Safety constraints applied to this role's tool use. */
  safetyLevel: SafetyLevel
  /**
   * Conservative input character limit for 8 GB VRAM.
   * ~3.5 chars ≈ 1 token; these are rough guides, not hard limits.
   */
  maxInputCharsRecommended: number
  /** Whether this role's tasks can run as background jobs. */
  backgroundAllowed: boolean
  /** Whether the model MUST return strict JSON (drives format:'json' in Ollama). */
  strictJson: boolean
}

// ── Role registry ──────────────────────────────────────────────────────────────

export const AI_ROLE_REGISTRY: Record<ModelRole, AiRoleDefinition> = {
  classifier: {
    role: 'classifier',
    displayName: 'Intent Classifier',
    defaultModel: 'phi4-mini:3.8b',
    alternatives: ['phi4-mini:3.8b'],
    promptTemplateId: 'intent.classify.v1',
    contextFormat: 'plain',
    outputMode: 'json',
    // May run foreground or background depending on caller; treat as foreground
    // since classification gates routing decisions the user is waiting on.
    queuePriority: 'foreground',
    safetyLevel: 'low',
    // Short by design — classifier prompts must stay under ~500 tokens on phi4-mini.
    maxInputCharsRecommended: 1_800,
    backgroundAllowed: false,
    strictJson: true,
  },

  summarize: {
    role: 'summarize',
    displayName: 'Summarizer',
    defaultModel: 'qwen3:8b',
    alternatives: ['phi4-mini:3.8b'],
    promptTemplateId: 'news.summarize.v1',
    // Long untrusted article bodies → XML; short content → plain/markdown
    contextFormat: 'auto',
    outputMode: 'json',
    queuePriority: 'background',
    safetyLevel: 'low',
    // 2000 char article body + prompt overhead
    maxInputCharsRecommended: 8_000,
    backgroundAllowed: true,
    strictJson: true,
  },

  extract: {
    role: 'extract',
    displayName: 'Structured Extractor',
    defaultModel: 'phi4-mini:3.8b',
    alternatives: ['qwen3:8b'],
    promptTemplateId: 'extract.generic.v1',
    contextFormat: 'xml',
    outputMode: 'json',
    queuePriority: 'background',
    safetyLevel: 'low',
    maxInputCharsRecommended: 6_000,
    backgroundAllowed: true,
    strictJson: true,
  },

  chat: {
    role: 'chat',
    displayName: 'Chat Assistant',
    defaultModel: 'qwen3:8b',
    alternatives: ['phi4-mini:3.8b'],
    promptTemplateId: 'chat.assistant.v1',
    contextFormat: 'markdown',
    outputMode: 'json', // structured speak/tool output from turn-runner
    queuePriority: 'foreground',
    safetyLevel: 'medium',
    // Includes full system prompt + history + RAG context
    maxInputCharsRecommended: 12_000,
    backgroundAllowed: false,
    strictJson: true, // turn-runner requires JSON for speak/tool routing
  },

  agent: {
    role: 'agent',
    displayName: 'Agent Planner',
    defaultModel: 'qwen3:8b',
    alternatives: [],
    promptTemplateId: 'agent.plan.v1',
    contextFormat: 'toon', // tool catalog encoded as TOON compact records
    outputMode: 'json',
    queuePriority: 'foreground',
    safetyLevel: 'high', // agent can execute tools with real side effects
    maxInputCharsRecommended: 10_000,
    backgroundAllowed: false,
    strictJson: true,
  },

  rag: {
    role: 'rag',
    displayName: 'RAG Answer Synthesizer',
    defaultModel: 'qwen3:8b',
    alternatives: ['phi4-mini:3.8b'],
    promptTemplateId: 'rag.answer.v1',
    // Short chunks → TOON records; long chunks → XML blocks; mixed → auto
    contextFormat: 'auto',
    outputMode: 'markdown', // streaming markdown answer with [^n] citations
    queuePriority: 'foreground',
    safetyLevel: 'low',
    // Retrieved chunks + query; keep tight to avoid hallucination from long context
    maxInputCharsRecommended: 10_000,
    backgroundAllowed: false,
    strictJson: false, // streaming markdown output, not JSON
  },

  news_synthesis: {
    role: 'news_synthesis',
    displayName: 'News Digest Synthesizer',
    defaultModel: 'qwen3:8b',
    // phi4-mini may miss nuance in multi-source synthesis; keep qwen3 as only option
    alternatives: [],
    promptTemplateId: 'news.digest.v1',
    contextFormat: 'toon', // TOON compact article list for token efficiency
    outputMode: 'json',
    queuePriority: 'background',
    safetyLevel: 'low',
    // Multiple article summaries; TOON format keeps this compact
    maxInputCharsRecommended: 12_000,
    backgroundAllowed: true,
    strictJson: true,
  },

  tool_call: {
    role: 'tool_call',
    displayName: 'Tool Call Planner',
    defaultModel: 'qwen3:8b',
    alternatives: [],
    promptTemplateId: 'tool.call.v1',
    contextFormat: 'toon', // compact tool catalog, same as agent
    outputMode: 'json',
    queuePriority: 'foreground',
    safetyLevel: 'high', // produces tool invocations with real side effects
    maxInputCharsRecommended: 6_000,
    backgroundAllowed: false,
    strictJson: true,
  },

  coding: {
    role: 'coding',
    displayName: 'Coding Assistant',
    defaultModel: 'qwen2.5-coder:7b',
    alternatives: ['qwen3:8b'],
    promptTemplateId: 'coding.assistant.v1',
    contextFormat: 'markdown', // code + file paths in Markdown; no TOON for code
    outputMode: 'markdown', // code blocks; JSON only if caller requests machine output
    queuePriority: 'foreground',
    safetyLevel: 'medium', // may suggest shell commands — warn but don't block
    maxInputCharsRecommended: 10_000,
    backgroundAllowed: false,
    strictJson: false,
  },

  embed: {
    role: 'embed',
    displayName: 'Text Embedder',
    defaultModel: 'nomic-embed-text',
    alternatives: [],
    promptTemplateId: 'embed.plain.v1',
    contextFormat: 'plain', // NO prompt wrappers — clean text only for embeddings
    outputMode: 'embedding',
    queuePriority: 'background',
    safetyLevel: 'low',
    // nomic-embed-text has a 2048 token context; keep well under that
    maxInputCharsRecommended: 6_000,
    backgroundAllowed: true,
    strictJson: false, // embedding API returns float arrays, not JSON text
  },
}

// ── Lookup helpers ─────────────────────────────────────────────────────────────

/** Get the role definition for a given role ID. */
export function getRoleDefinition(role: ModelRole): AiRoleDefinition {
  return AI_ROLE_REGISTRY[role]
}

/** Get all roles that are allowed to run as background tasks. */
export function getBackgroundRoles(): AiRoleDefinition[] {
  return Object.values(AI_ROLE_REGISTRY).filter((r) => r.backgroundAllowed)
}

/** Get all roles that require strict JSON output. */
export function getStrictJsonRoles(): AiRoleDefinition[] {
  return Object.values(AI_ROLE_REGISTRY).filter((r) => r.strictJson)
}

/** Get all roles that require the high safety level (tool side-effects). */
export function getHighSafetyRoles(): AiRoleDefinition[] {
  return Object.values(AI_ROLE_REGISTRY).filter((r) => r.safetyLevel === 'high')
}
