import type { OllamaClient } from './client'

// Task names map to logical model roles; actual model IDs come from settings.
// Roles added in v2: rag, news_synthesis, tool_call, coding.
// Legacy aliases: "agent" covers both planning and tool_call for older configs.
export type ModelRole =
  | 'classifier'    // intent classification, labelling (fast, small model preferred)
  | 'chat'          // multi-turn conversation
  | 'summarize'     // summarization / briefing
  | 'extract'       // extraction / rewriting
  | 'agent'         // agent planner + reflection (may need stronger model)
  | 'embed'         // embedding (vector model, not a chat model)
  | 'rag'           // RAG answer synthesis from retrieved chunks
  | 'news_synthesis'// multi-article news digest synthesis
  | 'tool_call'     // single-tool decision / tool-call planning
  | 'coding'        // code generation, debugging, scripting (qwen2.5-coder recommended)

export type ModelConfig = {
  classifier: string
  chat: string
  summarize: string
  extract: string
  agent: string
  embed: string
  rag: string
  news_synthesis: string
  tool_call: string
  coding: string
}

// ── Presets ────────────────────────────────────────────────────────────────────
// Tuned for RTX 3060 Ti / 8 GB VRAM. Only one large model (qwen3:8b) should be
// resident at a time; phi4-mini:3.8b stays loaded for fast classification tasks.

export type ModelPresetName = 'fast' | 'balanced' | 'quality'

export type ModelPreset = {
  name: ModelPresetName
  description: string
  config: ModelConfig
}

// "balanced" is the recommended default for RTX 3060 Ti users.
export const MODEL_PRESETS: Record<ModelPresetName, ModelPreset> = {
  balanced: {
    name: 'balanced',
    description:
      'Recommended for RTX 3060 Ti / 8 GB VRAM. phi4-mini for classifier/extract, qwen3:8b for chat/agent/summarize/rag/news/tool_call, qwen2.5-coder for coding.',
    config: {
      classifier:     'phi4-mini:3.8b',
      summarize:      'qwen3:8b',
      extract:        'phi4-mini:3.8b',
      chat:           'qwen3:8b',
      agent:          'qwen3:8b',
      rag:            'qwen3:8b',
      news_synthesis: 'qwen3:8b',
      tool_call:      'qwen3:8b',
      coding:         'qwen2.5-coder:7b',
      embed:          'nomic-embed-text',
    },
  },
  fast: {
    name: 'fast',
    description:
      'phi4-mini:3.8b for most tasks; qwen3:8b for agent/tool_call/news_synthesis; qwen2.5-coder for coding. Lowest latency, 8 GB VRAM safe.',
    config: {
      classifier:     'phi4-mini:3.8b',
      summarize:      'phi4-mini:3.8b',
      extract:        'phi4-mini:3.8b',
      chat:           'phi4-mini:3.8b',
      agent:          'qwen3:8b',
      rag:            'phi4-mini:3.8b',
      news_synthesis: 'qwen3:8b',
      tool_call:      'qwen3:8b',
      coding:         'qwen2.5-coder:7b',
      embed:          'nomic-embed-text',
    },
  },
  quality: {
    name: 'quality',
    description:
      'qwen3:8b for chat, agent, rag, news_synthesis, tool_call, and summarization; qwen2.5-coder for coding. Best output quality within 8 GB VRAM.',
    config: {
      classifier:     'phi4-mini:3.8b',
      summarize:      'qwen3:8b',
      extract:        'phi4-mini:3.8b',
      chat:           'qwen3:8b',
      agent:          'qwen3:8b',
      rag:            'qwen3:8b',
      news_synthesis: 'qwen3:8b',
      tool_call:      'qwen3:8b',
      coding:         'qwen2.5-coder:7b',
      embed:          'nomic-embed-text',
    },
  },
}

// Legacy models kept for migration path — users who saved old model names get
// these replaced with balanced-preset equivalents on first load.
const LEGACY_MODEL_MAP: Record<string, string> = {
  'llama3.2:3b':       'phi4-mini:3.8b',
  'phi3:3.8b':         'phi4-mini:3.8b',
  'qwen2.5:7b-instruct': 'qwen3:8b',
}

function migrateLegacyModel(model: string): string {
  return LEGACY_MODEL_MAP[model] ?? model
}

// Default models = balanced preset (RTX 3060 Ti recommended)
const DEFAULT_MODELS: ModelConfig = MODEL_PRESETS.balanced.config

// ── ModelRouter ────────────────────────────────────────────────────────────────

export class ModelRouter {
  private config: ModelConfig
  private client: OllamaClient
  private activePreset: ModelPresetName | 'custom' = 'balanced'

  constructor(client: OllamaClient, config?: Partial<ModelConfig>) {
    this.client = client
    // Migrate any legacy model names before applying overrides
    const migrated = config
      ? (Object.fromEntries(
          Object.entries(config).map(([k, v]) => [k, migrateLegacyModel(v as string)]),
        ) as Partial<ModelConfig>)
      : {}
    this.config = { ...DEFAULT_MODELS, ...migrated }
    // Determine if the resulting config matches a preset
    this.activePreset = this.detectPreset()
  }

  modelFor(role: ModelRole): string {
    return this.config[role]
  }

  updateConfig(partial: Partial<ModelConfig>): void {
    this.config = { ...this.config, ...partial }
    this.activePreset = this.detectPreset()
  }

  /** Apply a named preset, optionally overlaying per-role overrides on top. */
  applyPreset(name: ModelPresetName, overrides?: Partial<ModelConfig>): void {
    this.config = { ...MODEL_PRESETS[name].config, ...overrides }
    this.activePreset = overrides ? this.detectPreset() : name
  }

  getClient(): OllamaClient {
    return this.client
  }

  getConfig(): ModelConfig {
    return { ...this.config }
  }

  getDefaultConfig(): ModelConfig {
    return { ...DEFAULT_MODELS }
  }

  getActivePreset(): ModelPresetName | 'custom' {
    return this.activePreset
  }

  getPresets(): ModelPreset[] {
    return Object.values(MODEL_PRESETS)
  }

  private detectPreset(): ModelPresetName | 'custom' {
    for (const [name, preset] of Object.entries(MODEL_PRESETS)) {
      if (
        Object.entries(preset.config).every(
          ([role, model]) => this.config[role as ModelRole] === model,
        )
      ) {
        return name as ModelPresetName
      }
    }
    return 'custom'
  }
}

// Singleton — initialized by main process, shared across workers via re-instantiation
let _router: ModelRouter | null = null

export function initModelRouter(client: OllamaClient, config?: Partial<ModelConfig>): ModelRouter {
  _router = new ModelRouter(client, config)
  return _router
}

export function getModelRouter(): ModelRouter {
  if (!_router) throw new Error('ModelRouter not initialized — call initModelRouter() first')
  return _router
}
