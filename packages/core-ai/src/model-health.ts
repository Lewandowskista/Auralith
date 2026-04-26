import type { OllamaClient } from './client'
import type { ModelConfig } from './router'

export type ModelHealthReport = {
  /** Models required by the active config that are already installed. */
  installed: string[]
  /** Models required by the active config that are missing from Ollama. */
  missing: string[]
  /** Ollama pull commands for every missing model. */
  pullCommands: string[]
  /** Whether Ollama itself responded. */
  ollamaReachable: boolean
}

/**
 * Check which models from `config` are actually installed in Ollama.
 *
 * Does NOT pull models automatically — returns pull commands instead so the
 * caller / UI can ask the user for confirmation first.
 *
 * All roles in ModelConfig are checked, including the coding role
 * (qwen2.5-coder:7b in the balanced/quality presets).
 */
export async function checkModelHealth(
  client: OllamaClient,
  config: ModelConfig,
): Promise<ModelHealthReport> {
  let installedList: string[] = []
  let ollamaReachable = false

  try {
    installedList = await client.listModels()
    ollamaReachable = true
  } catch {
    return {
      installed: [],
      missing: [],
      pullCommands: [],
      ollamaReachable: false,
    }
  }

  // Normalise: Ollama may return "modelname:tag" or just "modelname"
  const installedSet = new Set(installedList.map((m) => m.toLowerCase()))

  const requiredModels = [
    ...new Set(Object.values(config)), // deduplicate — multiple roles may share a model
  ]

  const installed: string[] = []
  const missing: string[] = []

  for (const model of requiredModels) {
    const normalised = model.toLowerCase()
    // Match exact name or prefix (e.g. "nomic-embed-text" matches "nomic-embed-text:latest")
    const found =
      installedSet.has(normalised) ||
      [...installedSet].some((i) => i === normalised || i.startsWith(`${normalised}:`))
    if (found) {
      installed.push(model)
    } else {
      missing.push(model)
    }
  }

  const pullCommands = missing.map((m) => `ollama pull ${m}`)

  return { installed, missing, pullCommands, ollamaReachable }
}

/**
 * Returns install hints for every required model that is missing, formatted
 * for display in a UI banner or CLI output.
 *
 * Balanced preset pull commands (RTX 3060 Ti recommended setup):
 *   ollama pull phi4-mini:3.8b
 *   ollama pull qwen3:8b
 *   ollama pull qwen2.5-coder:7b
 *   ollama pull nomic-embed-text
 */
export function formatMissingModelHints(report: ModelHealthReport): string {
  if (!report.ollamaReachable) {
    return 'Ollama is not running. Start it with: ollama serve'
  }
  if (report.missing.length === 0) {
    return 'All required models are installed.'
  }
  const lines = [
    `Missing ${report.missing.length} model(s). Run the following commands to install them:`,
    ...report.pullCommands.map((cmd) => `  ${cmd}`),
    '',
    'Recommended balanced preset (RTX 3060 Ti):',
    '  ollama pull phi4-mini:3.8b      # classifier, summarize, extract',
    '  ollama pull qwen3:8b            # chat, agent, rag, news_synthesis, tool_call',
    '  ollama pull qwen2.5-coder:7b   # coding role',
    '  ollama pull nomic-embed-text    # embeddings',
    '',
    'Warning: only one large model (≥7B) should be active at a time on 8 GB VRAM.',
  ]
  return lines.join('\n')
}
