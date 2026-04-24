import { Notification } from 'electron'
import { z } from 'zod'
import { createSuggestionsRepo, type DbBundle, type SettingsRepo } from '@auralith/core-db'

type SuggestionBridgeDeps = {
  bundle: DbBundle
  settingsRepo: SettingsRepo
  onOpenSuggestions: () => void
}

export class SuggestionBridge {
  private readonly bundle: DbBundle
  private readonly settingsRepo: SettingsRepo
  private readonly onOpenSuggestions: () => void
  private readonly seenSuggestionIds = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(deps: SuggestionBridgeDeps) {
    this.bundle = deps.bundle
    this.settingsRepo = deps.settingsRepo
    this.onOpenSuggestions = deps.onOpenSuggestions
  }

  start(intervalMs = 15_000): void {
    this.seedSeenSuggestions()
    void this.tick()
    this.timer = setInterval(() => void this.tick(), intervalMs)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private seedSeenSuggestions(): void {
    const repo = createSuggestionsRepo(this.bundle.db)
    for (const suggestion of repo.listOpen(50)) {
      this.seenSuggestionIds.add(suggestion.id)
    }
  }

  private async tick(): Promise<void> {
    if (!Notification.isSupported()) return

    const enabled = this.settingsRepo.get('suggestions.notificationsEnabled', z.boolean()) ?? false
    if (!enabled) return

    const repo = createSuggestionsRepo(this.bundle.db)
    const openSuggestions = repo.listOpen(20).filter((suggestion) => suggestion.tier === 'confirm')

    for (const suggestion of openSuggestions) {
      if (this.seenSuggestionIds.has(suggestion.id)) continue
      this.seenSuggestionIds.add(suggestion.id)

      const notification = new Notification({
        title: suggestion.title,
        body: suggestion.rationale,
        silent: false,
      })

      notification.on('click', () => {
        this.onOpenSuggestions()
      })

      notification.show()
    }
  }
}
