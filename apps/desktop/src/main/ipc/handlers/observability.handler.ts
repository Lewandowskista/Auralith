import { z } from 'zod'
import { registerHandler } from '../router'
import type { ObservabilityRepo } from '@auralith/core-db'
import type { OllamaClient } from '@auralith/core-ai'
import { getJsonReliabilityStats } from '@auralith/core-ai'
import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import type Database from 'better-sqlite3'

type ObsDeps = {
  obsRepo: ObservabilityRepo
  chatClient: OllamaClient
  dataDir: string
  sqlite: Database.Database
}

let _deps: ObsDeps | null = null

export function initObsDeps(deps: ObsDeps): void {
  _deps = deps
}

function getDeps(): ObsDeps {
  if (!_deps) throw new Error('Observability deps not initialized')
  return _deps
}

const QueryTracesParamsSchema = z.object({
  op: z.string().optional(),
  fromTs: z.number().optional(),
  toTs: z.number().optional(),
  slowOnlyMs: z.number().optional(),
  limit: z.number().max(500).optional(),
})

export function registerObservabilityHandlers(): void {
  registerHandler('obs.queryTraces', async (params) => {
    const { obsRepo } = getDeps()
    const opts = QueryTracesParamsSchema.parse(params)
    const queryOpts: Parameters<typeof obsRepo.queryTraces>[0] = {}
    if (opts.op !== undefined) queryOpts.op = opts.op
    if (opts.fromTs !== undefined) queryOpts.fromTs = opts.fromTs
    if (opts.toTs !== undefined) queryOpts.toTs = opts.toTs
    if (opts.slowOnlyMs !== undefined) queryOpts.slowOnlyMs = opts.slowOnlyMs
    if (opts.limit !== undefined) queryOpts.limit = opts.limit
    const traces = obsRepo.queryTraces(queryOpts)
    const stats = obsRepo.getTraceStats(
      opts.fromTs ?? Date.now() - 24 * 60 * 60 * 1000,
      opts.toTs ?? Date.now(),
    )
    return { traces, stats }
  })

  registerHandler('obs.getReliability', async () => {
    const { obsRepo } = getDeps()
    // Also flush current in-memory stats
    const liveStats = getJsonReliabilityStats()
    const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000))
    for (const stat of liveStats) {
      if (stat.attempts > 0) {
        obsRepo.upsertReliability({
          model: stat.model,
          role: stat.role,
          promptId: stat.promptTemplateId,
          hourBucket,
          attempts: stat.attempts,
          parseFailures: stat.parseFailures,
          validationFailures: stat.validationFailures,
          repaired: stat.repairedJson,
          successes: stat.successes,
        })
      }
    }
    const fromHourBucket = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / (60 * 60 * 1000))
    const rows = obsRepo.getReliability(fromHourBucket)
    return { rows, liveStats }
  })

  registerHandler('obs.getRetrievalQuality', async (params) => {
    const { obsRepo } = getDeps()
    const opts = z
      .object({ fromTs: z.number().optional(), limit: z.number().optional() })
      .parse(params)
    const traces = obsRepo.queryRetrievalTraces({
      fromTs: opts.fromTs ?? Date.now() - 24 * 60 * 60 * 1000,
      limit: opts.limit ?? 100,
    })
    const avgLatency =
      traces.length > 0
        ? Math.round(traces.reduce((s, t) => s + t.latencyMs, 0) / traces.length)
        : 0
    const avgHits =
      traces.length > 0
        ? (traces.reduce((s, t) => s + t.hitCount, 0) / traces.length).toFixed(1)
        : '0'
    return { traces, avgLatency, avgHits: Number(avgHits) }
  })

  registerHandler('obs.runCheckup', async () => {
    const { obsRepo, chatClient, dataDir, sqlite } = getDeps()
    const results: Array<{ id: string; label: string; pass: boolean; ms: number; detail: string }> =
      []

    async function check(id: string, label: string, fn: () => Promise<string>): Promise<void> {
      const t0 = performance.now()
      try {
        const detail = await fn()
        results.push({ id, label, pass: true, ms: Math.round(performance.now() - t0), detail })
      } catch (err) {
        results.push({
          id,
          label,
          pass: false,
          ms: Math.round(performance.now() - t0),
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // 1. Ollama ping + model list
    await check('ollama', 'Ollama connectivity', async () => {
      const models = await chatClient.listModels()
      return `${models.length} model(s) available`
    })

    // 2. SQLite quick_check
    await check('sqlite', 'SQLite integrity', async () => {
      const row = sqlite.prepare('PRAGMA quick_check').get() as { quick_check: string } | undefined
      if (row?.quick_check !== 'ok') throw new Error(row?.quick_check ?? 'check failed')
      return 'ok'
    })

    // 3. RAG sample query
    await check('rag', 'RAG search', async () => {
      const rows = sqlite.prepare('SELECT id FROM chunks LIMIT 1').all() as Array<{ id: string }>
      if (rows.length === 0) return 'No chunks indexed yet — skipped'
      const ftsRows = sqlite
        .prepare("SELECT rowid FROM chunks_fts MATCH 'the OR a OR is' LIMIT 1")
        .all()
      if (ftsRows.length === 0) throw new Error('FTS returned no results')
      return `FTS operational (${ftsRows.length} result)`
    })

    // 4. JSON output test (intent classify)
    await check('json-output', 'Structured output (intent classify)', async () => {
      const { runPrompt } = await import('@auralith/core-ai')
      const { INTENT_CLASSIFY_V1 } = await import('@auralith/core-ai')
      const result = await runPrompt(
        INTENT_CLASSIFY_V1,
        { utterance: 'what is the weather today?' },
        chatClient,
        await (async () => {
          const models = await chatClient.listModels()
          return models[0] ?? 'phi4-mini:3.8b'
        })(),
      )
      if (!result.ok) throw new Error(`Parse failed: ${result.error}`)
      return `ok — intent: ${(result.data as { intent?: string }).intent ?? 'unknown'}`
    })

    // 5. Whisper binary + TTS
    await check('voice', 'Voice deps', async () => {
      const whisperPath = join(dataDir, '..', 'resources', 'whisper', 'main.exe')
      const exists = existsSync(whisperPath)
      let ttsOk = false
      try {
        execSync(
          'powershell -Command "Add-Type -AssemblyName System.Speech; [void][System.Speech.Synthesis.SpeechSynthesizer]::new()"',
          { timeout: 3000 },
        )
        ttsOk = true
      } catch {
        // TTS init failed — non-fatal
      }
      return `whisper binary: ${exists ? 'present' : 'missing'}, TTS: ${ttsOk ? 'ok' : 'unavailable'}`
    })

    // 6. Disk free > 2 GB
    await check('disk', 'Disk space', async () => {
      try {
        const result = execSync(`powershell -Command "(Get-PSDrive C).Free"`, {
          timeout: 3000,
          encoding: 'utf8',
        }).trim()
        const bytes = parseInt(result, 10)
        const gb = (bytes / 1024 ** 3).toFixed(1)
        if (bytes < 2 * 1024 ** 3) throw new Error(`Only ${gb} GB free — need 2 GB+`)
        return `${gb} GB free`
      } catch (err) {
        if (err instanceof Error && err.message.includes('GB free')) throw err
        return 'disk check skipped'
      }
    })

    // Prune stale traces (7 days)
    obsRepo.pruneTraces(7 * 24 * 60 * 60 * 1000)
    obsRepo.pruneRetrievalTraces(7 * 24 * 60 * 60 * 1000)
    obsRepo.pruneReliability(Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / (60 * 60 * 1000)))

    return {
      results,
      allPass: results.every((r) => r.pass),
      ts: Date.now(),
    }
  })
}
