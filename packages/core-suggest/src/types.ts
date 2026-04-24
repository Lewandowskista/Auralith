export type PermissionTier = 'safe' | 'confirm' | 'restricted'

export type SuggestionCandidate = {
  kind: string
  title: string
  rationale: string
  proposedAction: {
    toolId: string
    params: Record<string, unknown>
  }
  tier: PermissionTier
  ttlMs: number
}

export type GeneratorContext = {
  now: Date
  downloadsDir?: string
  documentsDir?: string
  desktopDir?: string
}
