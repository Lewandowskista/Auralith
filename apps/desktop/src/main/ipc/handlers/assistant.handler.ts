import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { z } from 'zod'
import { registerHandler } from '../router'
import { createSettingsRepo, type DbBundle } from '@auralith/core-db'
import {
  AssistantSendParamsSchema,
  AssistantAbortParamsSchema,
  AssistantGetSessionParamsSchema,
  AssistantListSessionsParamsSchema,
  AssistantDeleteSessionParamsSchema,
} from '@auralith/core-domain'
import type { OllamaClient, ModelRouter } from '@auralith/core-ai'
import { runTurn, runCodingTurn, getAiQueue, runPrompt, ROUTE_CLASSIFY_V1 } from '@auralith/core-ai'
import {
  hybridSearch,
  assembleCitations,
  rewriteQuery,
  createLlmReranker,
} from '@auralith/core-retrieval'
import { listToolsForModel, executeTool } from '@auralith/core-tools'
import type Database from 'better-sqlite3'
import type { ExecutorDeps } from '@auralith/core-tools'
import { getAppContextBroker } from '../../ai/app-context-setup'
import type { VoiceIntent } from '../../voice/intent-classifier'

type AssistantDeps = {
  bundle: DbBundle
  sqlite: Database.Database
  chatClient: OllamaClient
  chatModel: string
  codingClient: OllamaClient
  codingModel: string
  embedClient: OllamaClient
  embedModel: string
  executorDeps: ExecutorDeps
  router?: ModelRouter
}

type CachedTurn = {
  role: string
  content: string
  toolId?: string
  toolResultJson?: string
}

type StoredThreadRow = {
  id: string
  startedAt: number
  lastMessageAt: number
  title?: string
  messageCount: number
}

let _deps: AssistantDeps | null = null
const abortFlags = new Map<string, boolean>()
const sessionHistories = new Map<string, CachedTurn[]>()

export function initAssistantDeps(deps: AssistantDeps): void {
  _deps = deps
}

function getDeps(): AssistantDeps {
  if (!_deps) throw new Error('Assistant deps not initialized')
  return _deps
}

function loadRecentTurnHistory(
  sqlite: Database.Database,
  sessionId: string,
  limit = 20,
): CachedTurn[] {
  type TurnRow = {
    role: string
    content: string
    toolId: string | null
    toolResultJson: string | null
  }

  const rows = sqlite
    .prepare(
      `
    SELECT role, content, tool_id AS toolId, tool_result_json AS toolResultJson
    FROM conversation_turns
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `,
    )
    .all(sessionId, limit) as TurnRow[]

  return rows.reverse().map((row) => ({
    role: row.role,
    content: row.content,
    ...(row.toolId ? { toolId: row.toolId } : {}),
    ...(row.toolResultJson ? { toolResultJson: row.toolResultJson } : {}),
  }))
}

function loadThreadMessages(
  sqlite: Database.Database,
  sessionId: string,
): Array<{
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: number
}> {
  type MessageRow = {
    id: string
    role: 'user' | 'assistant'
    content: string
    createdAt: number
  }

  const rows = sqlite
    .prepare(
      `
    SELECT id, role, content, created_at AS createdAt
    FROM conversation_turns
    WHERE session_id = ? AND role IN ('user', 'assistant')
    ORDER BY created_at ASC
  `,
    )
    .all(sessionId) as MessageRow[]

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    ts: row.createdAt,
  }))
}

function listStoredThreads(
  sqlite: Database.Database,
  limit: number,
  offset: number,
): StoredThreadRow[] {
  type ThreadRow = {
    id: string
    startedAt: number
    lastMessageAt: number
    title: string | null
    messageCount: number
  }

  const rows = sqlite
    .prepare(
      `
    SELECT
      base.session_id AS id,
      MIN(base.created_at) AS startedAt,
      MAX(base.created_at) AS lastMessageAt,
      (
        SELECT content
        FROM conversation_turns first_user
        WHERE first_user.session_id = base.session_id AND first_user.role = 'user'
        ORDER BY first_user.created_at ASC
        LIMIT 1
      ) AS title,
      SUM(CASE WHEN base.role IN ('user', 'assistant') THEN 1 ELSE 0 END) AS messageCount
    FROM conversation_turns base
    GROUP BY base.session_id
    ORDER BY MAX(base.created_at) DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(limit, offset) as ThreadRow[]

  return rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    lastMessageAt: row.lastMessageAt,
    ...(row.title ? { title: row.title.slice(0, 80) } : {}),
    messageCount: row.messageCount,
  }))
}

function pushCachedTurn(sessionId: string, turn: CachedTurn): void {
  const history = sessionHistories.get(sessionId) ?? []
  history.push(turn)
  if (history.length > 20) history.splice(0, history.length - 20)
  sessionHistories.set(sessionId, history)
  if (sessionHistories.size > 50) {
    const oldest = sessionHistories.keys().next().value
    if (oldest !== undefined) sessionHistories.delete(oldest)
  }
}

export async function sendVoiceMessage(
  text: string,
  win: BrowserWindow | null,
  conversationId?: string,
  onSpeakChunk?: (chunk: string) => void,
  voiceIntent?: VoiceIntent,
): Promise<{ messageId: string }> {
  const { bundle, sqlite, chatClient, chatModel, embedClient, embedModel, executorDeps } = getDeps()
  const settings = createSettingsRepo(bundle.db)
  const personaOverride = settings.get('assistant.personaOverride', z.string())
  const messageId = randomUUID()
  const sessionId = conversationId ?? messageId

  abortFlags.set(messageId, false)

  let ragContext = ''
  let citations: ReturnType<typeof assembleCitations>['citations'] = []

  // VOICE_QUERY (factual, no personal context needed) skips retrieval entirely.
  if (voiceIntent !== 'VOICE_QUERY') {
    try {
      const { router } = getDeps()
      const settingsVoice = createSettingsRepo(bundle.db)
      const queryRewriteVoice = settingsVoice.get('retrieval.queryRewrite', z.boolean()) ?? true
      const parentContextVoice = settingsVoice.get('retrieval.parentContext', z.number()) ?? 1

      const additionalQueriesVoice =
        queryRewriteVoice && router
          ? await rewriteQuery(text, embedClient, router.modelFor('classifier'))
          : []

      // KNOWLEDGE_SEARCH gets wider retrieval; other intents use default topK.
      const topK = voiceIntent === 'KNOWLEDGE_SEARCH' ? 10 : 6

      const hits = await hybridSearch(
        {
          query: text,
          topK,
          mode: 'hybrid',
          additionalQueries: additionalQueriesVoice,
          parentContext: parentContextVoice,
        },
        bundle.db,
        sqlite,
        bundle.vec,
        embedClient,
        embedModel,
      )
      const assembled = assembleCitations(hits)
      citations = assembled.citations
      if (assembled.chunks.length > 0) {
        ragContext = assembled.chunks
          .map((chunk) => `[${chunk.n}] (${chunk.path})\n${chunk.text}`)
          .join('\n\n---\n\n')
      }
    } catch {
      // No retrieval context — continue without it.
    }
  }

  const cachedHistory = sessionHistories.get(sessionId) ?? loadRecentTurnHistory(sqlite, sessionId)
  sessionHistories.set(sessionId, cachedHistory)

  const history = cachedHistory.map((turn) => ({
    role: turn.role as 'user' | 'assistant' | 'tool_result',
    content: turn.content,
    ...(turn.toolId !== undefined ? { toolId: turn.toolId } : {}),
    ...(turn.toolResultJson !== undefined ? { toolResultJson: turn.toolResultJson } : {}),
  }))

  let queue = null as ReturnType<typeof getAiQueue> | null
  try {
    queue = getAiQueue()
  } catch {
    /* queue not initialized — skip priority signalling */
  }
  queue?.beginForegroundAiTask()

  // Build app context snapshot for voice turn
  let voiceAppContext:
    | { promptContext: string; capabilitiesIncluded: string[]; hadCloudRestrictions: boolean }
    | undefined
  try {
    const broker = getAppContextBroker()
    if (broker) {
      const snapshot = await broker.buildSnapshot({ classifiedIntent: 'chat', userInput: text })
      if (snapshot.promptContext) {
        voiceAppContext = {
          promptContext: snapshot.promptContext,
          capabilitiesIncluded: snapshot.capabilitiesIncluded,
          hadCloudRestrictions: snapshot.hadCloudRestrictions,
        }
      }
    }
  } catch {
    // Best-effort
  }

  try {
    const result = await runTurn({
      userText: text,
      sessionId,
      history,
      tools: listToolsForModel(),
      ragContext,
      voiceMode: true,
      ...(personaOverride !== undefined ? { personaOverride } : {}),
      ...(voiceAppContext !== undefined ? { appContext: voiceAppContext } : {}),
      deps: {
        chatClient,
        chatModel,
        onToken: (token) => {
          if (!abortFlags.get(messageId)) {
            win?.webContents.send('assistant:token', { messageId, token })
            onSpeakChunk?.(token)
          }
        },
        executeTool: async (toolId, toolParams) => {
          if (abortFlags.get(messageId)) return { outcome: 'cancelled' as const }
          win?.webContents.send('assistant:toolCall', { messageId, toolId, params: toolParams })
          const execResult = await executeTool(
            toolId,
            toolParams,
            { traceId: messageId, actor: 'user' },
            executorDeps,
          )
          win?.webContents.send('assistant:toolResult', {
            messageId,
            toolId,
            outcome: execResult.outcome,
            result: execResult.outcome === 'success' ? execResult.result : undefined,
          })
          return execResult
        },
        saveTurn: (turn) => {
          pushCachedTurn(sessionId, {
            role: turn.role,
            content: turn.content,
            ...(turn.toolId !== undefined ? { toolId: turn.toolId } : {}),
            ...(turn.toolResultJson !== undefined ? { toolResultJson: turn.toolResultJson } : {}),
          })
          try {
            sqlite
              .prepare(
                'INSERT INTO conversation_turns(id,session_id,role,content,tool_id,tool_params_json,tool_result_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
              )
              .run(
                randomUUID(),
                sessionId,
                turn.role,
                turn.content,
                turn.toolId ?? null,
                turn.toolParamsJson ?? null,
                turn.toolResultJson ?? null,
                Date.now(),
              )
            sqlite
              .prepare('INSERT OR IGNORE INTO sessions(id, started_at) VALUES(?, ?)')
              .run(sessionId, Date.now())
          } catch {
            // DB may not be migrated yet on first run.
          }
        },
      },
    })

    if (!abortFlags.get(messageId)) {
      win?.webContents.send('assistant:done', {
        messageId,
        citations,
        toolsInvoked: result.toolsInvoked,
      })
      try {
        const summary = result.finalText.slice(0, 200)
        sqlite.prepare('UPDATE sessions SET summary = ? WHERE id = ?').run(summary, sessionId)
      } catch {
        // Best-effort
      }
    }
  } catch (err) {
    win?.webContents.send('assistant:error', {
      messageId,
      error: err instanceof Error ? err.message : 'Turn failed',
    })
  } finally {
    abortFlags.delete(messageId)
    queue?.endForegroundAiTask()
  }

  return { messageId }
}

export function registerAssistantHandlers(): void {
  registerHandler('assistant.send', async (params) => {
    const {
      message,
      messageId: clientMessageId,
      sessionId: clientSessionId,
      spaceId,
      model: modelOverride,
    } = AssistantSendParamsSchema.parse(params)
    const {
      bundle,
      sqlite,
      chatClient,
      chatModel: defaultChatModel,
      codingClient,
      codingModel,
      embedClient,
      embedModel,
      executorDeps,
    } = getDeps()
    const chatModel = modelOverride || defaultChatModel
    const settings = createSettingsRepo(bundle.db)
    const personaOverride = settings.get('assistant.personaOverride', z.string())
    const messageId = clientMessageId ?? randomUUID()
    const sessionId = clientSessionId ?? messageId
    const win = BrowserWindow.getAllWindows()[0]

    abortFlags.set(messageId, false)

    let ragContext = ''
    let citations: ReturnType<typeof assembleCitations>['citations'] = []

    try {
      const { router } = getDeps()
      const settings2 = createSettingsRepo(bundle.db)
      const queryRewrite = settings2.get('retrieval.queryRewrite', z.boolean()) ?? true
      const useReranker = settings2.get('retrieval.reranker', z.boolean()) ?? false
      const parentContext = settings2.get('retrieval.parentContext', z.number()) ?? 1

      // Query rewriting: expand the query using phi4-mini (runs in parallel with FTS)
      const additionalQueries =
        queryRewrite && router
          ? await rewriteQuery(message, embedClient, router.modelFor('classifier'))
          : []

      const reranker =
        useReranker && router ? createLlmReranker(embedClient, router.modelFor('rag')) : undefined

      const hits = await hybridSearch(
        {
          query: message,
          ...(spaceId !== undefined ? { spaceId } : {}),
          topK: 6,
          mode: 'hybrid',
          additionalQueries,
          ...(reranker ? { reranker } : {}),
          parentContext,
        },
        bundle.db,
        sqlite,
        bundle.vec,
        embedClient,
        embedModel,
      )
      const assembled = assembleCitations(hits)
      citations = assembled.citations
      if (assembled.chunks.length > 0) {
        ragContext = assembled.chunks
          .map((chunk) => `[^${chunk.n}] (${chunk.path})\n${chunk.text}`)
          .join('\n\n---\n\n')
      }
    } catch {
      // No retrieval context — continue without it.
    }

    const cachedHistory =
      sessionHistories.get(sessionId) ?? loadRecentTurnHistory(sqlite, sessionId)
    sessionHistories.set(sessionId, cachedHistory)

    const history = cachedHistory.map((turn) => ({
      role: turn.role as 'user' | 'assistant' | 'tool_result',
      content: turn.content,
      ...(turn.toolId !== undefined ? { toolId: turn.toolId } : {}),
      ...(turn.toolResultJson !== undefined ? { toolResultJson: turn.toolResultJson } : {}),
    }))

    // Serialise through the foreground AI slot so concurrent assistant.send calls
    // don't run two Ollama streams simultaneously and contend for VRAM.
    let sendQueue = null as ReturnType<typeof getAiQueue> | null
    try {
      sendQueue = getAiQueue()
    } catch {
      /* queue not initialized — proceed without serialisation */
    }

    const runQueued = async (): Promise<{ messageId: string; sessionId: string }> => {
      // Classify intent with the richer ROUTE_CLASSIFY_V1 (8 labels including 'coding').
      // Falls back to 'chat' if classification fails so the turn always proceeds.
      let routeIntent = settings.get('appContext.defaultIntent', z.string()) ?? 'chat'
      let isCodingTurn = false
      try {
        const { router: intentRouter } = getDeps()
        if (intentRouter) {
          const classifierModel = intentRouter.modelFor('classifier')
          const classifyResult = await runPrompt(
            ROUTE_CLASSIFY_V1,
            { message },
            embedClient,
            classifierModel,
          )
          if (classifyResult.ok) {
            routeIntent = classifyResult.data.intent
            isCodingTurn = classifyResult.data.intent === 'coding'
          }
        }
      } catch {
        // Intent classification is best-effort — fall back to stored default
      }

      // Coding turn — stream markdown directly from qwen2.5-coder, skip the JSON envelope.
      if (isCodingTurn) {
        try {
          await runCodingTurn({
            userText: message,
            sessionId,
            history,
            ragContext,
            deps: {
              codingClient,
              codingModel,
              onToken: (token) => {
                if (!abortFlags.get(messageId)) {
                  win?.webContents.send('assistant:token', { messageId, token })
                }
              },
              saveTurn: (turn) => {
                pushCachedTurn(sessionId, { role: turn.role, content: turn.content })
                try {
                  sqlite
                    .prepare(
                      'INSERT INTO conversation_turns(id,session_id,role,content,tool_id,tool_params_json,tool_result_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
                    )
                    .run(
                      randomUUID(),
                      sessionId,
                      turn.role,
                      turn.content,
                      null,
                      null,
                      null,
                      Date.now(),
                    )
                  sqlite
                    .prepare('INSERT OR IGNORE INTO sessions(id, started_at) VALUES(?, ?)')
                    .run(sessionId, Date.now())
                } catch {
                  /* DB may not be migrated yet */
                }
              },
            },
          })
          if (!abortFlags.get(messageId)) {
            win?.webContents.send('assistant:done', {
              messageId,
              citations: [],
              toolsInvoked: [],
            })
          }
        } catch (err) {
          win?.webContents.send('assistant:error', {
            messageId,
            error: err instanceof Error ? err.message : 'Coding turn failed',
          })
        } finally {
          abortFlags.delete(messageId)
        }
        return { messageId, sessionId }
      }

      let appContext:
        | { promptContext: string; capabilitiesIncluded: string[]; hadCloudRestrictions: boolean }
        | undefined
      try {
        const broker = getAppContextBroker()
        if (broker) {
          const snapshot = await broker.buildSnapshot({
            classifiedIntent: routeIntent,
            userInput: message,
          })
          if (snapshot.promptContext) {
            appContext = {
              promptContext: snapshot.promptContext,
              capabilitiesIncluded: snapshot.capabilitiesIncluded,
              hadCloudRestrictions: snapshot.hadCloudRestrictions,
            }
          }
        }
      } catch {
        // App context is best-effort — never block the chat turn
      }

      try {
        const result = await runTurn({
          userText: message,
          sessionId,
          history,
          tools: listToolsForModel(),
          ragContext,
          ...(personaOverride !== undefined ? { personaOverride } : {}),
          ...(appContext !== undefined ? { appContext } : {}),
          deps: {
            chatClient,
            chatModel,
            onToken: (token) => {
              if (!abortFlags.get(messageId)) {
                win?.webContents.send('assistant:token', { messageId, token })
              }
            },
            executeTool: async (toolId, toolParams) => {
              if (abortFlags.get(messageId)) {
                return { outcome: 'cancelled' as const }
              }
              win?.webContents.send('assistant:toolCall', {
                messageId,
                toolId,
                params: toolParams,
              })
              const execResult = await executeTool(
                toolId,
                toolParams,
                { traceId: messageId, actor: 'user' },
                executorDeps,
              )
              win?.webContents.send('assistant:toolResult', {
                messageId,
                toolId,
                outcome: execResult.outcome,
                result: execResult.outcome === 'success' ? execResult.result : undefined,
              })
              return execResult
            },
            saveTurn: (turn) => {
              pushCachedTurn(sessionId, {
                role: turn.role,
                content: turn.content,
                ...(turn.toolId !== undefined ? { toolId: turn.toolId } : {}),
                ...(turn.toolResultJson !== undefined
                  ? { toolResultJson: turn.toolResultJson }
                  : {}),
              })

              try {
                sqlite
                  .prepare(
                    'INSERT INTO conversation_turns(id,session_id,role,content,tool_id,tool_params_json,tool_result_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
                  )
                  .run(
                    randomUUID(),
                    sessionId,
                    turn.role,
                    turn.content,
                    turn.toolId ?? null,
                    turn.toolParamsJson ?? null,
                    turn.toolResultJson ?? null,
                    Date.now(),
                  )
                // Ensure a sessions row exists for cross-table features
                sqlite
                  .prepare('INSERT OR IGNORE INTO sessions(id, started_at) VALUES(?, ?)')
                  .run(sessionId, Date.now())
              } catch {
                // DB may not be migrated yet on first run.
              }
            },
          },
        })

        if (!abortFlags.get(messageId)) {
          win?.webContents.send('assistant:done', {
            messageId,
            citations,
            toolsInvoked: result.toolsInvoked,
          })
          // Update session summary for thread list display
          try {
            const summary = result.finalText.slice(0, 200)
            sqlite.prepare('UPDATE sessions SET summary = ? WHERE id = ?').run(summary, sessionId)
          } catch {
            // Best-effort; sessions row may not exist yet on first turn
          }
        }
      } catch (err) {
        win?.webContents.send('assistant:error', {
          messageId,
          error: err instanceof Error ? err.message : 'Turn failed',
        })
      } finally {
        abortFlags.delete(messageId)
      }

      return { messageId, sessionId }
    }

    // Run through the queue if available — serialises concurrent turns against
    // background news/briefing jobs and against each other (fgConcurrency=1).
    return sendQueue ? sendQueue.enqueueForegroundAiTask(runQueued) : runQueued()
  })

  registerHandler('assistant.abort', async (params) => {
    const { messageId } = AssistantAbortParamsSchema.parse(params)
    const had = abortFlags.has(messageId)
    if (had) abortFlags.set(messageId, true)
    return { aborted: had }
  })

  registerHandler('assistant.getSession', async (params) => {
    const { sessionId } = AssistantGetSessionParamsSchema.parse(params)
    const { sqlite } = getDeps()
    return {
      sessionId,
      messages: loadThreadMessages(sqlite, sessionId),
    }
  })

  registerHandler('assistant.listSessions', async (params) => {
    const { limit, offset } = AssistantListSessionsParamsSchema.parse(params)
    const { sqlite } = getDeps()
    const sessions = listStoredThreads(sqlite, limit, offset).map((thread) => ({
      id: thread.id,
      startedAt: thread.startedAt,
      endedAt: thread.lastMessageAt,
      lastMessageAt: thread.lastMessageAt,
      title: thread.title,
      summary: thread.title,
      messageCount: thread.messageCount,
    }))
    return { sessions }
  })

  registerHandler('assistant.deleteSession', async (params) => {
    const { sessionId } = AssistantDeleteSessionParamsSchema.parse(params)
    const { sqlite } = getDeps()
    try {
      sqlite.prepare('DELETE FROM conversation_turns WHERE session_id = ?').run(sessionId)
      sqlite.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
      sessionHistories.delete(sessionId)
      return { deleted: true }
    } catch {
      return { deleted: false }
    }
  })

  registerHandler('assistant.deleteAllSessions', async () => {
    const { sqlite } = getDeps()
    try {
      const info = sqlite.prepare('DELETE FROM conversation_turns').run()
      sqlite.prepare('DELETE FROM sessions').run()
      sessionHistories.clear()
      return { deleted: info.changes }
    } catch {
      return { deleted: 0 }
    }
  })
}
