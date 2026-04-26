import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { z } from 'zod'
import { registerHandler } from '../router'
import type { DbBundle } from '@auralith/core-db'
import type { OllamaClient } from '@auralith/core-ai'
import { runAgentLoop, getAiQueue } from '@auralith/core-ai'
import { listToolsForModel, executeTool } from '@auralith/core-tools'
import type { ExecutorDeps } from '@auralith/core-tools'
import type Database from 'better-sqlite3'

type AgentDeps = {
  bundle: DbBundle
  sqlite: Database.Database
  chatClient: OllamaClient
  chatModel: string
  executorDeps: ExecutorDeps
}

let _deps: AgentDeps | null = null
const cancelFlags = new Map<string, boolean>()

export function initAgentDeps(deps: AgentDeps): void {
  _deps = deps
}

function getDeps(): AgentDeps {
  if (!_deps) throw new Error('Agent deps not initialized')
  return _deps
}

function broadcastAgentUpdate(runId: string, state: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('agent:state-update', { runId, state })
  }
}

function persistRunStart(
  sqlite: Database.Database,
  runId: string,
  sessionId: string,
  planJson: string,
): void {
  try {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO agent_runs (id, session_id, status, plan_json, steps_json, started_at)
       VALUES (?, ?, 'running', ?, '[]', ?)`,
      )
      .run(runId, sessionId, planJson, Date.now())
  } catch {
    /* non-fatal */
  }
}

function persistRunEnd(
  sqlite: Database.Database,
  runId: string,
  status: string,
  stepsJson: string,
  error?: string,
): void {
  try {
    sqlite
      .prepare(
        `UPDATE agent_runs SET status = ?, steps_json = ?, ended_at = ?, error = ? WHERE id = ?`,
      )
      .run(status, stepsJson, Date.now(), error ?? null, runId)
  } catch {
    /* non-fatal */
  }
}

export function registerAgentHandlers(): void {
  registerHandler('agent.run', async (params) => {
    const {
      goal,
      sessionId: clientSessionId,
      maxSteps,
      timeoutMs,
    } = z
      .object({
        goal: z.string().min(1),
        sessionId: z.string().optional(),
        maxSteps: z.number().int().min(1).max(30).default(15),
        timeoutMs: z.number().int().min(5_000).max(300_000).default(180_000),
      })
      .parse(params)

    const { sqlite, chatClient, chatModel, executorDeps } = getDeps()
    const runId = randomUUID()
    const sessionId = clientSessionId ?? randomUUID()

    cancelFlags.set(runId, false)
    persistRunStart(sqlite, runId, sessionId, '{}')

    // Signal the AI queue so background news/briefing jobs don't compete
    // with the agent while it is running (can take up to 3 minutes).
    let agentQueue = null as ReturnType<typeof getAiQueue> | null
    try {
      agentQueue = getAiQueue()
    } catch {
      /* queue not initialized */
    }
    agentQueue?.beginForegroundAiTask()

    void runAgentLoop(runId, sessionId, goal, {
      chatClient,
      chatModel,
      tools: listToolsForModel(),
      maxSteps,
      timeoutMs,
      isCancelled: () => cancelFlags.get(runId) ?? false,
      onStateUpdate: (state) => {
        broadcastAgentUpdate(runId, state)
        if (state.plan) {
          persistRunStart(sqlite, runId, sessionId, JSON.stringify(state.plan))
        }
        if (
          state.status === 'completed' ||
          state.status === 'failed' ||
          state.status === 'cancelled'
        ) {
          persistRunEnd(
            sqlite,
            runId,
            state.status,
            JSON.stringify(state.plan?.steps ?? []),
            state.error,
          )
          cancelFlags.delete(runId)
          agentQueue?.endForegroundAiTask()
          agentQueue = null // prevent double-release on catch path
        }
      },
      executeTool: async (toolId, params) => {
        if (cancelFlags.get(runId)) return { outcome: 'cancelled' as const }
        const win = BrowserWindow.getAllWindows()[0]
        win?.webContents.send('agent:tool-call', { runId, toolId, params })
        const result = await executeTool(
          toolId,
          params,
          { traceId: runId, actor: 'user' },
          executorDeps,
        )
        win?.webContents.send('agent:tool-result', { runId, toolId, outcome: result.outcome })
        return result
      },
    }).catch((err) => {
      broadcastAgentUpdate(runId, {
        runId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      persistRunEnd(
        sqlite,
        runId,
        'failed',
        '[]',
        err instanceof Error ? err.message : 'Unknown error',
      )
      cancelFlags.delete(runId)
      agentQueue?.endForegroundAiTask()
    })

    return { runId, sessionId }
  })

  registerHandler('agent.cancel', async (params) => {
    const { runId } = z.object({ runId: z.string() }).parse(params)
    const had = cancelFlags.has(runId)
    if (had) cancelFlags.set(runId, true)
    return { cancelled: had }
  })

  registerHandler('agent.listRuns', async (params) => {
    const { sessionId, limit } = z
      .object({
        sessionId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      })
      .parse(params)

    const { sqlite } = getDeps()

    type RunRow = {
      id: string
      sessionId: string
      status: string
      planJson: string | null
      startedAt: number
      endedAt: number | null
      error: string | null
    }
    const rows: RunRow[] = sessionId
      ? (sqlite
          .prepare(
            `SELECT id, session_id AS sessionId, status, plan_json AS planJson, started_at AS startedAt, ended_at AS endedAt, error FROM agent_runs WHERE session_id = ? ORDER BY started_at DESC LIMIT ?`,
          )
          .all(sessionId, limit) as RunRow[])
      : (sqlite
          .prepare(
            `SELECT id, session_id AS sessionId, status, plan_json AS planJson, started_at AS startedAt, ended_at AS endedAt, error FROM agent_runs ORDER BY started_at DESC LIMIT ?`,
          )
          .all(limit) as RunRow[])

    return {
      runs: rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        status: r.status,
        plan: r.planJson ? JSON.parse(r.planJson) : null,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        error: r.error,
      })),
    }
  })
}
