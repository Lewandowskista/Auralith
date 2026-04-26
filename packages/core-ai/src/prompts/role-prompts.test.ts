import { describe, expect, it } from 'vitest'
import {
  RAG_ANSWER_V1,
  NEWS_SYNTHESIS_V1,
  TOOL_CALL_V1,
  CODING_ASSISTANT_V1,
  EXTRACT_GENERIC_V1,
  ROUTE_CLASSIFY_V1,
  buildToolCallUserMessage,
  buildExtractInputBlock,
  RagAnswerOutputSchema,
  NewsSynthesisOutputSchema,
  ToolCallOutputSchema,
  CodingStructuredOutputSchema,
  ExtractGenericOutputSchema,
  RouteClassifyOutputSchema,
  type ToolEntry,
} from './role-prompts'

// ── RAG_ANSWER_V1 ──────────────────────────────────────────────────────────────

describe('RAG_ANSWER_V1', () => {
  it('has role "rag"', () => {
    expect(RAG_ANSWER_V1.role).toBe('rag')
  })

  it('uses strict JSON output mode (maxTokens, temperature)', () => {
    expect(RAG_ANSWER_V1.maxTokens).toBeGreaterThan(0)
    expect(RAG_ANSWER_V1.temperature).toBeGreaterThanOrEqual(0)
  })

  it('includes chunk context and query in user template', () => {
    const msg = RAG_ANSWER_V1.userTemplate({ chunksBlock: '[chunks]', query: 'What is X?' })
    expect(msg).toContain('[chunks]')
    expect(msg).toContain('What is X?')
  })

  it('schema accepts valid rag output', () => {
    const result = RagAnswerOutputSchema.safeParse({
      answer: 'The answer is Y.',
      chunk_ids_used: [1, 2],
      insufficient_context: false,
    })
    expect(result.success).toBe(true)
  })

  it('schema rejects missing answer', () => {
    const result = RagAnswerOutputSchema.safeParse({
      chunk_ids_used: [],
      insufficient_context: false,
    })
    expect(result.success).toBe(false)
  })

  it('schema rejects non-integer chunk ids', () => {
    const result = RagAnswerOutputSchema.safeParse({
      answer: 'ok',
      chunk_ids_used: [1.5],
      insufficient_context: false,
    })
    expect(result.success).toBe(false)
  })

  it('handles missing chunksBlock gracefully', () => {
    const msg = RAG_ANSWER_V1.userTemplate({ query: 'Test?' })
    expect(msg).toContain('no context provided')
  })
})

// ── NEWS_SYNTHESIS_V1 ──────────────────────────────────────────────────────────

describe('NEWS_SYNTHESIS_V1', () => {
  it('has role "news_synthesis"', () => {
    expect(NEWS_SYNTHESIS_V1.role).toBe('news_synthesis')
  })

  it('system prompt mentions source attribution', () => {
    expect(NEWS_SYNTHESIS_V1.system).toContain('source_ids_used')
    expect(NEWS_SYNTHESIS_V1.system).toContain('do not invent')
  })

  it('schema accepts valid synthesis output', () => {
    const result = NewsSynthesisOutputSchema.safeParse({
      headline: 'Big news',
      briefing: 'Several things happened today.',
      key_points: ['Point one'],
      source_ids_used: ['r1', 'r2'],
      duplicates: [['r1', 'r3']],
      uncertainties: [],
      importance: 'high',
    })
    expect(result.success).toBe(true)
  })

  it('schema rejects invalid importance value', () => {
    const result = NewsSynthesisOutputSchema.safeParse({
      headline: 'Big news',
      briefing: 'Something happened.',
      key_points: ['p1'],
      source_ids_used: [],
      duplicates: [],
      uncertainties: [],
      importance: 'critical', // invalid
    })
    expect(result.success).toBe(false)
  })

  it('schema requires at least one key_point', () => {
    const result = NewsSynthesisOutputSchema.safeParse({
      headline: 'Big news',
      briefing: 'Something happened.',
      key_points: [],
      source_ids_used: [],
      duplicates: [],
      uncertainties: [],
      importance: 'low',
    })
    expect(result.success).toBe(false)
  })

  it('includes articles block in user template', () => {
    const msg = NEWS_SYNTHESIS_V1.userTemplate({ articlesBlock: '[articles]' })
    expect(msg).toContain('[articles]')
  })
})

// ── TOOL_CALL_V1 ───────────────────────────────────────────────────────────────

describe('TOOL_CALL_V1', () => {
  it('has role "tool_call"', () => {
    expect(TOOL_CALL_V1.role).toBe('tool_call')
  })

  it('system prompt forbids inventing tool names', () => {
    expect(TOOL_CALL_V1.system).toContain('never invent tool names')
  })

  it('system prompt requires requires_confirmation for confirm/restricted tools', () => {
    expect(TOOL_CALL_V1.system).toContain('requires_confirmation must be true')
  })

  it('temperature is 0 (deterministic)', () => {
    expect(TOOL_CALL_V1.temperature).toBe(0)
  })

  it('schema accepts valid tool output', () => {
    const result = ToolCallOutputSchema.safeParse({
      type: 'tool',
      tool: 'weather.getCurrent',
      args: { city: 'Berlin' },
      message: 'Fetching weather.',
      requires_confirmation: false,
    })
    expect(result.success).toBe(true)
  })

  it('schema accepts speak output', () => {
    const result = ToolCallOutputSchema.safeParse({
      type: 'speak',
      tool: null,
      args: {},
      message: 'Could you clarify which city?',
      requires_confirmation: false,
    })
    expect(result.success).toBe(true)
  })

  it('schema rejects unknown type values', () => {
    const result = ToolCallOutputSchema.safeParse({
      type: 'plan',
      tool: null,
      args: {},
      message: 'Planning...',
      requires_confirmation: false,
    })
    expect(result.success).toBe(false)
  })

  it('schema rejects missing requires_confirmation', () => {
    const result = ToolCallOutputSchema.safeParse({
      type: 'tool',
      tool: 'some.tool',
      args: {},
      message: 'Calling tool.',
    })
    expect(result.success).toBe(false)
  })
})

// ── buildToolCallUserMessage ───────────────────────────────────────────────────

describe('buildToolCallUserMessage', () => {
  const tools: ToolEntry[] = [
    { id: 'weather.getCurrent', tier: 'safe', description: 'Get current weather' },
    { id: 'files.delete', tier: 'restricted', description: 'Delete a file' },
  ]

  it('includes tool ids in output', () => {
    const msg = buildToolCallUserMessage('What is the weather?', tools)
    expect(msg).toContain('weather.getCurrent')
    expect(msg).toContain('files.delete')
  })

  it('includes the user request', () => {
    const msg = buildToolCallUserMessage('Show me the forecast', tools)
    expect(msg).toContain('Show me the forecast')
  })

  it('handles empty tool list gracefully', () => {
    const msg = buildToolCallUserMessage('Do something', [])
    expect(msg).toContain('no tools available')
  })

  it('includes tier information in TOON output', () => {
    const msg = buildToolCallUserMessage('Delete file.txt', tools)
    expect(msg).toContain('restricted')
    expect(msg).toContain('safe')
  })
})

// ── CODING_ASSISTANT_V1 ────────────────────────────────────────────────────────

describe('CODING_ASSISTANT_V1', () => {
  it('has role "coding"', () => {
    expect(CODING_ASSISTANT_V1.role).toBe('coding')
  })

  it('system prompt warns about destructive commands', () => {
    expect(CODING_ASSISTANT_V1.system).toContain('risky')
    expect(CODING_ASSISTANT_V1.system).toContain('destructive')
  })

  it('includes language and filePath in user template when provided', () => {
    const msg = CODING_ASSISTANT_V1.userTemplate({
      request: 'Write a sort function',
      language: 'TypeScript',
      filePath: 'src/utils.ts',
    })
    expect(msg).toContain('TypeScript')
    expect(msg).toContain('src/utils.ts')
    expect(msg).toContain('Write a sort function')
  })

  it('omits language/filePath lines when not provided', () => {
    const msg = CODING_ASSISTANT_V1.userTemplate({ request: 'Help me debug' })
    expect(msg).not.toContain('Language/runtime:')
    expect(msg).not.toContain('File:')
    expect(msg).toContain('Help me debug')
  })

  it('schema accepts valid structured coding output', () => {
    const result = CodingStructuredOutputSchema.safeParse({
      code: 'const x = 1',
      language: 'typescript',
      explanation: 'Assigns 1 to x.',
      warnings: [],
    })
    expect(result.success).toBe(true)
  })

  it('schema accepts output with warnings', () => {
    const result = CodingStructuredOutputSchema.safeParse({
      code: 'rm -rf /',
      language: 'bash',
      explanation: 'Deletes everything.',
      warnings: ['This is destructive and irreversible.'],
    })
    expect(result.success).toBe(true)
  })
})

// ── EXTRACT_GENERIC_V1 ─────────────────────────────────────────────────────────

describe('EXTRACT_GENERIC_V1', () => {
  it('has role "extract"', () => {
    expect(EXTRACT_GENERIC_V1.role).toBe('extract')
  })

  it('system prompt requires empty arrays for missing categories', () => {
    expect(EXTRACT_GENERIC_V1.system).toContain('empty arrays')
  })

  it('temperature is 0 (deterministic extraction)', () => {
    expect(EXTRACT_GENERIC_V1.temperature).toBe(0)
  })

  it('schema accepts valid extraction output', () => {
    const result = ExtractGenericOutputSchema.safeParse({
      entities: ['Alice', 'Berlin'],
      dates: ['2026-04-25'],
      actions: ['Send report'],
      links: ['https://example.com'],
      preferences: [],
      uncertain: false,
    })
    expect(result.success).toBe(true)
  })

  it('schema accepts all-empty extraction', () => {
    const result = ExtractGenericOutputSchema.safeParse({
      entities: [],
      dates: [],
      actions: [],
      links: [],
      preferences: [],
      uncertain: true,
    })
    expect(result.success).toBe(true)
  })

  it('schema rejects missing uncertain field', () => {
    const result = ExtractGenericOutputSchema.safeParse({
      entities: [],
      dates: [],
      actions: [],
      links: [],
      preferences: [],
    })
    expect(result.success).toBe(false)
  })
})

// ── buildExtractInputBlock ─────────────────────────────────────────────────────

describe('buildExtractInputBlock', () => {
  it('wraps text in an XML input block', () => {
    const block = buildExtractInputBlock('Hello world')
    expect(block).toContain('<input')
    expect(block).toContain('Hello world')
    expect(block).toContain('</input>')
  })

  it('includes source hint when provided', () => {
    const block = buildExtractInputBlock('Some text', 'clipboard')
    expect(block).toContain('clipboard')
  })

  it('truncates long input at 4000 chars', () => {
    const long = 'x'.repeat(5000)
    const block = buildExtractInputBlock(long)
    expect(block.length).toBeLessThan(long.length + 200)
  })

  it('escapes XML-sensitive characters', () => {
    const block = buildExtractInputBlock('<script>alert("xss")</script>')
    expect(block).not.toContain('<script>')
    expect(block).toContain('&lt;script&gt;')
  })
})

// ── ROUTE_CLASSIFY_V1 ──────────────────────────────────────────────────────────

describe('ROUTE_CLASSIFY_V1', () => {
  it('has role "classifier"', () => {
    expect(ROUTE_CLASSIFY_V1.role).toBe('classifier')
  })

  it('system prompt lists all allowed intents', () => {
    const intents = ['chat', 'tool', 'news', 'rag', 'coding', 'routine', 'settings', 'unknown']
    for (const intent of intents) {
      expect(ROUTE_CLASSIFY_V1.system).toContain(intent)
    }
  })

  it('temperature is 0 (deterministic classification)', () => {
    expect(ROUTE_CLASSIFY_V1.temperature).toBe(0)
  })

  it('maxTokens is small (classifier stays short)', () => {
    expect(ROUTE_CLASSIFY_V1.maxTokens).toBeLessThanOrEqual(200)
  })

  it('includes the message in the user template', () => {
    const msg = ROUTE_CLASSIFY_V1.userTemplate({ message: 'What is the weather?' })
    expect(msg).toContain('What is the weather?')
  })

  it('truncates very long messages in user template', () => {
    const long = 'a'.repeat(2000)
    const msg = ROUTE_CLASSIFY_V1.userTemplate({ message: long })
    // Template slices to 800
    expect(msg.length).toBeLessThan(long.length + 200)
  })

  it('schema accepts valid route classify output', () => {
    const result = RouteClassifyOutputSchema.safeParse({
      intent: 'tool',
      confidence: 0.95,
      requires_clarification: false,
      clarifying_question: null,
      risk: 'low',
      reason: 'User wants to open a file.',
    })
    expect(result.success).toBe(true)
  })

  it('schema rejects invented intent labels', () => {
    const result = RouteClassifyOutputSchema.safeParse({
      intent: 'weather', // not in the enum
      confidence: 0.9,
      requires_clarification: false,
      clarifying_question: null,
      risk: 'low',
      reason: 'Weather request.',
    })
    expect(result.success).toBe(false)
  })

  it('schema rejects confidence out of range', () => {
    const result = RouteClassifyOutputSchema.safeParse({
      intent: 'chat',
      confidence: 1.5, // > 1
      requires_clarification: false,
      clarifying_question: null,
      risk: 'low',
      reason: 'Chat.',
    })
    expect(result.success).toBe(false)
  })

  it('schema rejects invalid risk value', () => {
    const result = RouteClassifyOutputSchema.safeParse({
      intent: 'chat',
      confidence: 0.8,
      requires_clarification: false,
      clarifying_question: null,
      risk: 'critical', // not in enum
      reason: 'Chat.',
    })
    expect(result.success).toBe(false)
  })
})
