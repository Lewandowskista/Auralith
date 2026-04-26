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
  MODEL_PRESETS,
  type ModelRole,
  type ModelConfig,
  type ModelPresetName,
  type ModelPreset,
} from './router'
export {
  resolveModelConfig,
  type ResolvedModelConfig,
  type ModelConfigOverrides,
} from './model-resolver'
export { ROLE_CTX_CONFIG, type RoleCtxConfig } from './config/model-config'
export {
  runPrompt,
  getJsonReliabilityStats,
  resetJsonReliabilityStats,
  flushReliabilityToRepo,
  type PromptContract,
  type RunResult,
  type JsonReliabilityStat,
  type PromptCacheStore,
  type ReliabilityFlusher,
} from './runtime'
export { createPromptCache, type PromptCacheDb, type PromptCacheRow } from './prompt-cache'
export { OllamaStatusMonitor, type OllamaStatus } from './ollama-status'
export { INTENT_CLASSIFY_V1, type IntentResult } from './prompts/intent-classify'
export { SESSION_LABEL_V1, type SessionLabelResult } from './prompts/session-label'
export { RAG_SYSTEM_PROMPT, buildRagUserPrompt, CITATION_VALIDATE_V1 } from './prompts/rag-answer'
export { buildAssistantCapabilityContext } from './capabilities'
export {
  runTurn,
  runCodingTurn,
  type TurnMessage,
  type ToolManifestEntry,
  type TurnRunnerDeps,
  type TurnRunnerResult,
  type AppContextInjection,
  type CodingTurnDeps,
  type CodingTurnResult,
} from './turn-runner'
export {
  runAgentLoop,
  type AgentStep,
  type AgentPlan,
  type AgentRunState,
  type AgentLoopDeps,
} from './agent-loop'
export { AiQueue, initAiQueue, getAiQueue, type AiQueueOptions, type AiTaskFn } from './ai-queue'
export { checkModelHealth, formatMissingModelHints, type ModelHealthReport } from './model-health'
export {
  formatToon,
  formatXmlBlock,
  formatMarkdownSection,
  formatMarkdownTable,
  normalizeEmbeddingText,
  formatPromptContext,
  setPromptFormatConfig,
  getPromptFormatConfig,
  logFormatDiagnostic,
  type ToonRecord,
  type XmlBlockAttrs,
  type AutoFormatInput,
  type PromptFormatMode,
  type PromptFormatConfig,
  type FormatDiagnostic,
} from './prompt-format'

// ── App capability manifest ────────────────────────────────────────────────────

export {
  APP_CAPABILITY_MANIFEST,
  getCapabilityDef,
  getPromptSafeCapabilities,
  getCloudAllowedCapabilities,
  buildAppIdentityBlock,
  type AppCapabilityId,
  type AppCapabilityDef,
  type PrivacyLevel,
} from './app-capabilities'

// ── App context system ─────────────────────────────────────────────────────────

export {
  // Broker
  createAppContextBroker,
  type AppContextBroker,
  type BrokerConfig,
  type BrokerDeps,
  // Intent router
  resolveContextCapabilities,
  getRequiredCapabilities,
  // Types
  type AppContextRequest,
  type AppContextProvider,
  type AppContextProviderResult,
  type AppContextSnapshot,
  type FreshnessStatus,
  type FreshnessRecord,
  // Providers
  createWeatherContextProvider,
  type WeatherContextDeps,
  createNewsContextProvider,
  type NewsContextDeps,
  createActivityContextProvider,
  type ActivityContextDeps,
  createKnowledgeContextProvider,
  type KnowledgeContextDeps,
  createSuggestionsContextProvider,
  type SuggestionsContextDeps,
  createRoutinesContextProvider,
  type RoutinesContextDeps,
  createSettingsContextProvider,
  type SettingsContextDeps,
} from './app-context/index'

// ── News response grounding validator ─────────────────────────────────────────

export {
  validateNewsResponse,
  extractTitlesFromContext,
  NEWS_FALLBACK_RESPONSE,
  NEWS_RETRY_SYSTEM_INJECTION,
  type NewsValidationContext,
  type NewsValidationResult,
} from './news-validator'

// ── v2: Role-based routing ─────────────────────────────────────────────────────

export {
  AI_ROLE_REGISTRY,
  getRoleDefinition,
  getBackgroundRoles,
  getStrictJsonRoles,
  getHighSafetyRoles,
  type AiRoleDefinition,
  type ContextFormat,
  type OutputMode,
  type QueuePriority,
  type SafetyLevel,
} from './roles'

export {
  // Coding streaming path
  CODING_SYSTEM_PROMPT,
  buildCodingContextBlock,
  // RAG structured answer
  RAG_ANSWER_V1,
  RagAnswerOutputSchema,
  type RagAnswerOutput,
  // News synthesis
  NEWS_SYNTHESIS_V1,
  NewsSynthesisOutputSchema,
  type NewsSynthesisOutput,
  // Tool call dispatcher
  TOOL_CALL_V1,
  ToolCallOutputSchema,
  buildToolCallUserMessage,
  type ToolCallOutput,
  type ToolEntry,
  // Coding assistant (structured JSON variant)
  CODING_ASSISTANT_V1,
  CodingStructuredOutputSchema,
  type CodingStructuredOutput,
  // Generic extractor
  EXTRACT_GENERIC_V1,
  ExtractGenericOutputSchema,
  buildExtractInputBlock,
  type ExtractGenericOutput,
  // Full-routing classifier (superset of INTENT_CLASSIFY_V1)
  ROUTE_CLASSIFY_V1,
  RouteClassifyOutputSchema,
  type RouteClassifyOutput,
} from './prompts/role-prompts'
