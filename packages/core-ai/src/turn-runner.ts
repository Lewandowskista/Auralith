import { z } from 'zod'
import type { OllamaClient, ChatMessage } from './client'
import { buildAssistantCapabilityContext } from './capabilities'
import { buildAppIdentityBlock } from './app-capabilities'
import { formatToon } from './prompt-format'
import { resolveModelConfig } from './model-resolver'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TurnMessage = {
  role: 'user' | 'assistant' | 'tool_result'
  content: string
  toolId?: string
  toolResultJson?: string
}

export type ToolManifestEntry = {
  id: string
  tier: 'safe' | 'confirm' | 'restricted'
  description: string
  paramsSchema: object
}

export type TurnRunnerDeps = {
  chatClient: OllamaClient
  chatModel: string
  /** AI role used to resolve the correct num_ctx. Defaults to 'chat'. */
  chatRole?: string
  /** Broadcast a token to the renderer (streaming UX) */
  onToken: (token: string) => void
  /** Execute a tool. Returns tool result JSON string or throws. */
  executeTool: (
    toolId: string,
    params: unknown,
  ) => Promise<{ outcome: 'success' | 'failure' | 'cancelled'; result?: unknown; error?: string }>
  /** Persist a conversation turn */
  saveTurn?: (turn: {
    sessionId: string
    role: string
    content: string
    toolId?: string
    toolParamsJson?: string
    toolResultJson?: string
  }) => void
}

/** Pre-built app context string from the AppContextBroker — injected into the system prompt */
export type AppContextInjection = {
  promptContext: string
  capabilitiesIncluded: string[]
  hadCloudRestrictions: boolean
}

// ── Structured output schema ──────────────────────────────────────────────────

const SpeakOutputSchema = z.object({
  type: z.literal('speak'),
  text: z.string(),
})

const ToolOutputSchema = z.object({
  type: z.literal('tool'),
  id: z.string(),
  params: z.record(z.string(), z.unknown()),
})

const TurnOutputSchema = z.discriminatedUnion('type', [SpeakOutputSchema, ToolOutputSchema])
type TurnOutput = z.infer<typeof TurnOutputSchema>

const DirectToolOutputSchema = z.object({
  type: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
})

function parseTurnOutput(raw: string, tools: ToolManifestEntry[]): TurnOutput | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const obj = JSON.parse(cleaned) as unknown

  const structured = TurnOutputSchema.safeParse(obj)
  if (structured.success) return structured.data

  const directTool = DirectToolOutputSchema.safeParse(obj)
  if (!directTool.success) return null

  const toolId = directTool.data.type
  if (!tools.some((tool) => tool.id === toolId)) return null

  return {
    type: 'tool',
    id: toolId,
    params: directTool.data.params,
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  tools: ToolManifestEntry[],
  ragContext: string,
  capabilityContext: string,
  personaOverride?: string,
  appContext?: AppContextInjection,
  includeNewsRules?: boolean,
): string {
  // TOON-like compact record table for tool catalog.
  // Saves ~40% tokens vs pretty-printed JSON for typical tool lists on small models.
  // Output is still strict JSON — TOON is only used for this input context.
  const toolsSection = tools.length > 0
    ? formatToon(
        tools.map((t) => ({
          id: t.id,
          tier: t.tier,
          description: t.description,
          params: JSON.stringify(t.paramsSchema),
        })),
        ['id', 'tier', 'description', 'params'],
        'tools',
      )
    : '(no tools available)'

  const contextSection = ragContext
    ? `\n\nKnowledge context (use when relevant):\n${ragContext}\n`
    : ''

  const personaSection = personaOverride?.trim()
    ? `\n\nAdditional persona instructions from the user:\n${personaOverride.trim()}\n`
    : ''

  const capabilitiesSection = capabilityContext.trim() ? `\n\n${capabilityContext.trim()}\n` : ''

  // Inject pre-built app context from the broker (weather, news, activity, etc.)
  const appContextSection =
    appContext?.promptContext?.trim()
      ? `\n\n${appContext.promptContext.trim()}\n`
      : ''

  const appIdentity = buildAppIdentityBlock()

  return `${appIdentity}${contextSection}${appContextSection}${capabilitiesSection}${personaSection}

You can either speak a response or call a tool. Respond with ONLY valid JSON in one of these shapes:

To speak (answer, chat, explain):
{"type":"speak","text":"your response here"}

To call a tool:
{"type":"tool","id":"<tool_id>","params":{...}}

Available tools:
${toolsSection}

Rules:
- Prefer speaking over tool use when no action is needed.
- When the ## Auralith App Context section is present, use it as the source of truth for weather, news, activity, knowledge, routines, and suggestions. Do not invent data not present there.
- If app context for a module is absent, say so honestly rather than guessing.
- For questions about current/local Auralith app data not in the context above, use a safe read tool before answering when one is available.
- For "confirm" and "restricted" tier tools the user will be shown a confirmation dialog.
- Never invent tool IDs not listed above.
- High-risk (restricted) tools require explicit user confirmation before execution.
- Do not claim you lack access to Auralith features when the capability context or tools show that you do have access.
- Use markdown formatting (bullets, bold, code blocks, tables) when it aids clarity in your response text.
- If the user's request is ambiguous, ask one focused clarifying question before proceeding.
- When the user refers to "it", "that", or "the previous", look back in the conversation history to resolve the reference.

${includeNewsRules ? `News briefing rules — MANDATORY (apply whenever answering any news question):
CONTEXT CONTRACT: When news_items or news_articles are present in ## Auralith App Context, you MUST use them.
You MUST cite at least one exact title from news_items/news_articles in every news response.
You are NOT allowed to summarize news without citing at least one exact article title from the context.
BANNED phrases — NEVER use these: "an article", "some news", "one article discusses", "might be about", "appears to", "there are some articles", "several stories".
REQUIRED for every article reference: exact title as it appears in the data, source name, relative time (e.g. "Reuters, 2h ago").
If news_items is absent from context, respond ONLY with: "I don't have detailed article data loaded right now." — do NOT summarize from cluster labels alone.
Output format for multi-story responses:
Headline: <short synthesis>

Top stories:
- <Cluster/topic headline> (Source, Time)
  - <1-2 sentence summary using exact article title>
  - Why it matters: <impact>
Prioritise by importance field (high first), then recency (latest published first).
Do not invent, infer, or paraphrase article titles — copy them exactly from the context data.

` : ''}- Reply with ONLY the JSON object — no prose, no code fences.`
}

// ── Turn runner ───────────────────────────────────────────────────────────────

export type TurnRunnerResult = {
  finalText: string
  toolsInvoked: Array<{ toolId: string; outcome: string }>
  sessionId: string
}

const MAX_TOOL_CALLS_PER_TURN = 4
const WALL_CLOCK_MS = 30_000

export async function runTurn(opts: {
  userText: string
  sessionId: string
  history: TurnMessage[]
  tools: ToolManifestEntry[]
  ragContext: string
  capabilityContext?: string
  personaOverride?: string
  /** Pre-built app context from the AppContextBroker — injects weather, news, activity, etc. */
  appContext?: AppContextInjection
  deps: TurnRunnerDeps
}): Promise<TurnRunnerResult> {
  const { userText, sessionId, history, tools, ragContext, personaOverride, appContext, deps } = opts
  const deadline = Date.now() + WALL_CLOCK_MS
  const { num_ctx } = resolveModelConfig(deps.chatRole ?? 'chat', { model: deps.chatModel })

  const includeNewsRules =
    appContext?.capabilitiesIncluded?.includes('news') ||
    ragContext.includes('news') ||
    userText.toLowerCase().includes('news')

  const systemPrompt = buildSystemPrompt(
    tools,
    ragContext,
    opts.capabilityContext ?? buildAssistantCapabilityContext(tools),
    personaOverride,
    appContext,
    includeNewsRules,
  )

  // Build message history for Ollama — keep last 12 turns; compress older turns to save tokens
  const recentHistory = history.slice(-12)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...recentHistory.map(
      (m, idx): ChatMessage => {
        const role = m.role === 'tool_result' ? 'user' : m.role
        let content =
          m.role === 'tool_result'
            ? `Tool result for ${m.toolId ?? 'unknown'}: ${m.toolResultJson ?? '{}'}`
            : m.content
        // Truncate older turns (beyond the 4 most recent) to save context tokens
        if (idx < recentHistory.length - 4 && content.length > 300) {
          content = content.slice(0, 300) + '…'
        }
        return { role, content }
      },
    ),
    { role: 'user', content: userText },
  ]

  deps.saveTurn?.({ sessionId, role: 'user', content: userText })

  let finalText = ''
  const toolsInvoked: Array<{ toolId: string; outcome: string }> = []
  let toolCallCount = 0

  // Tool-calling loop — max MAX_TOOL_CALLS_PER_TURN iterations
  while (toolCallCount < MAX_TOOL_CALLS_PER_TURN) {
    if (Date.now() > deadline) break

    // Stream the LLM response. We buffer the full JSON envelope but extract and
    // forward the inner speak text as it arrives so the UI sees real first-token
    // latency instead of waiting for the entire generation to complete.
    let raw = ''
    let streamError: Error | null = null
    let speakTextEmitted = false
    let speakTextDone = false
    // Tracks how many characters of the extracted speak text have been forwarded.
    let speakEmitCursor = 0

    // Prefix we expect for a speak response — used to detect the inner text boundary.
    const SPEAK_PREFIX = '"text":"'

    try {
      for await (const token of deps.chatClient.stream({
        model: deps.chatModel,
        messages,
        format: 'json',
        maxTokens: 1024,
        temperature: 0.3,
        num_ctx,
      })) {
        raw += token

        // Progressively extract and emit the inner speak text as it streams in.
        // We look for the "text":"..." value after the speak-type prefix lands in
        // the buffer, then forward newly-arrived characters of that value only,
        // skipping the JSON scaffold entirely. speakTextDone is set once the
        // closing quote of the JSON string value has been reached.
        if (!speakTextDone) {
          const prefixIdx = raw.indexOf(SPEAK_PREFIX)
          if (prefixIdx !== -1) {
            // Speak response detected — emit newly arrived inner text characters.
            const textStart = prefixIdx + SPEAK_PREFIX.length
            // Walk from our cursor to the current end, stopping at the closing
            // quote that terminates the JSON string value.
            let i = textStart + speakEmitCursor
            while (i < raw.length) {
              const ch = raw[i]
              // Stop at the unescaped closing quote of the JSON string value.
              if (ch === '"' && raw[i - 1] !== '\\') {
                speakTextDone = true
                break
              }
              // Unescape basic JSON sequences before forwarding.
              if (ch === '\\' && i + 1 < raw.length) {
                const next = raw[i + 1]
                const unescaped =
                  next === 'n' ? '\n' :
                  next === 't' ? '\t' :
                  next === 'r' ? '\r' :
                  next === '"' ? '"' :
                  next === '\\' ? '\\' : ch + next
                deps.onToken(unescaped)
                speakEmitCursor += 2
                i += 2
              } else {
                deps.onToken(ch ?? '')
                speakEmitCursor++
                i++
              }
            }
            speakTextEmitted = true
          }
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err : new Error('Ollama unavailable')
    }

    if (streamError) {
      // If nothing was streamed yet, return an error. If partial text was already
      // forwarded, treat what we have as the final response.
      if (!speakTextEmitted) {
        const errText = streamError.message
        deps.saveTurn?.({ sessionId, role: 'assistant', content: errText })
        return { finalText: errText, toolsInvoked, sessionId }
      }
      // Otherwise fall through — parseTurnOutput will work on whatever buffered.
    }

    // Parse the complete buffered JSON to determine speak vs tool.
    let parsed: TurnOutput | null = null

    try {
      parsed = parseTurnOutput(raw, tools)
      if (!parsed) {
        // One retry with explicit schema reminder — non-streaming since it's a
        // correction pass and latency is already paid.
        const retryMessages: ChatMessage[] = [
          ...messages,
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content:
              'Your reply was not valid JSON. Reply with ONLY one of:\n{"type":"speak","text":"..."}\n{"type":"tool","id":"...","params":{...}}',
          },
        ]
        const retryRaw = await deps.chatClient.generate({
          model: deps.chatModel,
          messages: retryMessages,
          format: 'json',
          maxTokens: 512,
          temperature: 0,
          num_ctx,
        })
        parsed = parseTurnOutput(retryRaw, tools)
        // If retry produced a speak response and nothing was emitted yet, forward it.
        if (parsed?.type === 'speak' && !speakTextEmitted) {
          deps.onToken(parsed.text)
          speakTextEmitted = true
        }
      }
    } catch {
      // JSON parse failed even after retry — fall back to plain speech
    }

    if (!parsed) {
      // Fallback: treat raw as plain text response.
      finalText = raw.replace(/^["']|["']$/g, '').trim()
      if (!speakTextEmitted) deps.onToken(finalText)
      deps.saveTurn?.({ sessionId, role: 'assistant', content: finalText })
      break
    }

    if (parsed.type === 'speak') {
      finalText = parsed.text
      // Text was already emitted token-by-token during streaming; nothing more to send.
      deps.saveTurn?.({ sessionId, role: 'assistant', content: parsed.text })
      break
    }

    // Tool call
    if (parsed.type === 'tool') {
      toolCallCount++
      const { id: toolId, params } = parsed

      messages.push({ role: 'assistant', content: JSON.stringify(parsed) })

      // Execute
      let toolResultContent: string
      try {
        const execResult = await deps.executeTool(toolId, params)
        const resultStr = JSON.stringify(execResult.result ?? { outcome: execResult.outcome })
        toolResultContent =
          execResult.outcome === 'success'
            ? `Tool ${toolId} succeeded: ${resultStr}`
            : execResult.outcome === 'cancelled'
              ? `Tool ${toolId} was cancelled by the user.`
              : `Tool ${toolId} failed: ${execResult.error ?? 'unknown error'}`
        toolsInvoked.push({ toolId, outcome: execResult.outcome })
      } catch (err) {
        toolResultContent = `Tool ${toolId} threw: ${err instanceof Error ? err.message : 'error'}`
        toolsInvoked.push({ toolId, outcome: 'failure' })
      }

      deps.saveTurn?.({
        sessionId,
        role: 'tool_result',
        content: toolResultContent,
        toolId,
        toolResultJson: toolResultContent,
      })

      // Add tool result back into messages for next loop
      messages.push({ role: 'user', content: toolResultContent })
    }
  }

  // If loop exhausted without a speak response, generate a summary
  if (!finalText && toolsInvoked.length > 0) {
    const summary = `Done. Executed: ${toolsInvoked.map((t) => t.toolId).join(', ')}.`
    finalText = summary
    deps.onToken(summary)
    deps.saveTurn?.({ sessionId, role: 'assistant', content: summary })
  }

  return { finalText, toolsInvoked, sessionId }
}
