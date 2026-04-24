import type { ToolManifestEntry } from './turn-runner'

type Capability = {
  name: string
  summary: string
  toolPrefixes: string[]
}

const CAPABILITIES: Capability[] = [
  {
    name: 'Weather',
    summary:
      'current local conditions, forecasts, weather briefings, and weather screen navigation',
    toolPrefixes: ['weather.'],
  },
  {
    name: 'Knowledge',
    summary: 'local Knowledge spaces, indexed documents, retrieval, citations, and reindexing',
    toolPrefixes: ['brain.'],
  },
  {
    name: 'Activity',
    summary: 'local timeline events, recent work sessions, file changes, and day summaries',
    toolPrefixes: ['activity.'],
  },
  {
    name: 'App Usage',
    summary: 'privacy-bucketed app usage sessions and work-pattern summaries',
    toolPrefixes: ['appUsage.'],
  },
  {
    name: 'News',
    summary:
      'configured RSS topics, feeds, article clusters, unread/saved items, and digest navigation',
    toolPrefixes: ['news.'],
  },
  {
    name: 'Routines',
    summary: 'local automations, triggers, run history, dry runs, and manual routine execution',
    toolPrefixes: ['routines.'],
  },
  {
    name: 'Suggestions',
    summary: 'proactive assistant suggestions, rationales, and suggested actions',
    toolPrefixes: ['suggestions.', 'suggest.'],
  },
  {
    name: 'Clipboard',
    summary: 'opt-in clipboard history and current clipboard access',
    toolPrefixes: ['clipboard.', 'system.getClipboard', 'system.setClipboard'],
  },
  {
    name: 'Files',
    summary:
      'sandboxed file reading, listing, search, creation, copy, delete, reveal, and open actions',
    toolPrefixes: ['files.', 'system.openPath'],
  },
  {
    name: 'Screen',
    summary: 'screen capture and OCR for what is visible on the desktop',
    toolPrefixes: ['screen.'],
  },
  {
    name: 'Browser',
    summary: 'managed browser open, click, type, extract, screenshot, and close actions',
    toolPrefixes: ['browser.', 'web.'],
  },
  {
    name: 'Voice',
    summary:
      'speech capture, transcription, text-to-speech, voices, models, and push-to-talk settings',
    toolPrefixes: ['voice.', 'assistant.speak'],
  },
  {
    name: 'Settings',
    summary:
      'safe summaries of user-facing app configuration, privacy controls, and feature status',
    toolPrefixes: ['settings.', 'permissions.', 'audit.'],
  },
  {
    name: 'Ollama',
    summary: 'local model status, model routing, model list, and configuration',
    toolPrefixes: ['ollama.'],
  },
  {
    name: 'System',
    summary:
      'Auralith version, data directory, updates, companion windows, shell actions, and crash stats',
    toolPrefixes: ['system.', 'window.', 'shell.'],
  },
]

export function buildAssistantCapabilityContext(tools: ToolManifestEntry[]): string {
  const toolIds = new Set(tools.map((tool) => tool.id))
  const sections = CAPABILITIES.map((capability) => {
    const availableTools = tools
      .filter((tool) =>
        capability.toolPrefixes.some((prefix) => tool.id === prefix || tool.id.startsWith(prefix)),
      )
      .map((tool) => tool.id)
      .sort()
    const toolText =
      availableTools.length > 0 ? availableTools.join(', ') : 'no direct tool currently registered'
    return `- ${capability.name}: ${capability.summary}. Available tools: ${toolText}.`
  })

  const registeredTools = Array.from(toolIds).sort().join(', ')

  return `Auralith app capabilities:
${sections.join('\n')}

Assistant behavior:
- Prefer safe read tools for questions about current/local app data, including weather, news, activity, routines, suggestions, clipboard history, settings, app usage, Knowledge spaces, files, screen, browser, voice, Ollama, and system status.
- Do not give generic inability/refusal answers when an Auralith capability or registered tool can answer. Call the relevant safe read tool first, then summarize the result.
- If a feature is unavailable, disabled, or not configured, say exactly what is missing and offer the closest app action or screen.
- For questions about what Auralith can do, answer from the capability list even when no live data lookup is needed.
- Never expose secrets, credentials, raw tokens, or sensitive raw settings values.

Registered tool IDs: ${registeredTools || '(none)'}`
}
