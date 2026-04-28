export const VOICE_INTENT_CLASSIFY_PROMPT = `Classify this voice query into exactly one category.

Categories:
- VOICE_QUERY: Short factual questions answerable without personal files (weather, math, definitions, time, conversions)
- KNOWLEDGE_SEARCH: Requests to find, search, or recall personal notes, documents, or files
- ASSISTANT_CHAT: Everything else (tasks, advice, conversation, analysis, commands)

Query: {{query}}

Respond with ONLY the category name — nothing else. No punctuation, no explanation.`
