import chokidar from 'chokidar'
import { stat } from 'fs/promises'
import type { EventsRepo } from '@auralith/core-db'
import { EventNormalizer } from '@auralith/core-events'
import type { ActivityEvent } from '@auralith/core-events'

type FolderRule = { path: string; spaceId: string }

export type FileWatcherOpts = {
  eventsRepo: EventsRepo
  folderRules?: FolderRule[]
}

export class FileWatcher {
  private watcher: ReturnType<typeof chokidar.watch> | null = null
  private normalizer: EventNormalizer
  private eventsRepo: EventsRepo
  private watchedPaths = new Set<string>()

  constructor(opts: FileWatcherOpts) {
    this.eventsRepo = opts.eventsRepo
    this.normalizer = new EventNormalizer({
      debounceMs: 500,
      renamePairWindowMs: 2000,
      folderRules: opts.folderRules ?? [],
      onEvent: (ev: ActivityEvent) => {
        try {
          this.eventsRepo.writeEvent(ev)
        } catch (err) {
          console.error('[watcher] writeEvent failed:', err)
        }
      },
    })
  }

  start(paths: string[]): void {
    if (this.watcher) return
    if (paths.length === 0) return

    for (const p of paths) this.watchedPaths.add(p)

    this.watcher = chokidar.watch(paths, {
      ignoreInitial: true,
      persistent: true,
      usePolling: false,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      ignored: [
        /(^|[/\\])\../,
        /node_modules/,
        /\.git/,
        /\.auralith/,
        /thumbs\.db$/i,
        /desktop\.ini$/i,
        // Windows shell junction points inside Documents — not real folders, EPERM on watch
        /[/\\]My (Music|Pictures|Videos)([/\\]|$)/i,
      ],
    })

    this.watcher
      .on('add', (filePath) => {
        void this.onAdd(filePath)
      })
      .on('change', (filePath) => {
        void this.onChange(filePath)
      })
      .on('unlink', (filePath) => {
        this.normalizer.push({ kind: 'file.delete', path: filePath, ts: Date.now() })
      })
      .on('error', (err: unknown) => {
        const e = err as NodeJS.ErrnoException
        if (e.code === 'EPERM') {
          console.warn(`[watcher] skipped inaccessible path: ${e.path ?? e.message}`)
        } else {
          console.error('[watcher] error:', err)
        }
      })
  }

  addPaths(paths: string[], rules: FolderRule[]): void {
    this.normalizer.updateFolderRules(rules)
    for (const p of paths) {
      if (!this.watchedPaths.has(p)) {
        this.watchedPaths.add(p)
        this.watcher?.add(p)
      }
    }
    if (!this.watcher && paths.length > 0) {
      this.start(paths)
    }
  }

  updateFolderRules(rules: FolderRule[]): void {
    this.normalizer.updateFolderRules(rules)
  }

  stop(): void {
    this.normalizer.flush()
    void this.watcher?.close()
    this.watcher = null
    this.watchedPaths.clear()
  }

  private async onAdd(filePath: string): Promise<void> {
    try {
      const s = await stat(filePath)
      this.normalizer.push({ kind: 'file.create', path: filePath, ts: Date.now(), size: s.size })
    } catch {
      this.normalizer.push({ kind: 'file.create', path: filePath, ts: Date.now() })
    }
  }

  private async onChange(filePath: string): Promise<void> {
    try {
      const s = await stat(filePath)
      this.normalizer.push({ kind: 'file.edit', path: filePath, ts: Date.now(), size: s.size })
    } catch {
      this.normalizer.push({ kind: 'file.edit', path: filePath, ts: Date.now() })
    }
  }
}
