import { randomUUID } from 'crypto'
import { extname } from 'path'
import type { ActivityEventKind, ActivityEvent, RawFileEvent } from './schema'

const SECRET_PATTERN = /[?&](token|key|secret|auth|access_token|api_key)=[^&]*/gi

function sanitizePath(p: string): string {
  return p.replace(SECRET_PATTERN, '')
}

type FolderRule = {
  path: string
  spaceId: string
}

type PendingEntry = {
  kind: ActivityEventKind
  timer: ReturnType<typeof setTimeout>
  size?: number
}

type RecentDelete = {
  ts: number
  size?: number
}

export type NormalizerOpts = {
  debounceMs?: number
  renamePairWindowMs?: number
  folderRules?: FolderRule[]
  onEvent: (event: ActivityEvent) => void
}

type EmitRaw = {
  kind: ActivityEventKind
  path: string
  prevPath?: string
  ts: number
  source: 'watcher' | 'assistant' | 'user'
  size?: number
  sourceUrl?: string
}

export class EventNormalizer {
  private debounceMs: number
  private renamePairWindowMs: number
  private folderRules: FolderRule[]
  private onEvent: (event: ActivityEvent) => void

  private pending = new Map<string, PendingEntry>()
  private recentDeletes = new Map<string, RecentDelete>()

  constructor(opts: NormalizerOpts) {
    this.debounceMs = opts.debounceMs ?? 500
    this.renamePairWindowMs = opts.renamePairWindowMs ?? 2000
    this.folderRules = opts.folderRules ?? []
    this.onEvent = opts.onEvent
  }

  updateFolderRules(rules: FolderRule[]): void {
    this.folderRules = rules
  }

  push(raw: RawFileEvent): void {
    const path = sanitizePath(raw.path)

    if (raw.kind === 'file.delete') {
      const pending = this.pending.get(path)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(path)
      }
      const delEntry: RecentDelete = { ts: raw.ts }
      if (raw.size !== undefined) delEntry.size = raw.size
      this.recentDeletes.set(path, delEntry)

      const timer = setTimeout(() => {
        this.recentDeletes.delete(path)
        this.emit({ kind: 'file.delete', path, ts: raw.ts, source: 'watcher' })
      }, this.renamePairWindowMs)

      const pendingEntry: PendingEntry = { kind: 'file.delete', timer }
      if (raw.size !== undefined) pendingEntry.size = raw.size
      this.pending.set(`__del__${path}`, pendingEntry)
      return
    }

    if (raw.kind === 'file.create') {
      const matchingDelete = this.findRenamePair(path, raw.size)
      if (matchingDelete) {
        const delPending = this.pending.get(`__del__${matchingDelete}`)
        if (delPending) {
          clearTimeout(delPending.timer)
          this.pending.delete(`__del__${matchingDelete}`)
        }
        this.recentDeletes.delete(matchingDelete)
        this.emit({
          kind: 'file.rename',
          path,
          prevPath: matchingDelete,
          ts: raw.ts,
          source: 'watcher',
        })
        return
      }
      const emitRaw: EmitRaw = { kind: 'file.create', path, ts: raw.ts, source: 'watcher' }
      if (raw.size !== undefined) emitRaw.size = raw.size
      this.emit(emitRaw)
      return
    }

    if (raw.kind === 'file.edit') {
      const existing = this.pending.get(path)
      if (existing) clearTimeout(existing.timer)
      const timer = setTimeout(() => {
        this.pending.delete(path)
        const emitRaw: EmitRaw = { kind: 'file.edit', path, ts: raw.ts, source: 'watcher' }
        if (raw.size !== undefined) emitRaw.size = raw.size
        this.emit(emitRaw)
      }, this.debounceMs)
      const pendingEntry: PendingEntry = { kind: 'file.edit', timer }
      if (raw.size !== undefined) pendingEntry.size = raw.size
      this.pending.set(path, pendingEntry)
      return
    }

    if (raw.kind === 'file.move') {
      const emitRaw: EmitRaw = { kind: 'file.move', path, ts: raw.ts, source: 'watcher' }
      if (raw.prevPath !== undefined) emitRaw.prevPath = sanitizePath(raw.prevPath)
      this.emit(emitRaw)
      return
    }

    if (raw.kind === 'file.download') {
      const emitRaw: EmitRaw = { kind: 'file.download', path, ts: raw.ts, source: 'watcher' }
      if (raw.size !== undefined) emitRaw.size = raw.size
      if (raw.sourceUrl !== undefined) emitRaw.sourceUrl = raw.sourceUrl
      this.emit(emitRaw)
      return
    }
  }

  flush(): void {
    for (const [key, entry] of this.pending) {
      clearTimeout(entry.timer)
      if (!key.startsWith('__del__')) {
        const emitRaw: EmitRaw = { kind: entry.kind, path: key, ts: Date.now(), source: 'watcher' }
        if (entry.size !== undefined) emitRaw.size = entry.size
        this.emit(emitRaw)
      } else {
        const path = key.slice(7)
        this.emit({ kind: 'file.delete', path, ts: Date.now(), source: 'watcher' })
      }
    }
    this.pending.clear()
    this.recentDeletes.clear()
  }

  private findRenamePair(newPath: string, size?: number): string | undefined {
    const newExt = extname(newPath).toLowerCase()
    const now = Date.now()
    for (const [delPath, del] of this.recentDeletes) {
      if (now - del.ts > this.renamePairWindowMs) {
        this.recentDeletes.delete(delPath)
        continue
      }
      if (extname(delPath).toLowerCase() !== newExt) continue
      if (size !== undefined && del.size !== undefined && size !== del.size) continue
      return delPath
    }
    return undefined
  }

  private resolveSpaceId(path: string): string | undefined {
    let bestLen = -1
    let bestSpaceId: string | undefined
    for (const rule of this.folderRules) {
      const rp = rule.path.endsWith('/') || rule.path.endsWith('\\') ? rule.path : rule.path + '\\'
      if (path.startsWith(rp) || path.startsWith(rule.path + '/')) {
        if (rule.path.length > bestLen) {
          bestLen = rule.path.length
          bestSpaceId = rule.spaceId
        }
      }
    }
    return bestSpaceId
  }

  private emit(raw: EmitRaw): void {
    const spaceId = this.resolveSpaceId(raw.path)
    const payload: Record<string, unknown> = {}
    if (raw.size !== undefined) payload['size'] = raw.size
    if (raw.sourceUrl) payload['sourceUrl'] = raw.sourceUrl

    const event: ActivityEvent = {
      id: randomUUID(),
      ts: new Date(raw.ts),
      kind: raw.kind,
      source: raw.source,
      path: raw.path,
      actor: 'system',
      payloadJson: JSON.stringify(payload),
    }
    if (raw.prevPath !== undefined) event.prevPath = raw.prevPath
    if (spaceId !== undefined) event.spaceId = spaceId

    this.onEvent(event)
  }
}
