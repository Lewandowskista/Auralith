import { registerHandler } from '../router'
import type { DbBundle } from '@auralith/core-db'
import { createEventsRepo, createSettingsRepo, folderRules } from '@auralith/core-db'
import {
  ActivityQueryParamsSchema,
  ActivityGetSessionParamsSchema,
  ActivityListSessionsParamsSchema,
  ActivitySetRetentionParamsSchema,
} from '@auralith/core-domain'
import type { FileWatcher } from '../../watcher/file-watcher'
import { z } from 'zod'

type ActivityDeps = {
  bundle: DbBundle
  watcher: FileWatcher
}

let _deps: ActivityDeps | null = null

export function initActivityDeps(deps: ActivityDeps): void {
  _deps = deps
}

function getDeps(): ActivityDeps {
  if (!_deps) throw new Error('Activity deps not initialized')
  return _deps
}

export function registerActivityHandlers(): void {
  registerHandler('activity.query', async (params) => {
    const opts = ActivityQueryParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createEventsRepo(bundle.db)

    const queryOpts: Parameters<typeof repo.queryEvents>[0] = {
      limit: opts.limit,
      offset: opts.offset,
    }
    if (opts.after !== undefined) queryOpts.after = new Date(opts.after)
    if (opts.before !== undefined) queryOpts.before = new Date(opts.before)
    if (opts.kind !== undefined) queryOpts.kind = opts.kind
    if (opts.spaceId !== undefined) queryOpts.spaceId = opts.spaceId
    if (opts.sessionId !== undefined) queryOpts.sessionId = opts.sessionId

    const evts = repo.queryEvents(queryOpts)
    const total = repo.countEvents(queryOpts)

    return { events: evts, total }
  })

  registerHandler('activity.getSession', async (params) => {
    const { sessionId } = ActivityGetSessionParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createEventsRepo(bundle.db)
    const session = repo.getSession(sessionId)
    if (!session) throw Object.assign(new Error('Session not found'), { code: 'NOT_FOUND' })
    return { session }
  })

  registerHandler('activity.listSessions', async (params) => {
    const opts = ActivityListSessionsParamsSchema.parse(params)
    const { bundle } = getDeps()
    const repo = createEventsRepo(bundle.db)

    const queryOpts: Parameters<typeof repo.listSessions>[0] = {
      limit: opts.limit,
      offset: opts.offset,
    }
    if (opts.after !== undefined) queryOpts.after = new Date(opts.after)
    if (opts.before !== undefined) queryOpts.before = new Date(opts.before)

    const sessions = repo.listSessions(queryOpts)
    const total = repo.countSessions(queryOpts)
    return { sessions, total }
  })

  registerHandler('activity.setRetention', async (params) => {
    const { days } = ActivitySetRetentionParamsSchema.parse(params)
    const { bundle } = getDeps()
    const settings = createSettingsRepo(bundle.db)
    settings.set('activity.retentionDays', days)
    return { updated: true }
  })

  // Internal: called after onboarding completes or settings change to refresh watched paths
  registerHandler('activity.refreshWatcher', async () => {
    const { bundle, watcher } = getDeps()
    const settings = createSettingsRepo(bundle.db)
    const folders = settings.get('activity.watchedFolders', z.array(z.string())) ?? []

    const rules = bundle.db.select().from(folderRules).all()
    const watchRules = rules.map((r) => ({ path: r.path, spaceId: r.spaceId }))

    watcher.addPaths(folders, watchRules)
    return { watching: folders }
  })

  registerHandler('activity.setWatchedFolders', async (params) => {
    const { folders } = z.object({ folders: z.array(z.string()) }).parse(params)
    const { bundle, watcher } = getDeps()
    const settings = createSettingsRepo(bundle.db)
    settings.set('activity.watchedFolders', folders)

    const rules = bundle.db.select().from(folderRules).all()
    const watchRules = rules.map((r) => ({ path: r.path, spaceId: r.spaceId }))

    watcher.stop()
    if (folders.length > 0) {
      watcher.updateFolderRules(watchRules)
      watcher.start(folders)
    }
    return { watching: folders }
  })

  registerHandler('activity.getWatchedFolders', async () => {
    const { bundle } = getDeps()
    const settings = createSettingsRepo(bundle.db)
    const folders = settings.get('activity.watchedFolders', z.array(z.string())) ?? []
    return { folders }
  })
}
