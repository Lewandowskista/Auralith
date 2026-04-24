import { z } from 'zod'
import type { OllamaClient, ChatMessage } from './client'
import { buildAssistantCapabilityContext } from './capabilities'

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
): string {
  const toolsJson = JSON.stringify(
    tools.map((t) => ({
      id: t.id,
      tier: t.tier,
      description: t.description,
      params: t.paramsSchema,
    })),
    null,
    2,
  )

  const contextSection = ragContext
    ? `\n\nKnowledge context (use when relevant):\n${ragContext}\n`
    : ''

  const personaSection = personaOverride?.trim()
    ? `\n\nAdditional persona instructions from the user:\n${personaOverride.trim()}\n`
    : ''

  const capabilitiesSection = capabilityContext.trim() ? `\n\n${capabilityContext.trim()}\n` : ''

  return `You are Auralith, a premium local AI assistant. You are helpful, concise, and precise.${contextSection}${capabilitiesSection}${personaSection}

You can either speak a response or call a tool. Respond with ONLY valid JSON in one of these shapes:

To speak (answer, chat, explain):
{"type":"speak","text":"your response here"}

To call a tool:
{"type":"tool","id":"<tool_id>","params":{...}}

Available tools:
${toolsJson}

Rules:
- Prefer speaking over tool use when no action is needed.
- For questions about current/local Auralith app data, use a safe read tool before answering when one is available.
- For "confirm" and "restricted" tier tools the user will be shown a confirmation dialog.
- Never invent tool IDs not listed above.
- Do not claim you lack access to Auralith features when the capability context or tools show that you do have access.
- Keep spoken responses concise and natural for text-to-speech.
- Do not include markdown in spoken responses.
- Reply with ONLY the JSON object — no prose, no code fences.`
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
  deps: TurnRunnerDeps
}): Promise<TurnRunnerResult> {
  const { userText, sessionId, history, tools, ragContext, personaOverride, deps } = opts
  const deadline = Date.now() + WALL_CLOCK_MS

  const systemPrompt = buildSystemPrompt(
    tools,
    ragContext,
    opts.capabilityContext ?? buildAssistantCapabilityContext(tools),
    personaOverride,
  )

  // Build message history for Ollama
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map(
      (m): ChatMessage => ({
        role: m.role === 'tool_result' ? 'user' : m.role,
        content:
          m.role === 'tool_result'
            ? `Tool result for ${m.toolId ?? 'unknown'}: ${m.toolResultJson ?? '{}'}`
            : m.content,
      }),
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

    // Call the LLM — use non-streaming for the structured output decision
    let raw = ''
    try {
      raw = await deps.chatClient.generate({
        model: deps.chatModel,
        messages,
        format: 'json',
        maxTokens: 512,
        temperature: 0.3,
      })
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Ollama unavailable'
      deps.saveTurn?.({ sessionId, role: 'assistant', content: errText })
      return { finalText: errText, toolsInvoked, sessionId }
    }

    // Parse the structured output
    let parsed: TurnOutput | null = null

    try {
      parsed = parseTurnOutput(raw, tools)
      if (!parsed) {
        // One retry with explicit schema reminder
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
        })
        parsed = parseTurnOutput(retryRaw, tools)
      }
    } catch {
      // JSON parse failed even after retry — fall back to plain speech
    }

    if (!parsed) {
      // Fallback: treat raw as plain text response
      finalText = raw.replace(/^["']|["']$/g, '').trim()
      deps.onToken(finalText)
      deps.saveTurn?.({ sessionId, role: 'assistant', content: finalText })
      break
    }

    if (parsed.type === 'speak') {
      finalText = parsed.text
      // Stream the response token by token for streaming UX
      for (const char of parsed.text) {
        deps.onToken(char)
      }
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
