import type { ModelRole } from '../router'

export type RoleCtxConfig = {
  /** Default model ID for this role. Overridden at runtime by ModelRouter. */
  defaultModel: string
  /** Ollama num_ctx — how many tokens fit in the context window. */
  num_ctx: number
}

// Per-role context window sizes.
// Tuned for RTX 3060 Ti / 8 GB VRAM — keep total VRAM usage under the limit.
// phi4-mini (3.8b) is safe at 2048; qwen3:8b is safe at 6144 with nothing else loaded.
export const ROLE_CTX_CONFIG: Record<ModelRole, RoleCtxConfig> = {
  classifier: { defaultModel: 'phi4-mini:3.8b', num_ctx: 1024 },
  summarize: { defaultModel: 'qwen3:8b', num_ctx: 4096 },
  extract: { defaultModel: 'phi4-mini:3.8b', num_ctx: 2048 },
  chat: { defaultModel: 'qwen3:8b', num_ctx: 4096 },
  agent: { defaultModel: 'qwen3:8b', num_ctx: 4096 },
  news_synthesis: { defaultModel: 'qwen3:8b', num_ctx: 4096 },
  tool_call: { defaultModel: 'qwen3:8b', num_ctx: 4096 },
  rag: { defaultModel: 'qwen3:8b', num_ctx: 6144 },
  coding: { defaultModel: 'qwen2.5-coder:7b', num_ctx: 4096 },
  embed: { defaultModel: 'nomic-embed-text', num_ctx: 512 },
}
