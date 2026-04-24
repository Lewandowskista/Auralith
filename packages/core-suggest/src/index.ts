export { SuggestionEngine, type SuggestionEngineSignals } from './engine'
export {
  rankCandidates,
  selectTopCandidates,
  computeNextWeight,
  shouldPauseKind,
  MAX_ACTIVE_SUGGESTIONS,
} from './ranker'
export type { SuggestionCandidate, GeneratorContext, PermissionTier } from './types'
export type { SignalProviders, FocusAppBucket } from './signals'
