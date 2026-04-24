import { registerHandler } from '../router'
import {
  OllamaPingParamsSchema,
  OllamaListModelsParamsSchema,
  OllamaSaveConfigParamsSchema,
  OllamaTestFeatureParamsSchema,
  OllamaGetConfigParamsSchema,
} from '@auralith/core-domain'
import { OllamaClient, getModelRouter, type ModelConfig } from '@auralith/core-ai'
import type { DbBundle } from '@auralith/core-db'
import { createSettingsRepo } from '@auralith/core-db'
import { z } from 'zod'

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
    const { url } = OllamaListModelsParamsSchema.parse(params)
    const client = new OllamaClient({ baseUrl: url })
    try {
      const models = await client.listModels()
      return { models }
    } catch {
      return { models: [] }
    }
  })

  registerHandler('ollama.getConfig', async (params) => {
    OllamaGetConfigParamsSchema.parse(params)
    return {
      url: settings.get('ollama.url', z.string()) ?? 'http://localhost:11434',
      chatModel: settings.get('ollama.chatModel', z.string()) ?? 'phi4-mini:3.8b',
      embedModel: settings.get('ollama.embedModel', z.string()) ?? 'nomic-embed-text',
      classifierModel: settings.get('ollama.classifierModel', z.string()) ?? 'nomic-embed-text',
    }
  })

  registerHandler('ollama.saveConfig', async (params) => {
    const { url, chatModel, embedModel, classifierModel } =
      OllamaSaveConfigParamsSchema.parse(params)
    settings.set('ollama.url', url)
    settings.set('ollama.chatModel', chatModel)
    settings.set('ollama.embedModel', embedModel)
    settings.set('ollama.classifierModel', classifierModel)
    return { saved: true }
  })

  registerHandler('ollama.getModelRouting', async () => {
    try {
      const router = getModelRouter()
      return { config: router.getConfig(), defaults: router.getDefaultConfig() }
    } catch {
      return { config: null, defaults: null }
    }
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
}
