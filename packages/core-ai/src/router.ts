import type { OllamaClient } from './client'

// Task names map to logical model roles; actual model IDs come from settings.
// Wave 3 expands roles to cover all distinct task categories.
export type ModelRole =
  | 'classifier' // intent classification, labelling (fast, small model preferred)
  | 'chat' // multi-turn conversation
  | 'summarize' // summarization / briefing
  | 'extract' // extraction / rewriting
  | 'agent' // agent planner + reflection (may need stronger model)
  | 'embed' // embedding (vector model, not a chat model)

export type ModelConfig = {
  classifier: string
  chat: string
  summarize: string
  extract: string
  agent: string
  embed: string
}

const DEFAULT_MODELS: ModelConfig = {
  classifier: 'llama3.2:3b',
  chat: 'qwen2.5:7b-instruct',
  summarize: 'phi3:3.8b',
  extract: 'phi3:3.8b',
  agent: 'qwen2.5:7b-instruct',
  embed: 'nomic-embed-text',
}

export class ModelRouter {
  private config: ModelConfig
  private client: OllamaClient

  constructor(client: OllamaClient, config?: Partial<ModelConfig>) {
    this.client = client
    this.config = { ...DEFAULT_MODELS, ...config }
  }

  modelFor(role: ModelRole): string {
    return this.config[role]
  }

  updateConfig(partial: Partial<ModelConfig>): void {
    this.config = { ...this.config, ...partial }
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
