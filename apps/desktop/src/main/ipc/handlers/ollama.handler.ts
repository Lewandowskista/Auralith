import { registerHandler } from '../router'
import {
  OllamaPingParamsSchema,
  OllamaListModelsParamsSchema,
  OllamaSaveConfigParamsSchema,
  OllamaTestFeatureParamsSchema,
  OllamaGetConfigParamsSchema,
  OllamaTestRoleParamsSchema,
} from '@auralith/core-domain'
import {
  OllamaClient,
  getModelRouter,
  getJsonReliabilityStats,
  checkModelHealth,
  formatMissingModelHints,
  MODEL_PRESETS,
  type ModelConfig,
  type ModelPresetName,
} from '@auralith/core-ai'
import type { DbBundle } from '@auralith/core-db'
import { createSettingsRepo } from '@auralith/core-db'
import { z } from 'zod'

// Smoke-test prompts per role — tiny, deterministic, fast to evaluate
const ROLE_TEST_PROMPTS: Record<
  string,
  { system: string; user: string; expectJson: boolean; validate: (out: string) => boolean }
> = {
  chat: {
    system: 'You are a helpful assistant. Reply concisely.',
    user: 'Say "hello" and nothing else.',
    expectJson: false,
    validate: (out) => out.trim().length > 0,
  },
  agent: {
    system: 'You are a planning assistant. Output valid JSON only.',
    user: 'Create a one-step plan to open a browser. Output: {"steps":["..."]}',
    expectJson: true,
    validate: (out) => {
      try {
        const p = JSON.parse(out)
        return Array.isArray(p.steps)
      } catch {
        return false
      }
    },
  },
  summarize: {
    system: 'You summarize text. Output valid JSON only.',
    user: 'Summarize: "The sky is blue." Output: {"summary":"..."}',
    expectJson: true,
    validate: (out) => {
      try {
        const p = JSON.parse(out)
        return typeof p.summary === 'string'
      } catch {
        return false
      }
    },
  },
  classifier: {
    system: 'Classify intent. Output valid JSON only.',
    user: 'Classify: "What is the weather today?" Output: {"intent":"weather_query","confidence":0.95}',
    expectJson: true,
    validate: (out) => {
      try {
        const p = JSON.parse(out)
        return typeof p.intent === 'string'
      } catch {
        return false
      }
    },
  },
  extract: {
    system: 'Extract data. Output valid JSON only.',
    user: 'Extract entities from: "John Smith lives in Paris." Output: {"entities":[{"name":"...","type":"..."}]}',
    expectJson: true,
    validate: (out) => {
      try {
        const p = JSON.parse(out)
        return Array.isArray(p.entities)
      } catch {
        return false
      }
    },
  },
  embed: {
    // Embed is tested via the embed API directly, not a chat prompt
    system: '',
    user: 'test embedding sentence',
    expectJson: false,
    validate: (out) => out.startsWith('embed:') && !out.includes('error'),
  },
}

export function registerOllamaHandlers(bundle: DbBundle): void {
  const settings = createSettingsRepo(bundle.db)

  registerHandler('ollama.ping', async (params) => {
    const parsed = OllamaPingParamsSchema.parse(params)
    const resolvedUrl =
      parsed.url || settings.get('ollama.url', z.string()) || 'http://localhost:11434'
    const client = new OllamaClient({ baseUrl: resolvedUrl })
    const online = await client.ping()
    let modelCount = 0
    if (online) {
      try {
        const models = await client.listModels()
        modelCount = models.length
      } catch {
        // ignore
      }
    }
    return { online, modelCount }
  })

  registerHandler('ollama.listModels', async (params) => {
    const parsed = OllamaListModelsParamsSchema.parse(params)
    const resolvedUrl =
      parsed.url || settings.get('ollama.url', z.string()) || 'http://localhost:11434'
    const client = new OllamaClient({ baseUrl: resolvedUrl })
    try {
      const models = await client.listModels()
      return { models }
    } catch {
      return { models: [] }
    }
  })

  registerHandler('ollama.getConfig', async (params) => {
    OllamaGetConfigParamsSchema.parse(params)
    // Prefer live router values so the UI reflects any preset/override change made
    // this session, not stale persisted strings from a previous preset.
    let live: ModelConfig | null = null
    try {
      live = getModelRouter().getConfig()
    } catch {
      /* router not yet up */
    }
    return {
      url: settings.get('ollama.url', z.string()) ?? 'http://localhost:11434',
      chatModel:
        live?.chat ??
        settings.get('ollama.modelRouting.chat', z.string()) ??
        settings.get('ollama.chatModel', z.string()) ??
        'qwen3:8b',
      embedModel:
        live?.embed ??
        settings.get('ollama.modelRouting.embed', z.string()) ??
        settings.get('ollama.embedModel', z.string()) ??
        'nomic-embed-text',
      classifierModel:
        live?.classifier ??
        settings.get('ollama.modelRouting.classifier', z.string()) ??
        settings.get('ollama.classifierModel', z.string()) ??
        'phi4-mini:3.8b',
      summarizeModel:
        live?.summarize ??
        settings.get('ollama.modelRouting.summarize', z.string()) ??
        'phi4-mini:3.8b',
      extractModel:
        live?.extract ??
        settings.get('ollama.modelRouting.extract', z.string()) ??
        'phi4-mini:3.8b',
      agentModel:
        live?.agent ?? settings.get('ollama.modelRouting.agent', z.string()) ?? 'qwen3:8b',
    }
  })

  registerHandler('ollama.saveConfig', async (params) => {
    const {
      url,
      chatModel,
      embedModel,
      classifierModel,
      summarizeModel,
      extractModel,
      agentModel,
    } = OllamaSaveConfigParamsSchema.parse(params)
    settings.set('ollama.url', url)
    // Persist both legacy keys (for backward compat) and new routing keys
    settings.set('ollama.chatModel', chatModel)
    settings.set('ollama.embedModel', embedModel)
    settings.set('ollama.classifierModel', classifierModel)
    settings.set('ollama.modelRouting.chat', chatModel)
    settings.set('ollama.modelRouting.embed', embedModel)
    settings.set('ollama.modelRouting.classifier', classifierModel)
    settings.set('ollama.modelRouting.summarize', summarizeModel)
    settings.set('ollama.modelRouting.extract', extractModel)
    settings.set('ollama.modelRouting.agent', agentModel)
    // Update live router so changes take effect immediately without restart
    try {
      getModelRouter().updateConfig({
        chat: chatModel,
        embed: embedModel,
        classifier: classifierModel,
        summarize: summarizeModel,
        extract: extractModel,
        agent: agentModel,
      })
    } catch {
      /* router not yet up */
    }
    return { saved: true }
  })

  registerHandler('ollama.getModelRouting', async () => {
    try {
      const router = getModelRouter()
      return {
        config: router.getConfig(),
        defaults: router.getDefaultConfig(),
        activePreset: router.getActivePreset(),
        presets: router.getPresets(),
      }
    } catch {
      return { config: null, defaults: null, activePreset: null, presets: [] }
    }
  })

  registerHandler('ollama.applyPreset', async (params) => {
    const { preset } = z.object({ preset: z.enum(['fast', 'balanced', 'quality']) }).parse(params)
    try {
      const router = getModelRouter()
      router.applyPreset(preset as ModelPresetName)
      // Persist as individual role overrides so settings survive restarts
      const config = router.getConfig()
      for (const [role, model] of Object.entries(config)) {
        settings.set(`ollama.modelRouting.${role}`, model)
      }
      settings.set('ollama.activePreset', preset)
      return { applied: true, config }
    } catch {
      return { applied: false, config: null }
    }
  })

  registerHandler('ollama.getPresets', async () => {
    return { presets: Object.values(MODEL_PRESETS) }
  })

  registerHandler('ollama.checkModelHealth', async () => {
    try {
      const router = getModelRouter()
      const client = router.getClient()
      const config = router.getConfig()
      const report = await checkModelHealth(client, config)
      const hints = formatMissingModelHints(report)
      return { ...report, hints }
    } catch (err) {
      return {
        installed: [],
        missing: [],
        pullCommands: [],
        ollamaReachable: false,
        hints: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  })

  registerHandler('ollama.getJsonReliabilityStats', async () => {
    return { stats: getJsonReliabilityStats() }
  })

  registerHandler('ollama.saveModelRouting', async (params) => {
    const update = z
      .object({
        classifier: z.string().optional(),
        chat: z.string().optional(),
        summarize: z.string().optional(),
        extract: z.string().optional(),
        agent: z.string().optional(),
        embed: z.string().optional(),
      })
      .parse(params)

    // Persist each non-undefined value
    const keyMap: Record<string, string> = {
      classifier: 'ollama.modelRouting.classifier',
      chat: 'ollama.modelRouting.chat',
      summarize: 'ollama.modelRouting.summarize',
      extract: 'ollama.modelRouting.extract',
      agent: 'ollama.modelRouting.agent',
      embed: 'ollama.modelRouting.embed',
    }
    for (const [k, v] of Object.entries(update)) {
      const settingKey = keyMap[k]
      if (v !== undefined && settingKey !== undefined) settings.set(settingKey, v)
    }

    // Update live router
    try {
      getModelRouter().updateConfig(update as Partial<ModelConfig>)
    } catch {
      /* router not yet initialized — settings will be read on next restart */
    }

    return { saved: true }
  })

  registerHandler('ollama.testFeature', async (params) => {
    const { url, feature, model } = OllamaTestFeatureParamsSchema.parse(params)
    const client = new OllamaClient({ baseUrl: url, timeoutMs: 60_000 })
    const start = Date.now()
    try {
      if (feature === 'chat') {
        // Stream and bail on first token — measures time-to-first-token, not full generation
        const gen = client.stream({
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          maxTokens: 16,
        })
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of gen) {
          break
        }
        await gen.return(undefined)
      } else {
        await client.embed({ model, input: 'test' })
      }
      return { ok: true, latencyMs: Date.now() - start }
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  registerHandler('ollama.testRole', async (params) => {
    const { url, role, model } = OllamaTestRoleParamsSchema.parse(params)
    const client = new OllamaClient({ baseUrl: url, timeoutMs: 90_000 })
    const start = Date.now()

    try {
      if (role === 'embed') {
        // Embed uses the embedding API, not the chat API
        const vectors = await client.embed({ model, input: 'The quick brown fox' })
        const dim = Array.isArray(vectors) && vectors.length > 0 ? (vectors[0]?.length ?? 0) : 0
        return {
          ok: dim > 0,
          latencyMs: Date.now() - start,
          ...(dim > 0 ? { output: `embed:${dim}-dim vector` } : {}),
          ...(dim === 0 ? { error: 'Embed returned empty vector' } : {}),
        }
      }

      const probe = ROLE_TEST_PROMPTS[role]
      if (!probe) return { ok: false, latencyMs: 0, error: `Unknown role: ${role}` }

      // Collect full generation — test runs are short (maxTokens:128)
      let fullOutput = ''
      const gen = client.stream({
        model,
        messages: [
          { role: 'system', content: probe.system },
          { role: 'user', content: probe.user },
        ],
        maxTokens: 128,
        ...(probe.expectJson ? { format: 'json' } : {}),
      })
      for await (const chunk of gen) {
        fullOutput += chunk
      }

      const trimmed = fullOutput.trim()
      const valid = probe.validate(trimmed)

      return {
        ok: valid,
        latencyMs: Date.now() - start,
        output: trimmed.slice(0, 200), // truncate for UI display
        ...(!valid ? { error: `Output did not match expected schema for role "${role}"` } : {}),
      }
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
}
