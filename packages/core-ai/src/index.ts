export {
  OllamaClient,
  type OllamaConfig,
  type ChatMessage,
  type GenerateOpts,
  type EmbedOpts,
} from './client'
export {
  ModelRouter,
  initModelRouter,
  getModelRouter,
  type ModelRole,
  type ModelConfig,
} from './router'
export { runPrompt, type PromptContract, type RunResult } from './runtime'
export { OllamaStatusMonitor, type OllamaStatus } from './ollama-status'
export { INTENT_CLASSIFY_V1, type IntentResult } from './prompts/intent-classify'
export { SESSION_LABEL_V1, type SessionLabelResult } from './prompts/session-label'
export { RAG_SYSTEM_PROMPT, buildRagUserPrompt, CITATION_VALIDATE_V1 } from './prompts/rag-answer'
export { buildAssistantCapabilityContext } from './capabilities'
export {
  runTurn,
  type TurnMessage,
  type ToolManifestEntry,
  type TurnRunnerDeps,
  type TurnRunnerResult,
} from './turn-runner'
export {
  runAgentLoop,
  type AgentStep,
  type AgentPlan,
  type AgentRunState,
  type AgentLoopDeps,
} from './agent-loop'
