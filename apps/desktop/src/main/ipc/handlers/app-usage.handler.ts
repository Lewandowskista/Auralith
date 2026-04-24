import { registerHandler } from '../router'
import { AppUsageListParamsSchema, AppUsageClearBeforeParamsSchema } from '@auralith/core-domain'
import type { AppUsageRepo, EventsRepo } from '@auralith/core-db'
import type { AppSessionTracker } from '../../signals/app-session-tracker'
import type { SettingsRepo } from '@auralith/core-db'
import { z } from 'zod'

type AppUsageDeps = {
  appUsageRepo: AppUsageRepo
  eventsRepo: EventsRepo
  appSessionTracker: AppSessionTracker
  settings: SettingsRepo
}

let _deps: AppUsageDeps | null = null

export function initAppUsageDeps(deps: AppUsageDeps): void {
  _deps = deps
}

function getDeps(): AppUsageDeps {
  if (!_deps) throw new Error('AppUsage deps not initialized')
  return _deps
}

export function registerAppUsageHandlers(): void {
  registerHandler('appUsage.listSessions', async (params) => {
    const opts = AppUsageListParamsSchema.parse(params)
    const { appUsageRepo } = getDeps()
    const queryOpts: Parameters<typeof appUsageRepo.list>[0] = {
      limit: opts.limit,
      offset: opts.offset,
    }
    if (opts.after !== undefined) queryOpts.after = new Date(opts.after)
    if (opts.before !== undefined) queryOpts.before = new Date(opts.before)
    const sessions = appUsageRepo.list(queryOpts)
    return { sessions }
  })

  registerHandler('appUsage.clearBefore', async (params) => {
    const { before } = AppUsageClearBeforeParamsSchema.parse(params)
    const { appUsageRepo } = getDeps()
    const deleted = appUsageRepo.deleteOlderThan(new Date(before))
    return { deleted }
  })

  registerHandler('appUsage.setEnabled', async (params) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(params)
    const { appSessionTracker, appUsageRepo, eventsRepo, settings } = getDeps()
    appSessionTracker.setEnabled(
      enabled,
      enabled ? appUsageRepo : undefined,
      enabled ? eventsRepo : undefined,
    )
    settings.set('activity.appUsageEnabled', enabled)
    return { enabled }
  })

  registerHandler('appUsage.getSettings', async () => {
    const { appSessionTracker } = getDeps()
    return { enabled: appSessionTracker.isEnabled() }
  })
}
