import type { OllamaClient } from '@auralith/core-ai'

const VOICE_INTENT_CLASSIFY_PROMPT = `Classify this voice query into exactly one category.

Categories:
- VOICE_QUERY: Short factual questions answerable without personal files (weather, math, definitions, time, conversions)
- KNOWLEDGE_SEARCH: Requests to find, search, or recall personal notes, documents, or files
- ASSISTANT_CHAT: Everything else (tasks, advice, conversation, analysis, commands)

Query: {{query}}

Respond with ONLY the category name — nothing else. No punctuation, no explanation.`

export type VoiceIntent = 'SYSTEM_COMMAND' | 'VOICE_QUERY' | 'KNOWLEDGE_SEARCH' | 'ASSISTANT_CHAT'

export type SystemCommand =
  | 'STOP_SPEAKING'
  | 'MUTE'
  | 'NEXT'
  | 'SKIP'
  | 'REPEAT'
  | 'CANCEL'
  | 'END_CONVERSATION'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'

export type IntentResult =
  | { intent: 'SYSTEM_COMMAND'; command: SystemCommand; confidence: 'certain' }
  | {
      intent: 'VOICE_QUERY' | 'KNOWLEDGE_SEARCH' | 'ASSISTANT_CHAT'
      confidence: 'certain' | 'inferred'
    }

// Normalise: lowercase, strip punctuation, collapse whitespace
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?,;]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Trie-style pattern matching for zero-latency system command detection.
// Each entry maps a normalised phrase to a canonical command.
const SYSTEM_COMMAND_PATTERNS: Array<[string, SystemCommand]> = [
  ['stop', 'STOP_SPEAKING'],
  ['stop talking', 'STOP_SPEAKING'],
  ['be quiet', 'STOP_SPEAKING'],
  ['shut up', 'STOP_SPEAKING'],
  ['mute', 'MUTE'],
  ['mute yourself', 'MUTE'],
  ['next', 'NEXT'],
  ['next one', 'NEXT'],
  ['skip', 'SKIP'],
  ['skip that', 'SKIP'],
  ['skip this', 'SKIP'],
  ['repeat that', 'REPEAT'],
  ['say that again', 'REPEAT'],
  ['repeat', 'REPEAT'],
  ['can you repeat that', 'REPEAT'],
  ['cancel', 'CANCEL'],
  ['never mind', 'CANCEL'],
  ['nevermind', 'CANCEL'],
  ['forget it', 'CANCEL'],
  ['goodbye', 'END_CONVERSATION'],
  ['bye', 'END_CONVERSATION'],
  ['bye bye', 'END_CONVERSATION'],
  ['end conversation', 'END_CONVERSATION'],
  ['stop conversation', 'END_CONVERSATION'],
  ['exit', 'END_CONVERSATION'],
  ['louder', 'VOLUME_UP'],
  ['speak louder', 'VOLUME_UP'],
  ['volume up', 'VOLUME_UP'],
  ['quieter', 'VOLUME_DOWN'],
  ['speak quieter', 'VOLUME_DOWN'],
  ['volume down', 'VOLUME_DOWN'],
  ['turn it down', 'VOLUME_DOWN'],
]

// Pre-build a Map for O(1) lookup
const COMMAND_MAP = new Map<string, SystemCommand>(SYSTEM_COMMAND_PATTERNS)

/**
 * Checks whether the transcript is a system command.
 * Returns null if not matched — no LLM call needed.
 */
export function classifySystemCommand(text: string): IntentResult | null {
  const norm = normalise(text)
  const command = COMMAND_MAP.get(norm)
  if (command) {
    return { intent: 'SYSTEM_COMMAND', command, confidence: 'certain' }
  }
  return null
}

const VALID_INTENTS = new Set<VoiceIntent>(['VOICE_QUERY', 'KNOWLEDGE_SEARCH', 'ASSISTANT_CHAT'])
const INTENT_CLASSIFY_TIMEOUT_MS = 2_000

/**
 * Classifies a transcript into VOICE_QUERY, KNOWLEDGE_SEARCH, or ASSISTANT_CHAT
 * via a lightweight single Ollama call. Resolves to ASSISTANT_CHAT on any error
 * or if the call exceeds 2 seconds — the voice pipeline never stalls.
 */
export async function classifyVoiceIntent(
  text: string,
  chatClient: OllamaClient,
  model: string,
): Promise<IntentResult> {
  const prompt = VOICE_INTENT_CLASSIFY_PROMPT.replace('{{query}}', text)

  const classify = (async (): Promise<IntentResult> => {
    try {
      let response = ''
      for await (const token of chatClient.stream({
        model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 16,
      })) {
        response += token
        // Stop as soon as we have a recognisable category name (no need to wait for full stream)
        const trimmed = response.trim().toUpperCase()
        if (VALID_INTENTS.has(trimmed as VoiceIntent)) {
          return {
            intent: trimmed as 'VOICE_QUERY' | 'KNOWLEDGE_SEARCH' | 'ASSISTANT_CHAT',
            confidence: 'certain',
          }
        }
      }
      const final = response.trim().toUpperCase()
      if (VALID_INTENTS.has(final as VoiceIntent)) {
        return {
          intent: final as 'VOICE_QUERY' | 'KNOWLEDGE_SEARCH' | 'ASSISTANT_CHAT',
          confidence: 'certain',
        }
      }
      return { intent: 'ASSISTANT_CHAT', confidence: 'inferred' }
    } catch {
      return { intent: 'ASSISTANT_CHAT', confidence: 'inferred' }
    }
  })()

  const timeout = new Promise<IntentResult>((resolve) =>
    setTimeout(
      () => resolve({ intent: 'ASSISTANT_CHAT', confidence: 'inferred' }),
      INTENT_CLASSIFY_TIMEOUT_MS,
    ),
  )

  return Promise.race([classify, timeout])
}
