import { registerHandler } from '../router'
import { BrowserWindow } from 'electron'
import type { DbBundle } from '@auralith/core-db'
import {
  SettingsGetParamsSchema,
  SettingsSetParamsSchema,
  SettingsGetAllParamsSchema,
  PermissionsListParamsSchema,
  PermissionsGrantParamsSchema,
  PermissionsRevokeParamsSchema,
  AuditQueryParamsSchema,
  AuditExportParamsSchema,
  AuditPurgeParamsSchema,
} from '@auralith/core-domain'
import { z } from 'zod'
import { createSettingsRepo } from '@auralith/core-db'
import { createAuditRepo } from '@auralith/core-db'
import { createPermissionsRepo } from '@auralith/core-db'

const TITLEBAR_COLORS = {
  dark: '#07070B',
  light: '#f4f4f8',
} as const

function updateTitlebarColor(resolved: 'dark' | 'light'): void {
  const bg = TITLEBAR_COLORS[resolved]
  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(bg)
  }
}

export function registerSettingsHandlers(bundle: DbBundle): void {
  const settings = createSettingsRepo(bundle.db)
  const audit = createAuditRepo(bundle.db)
  const permissions = createPermissionsRepo(bundle.db)

  registerHandler('settings.get', async (params) => {
    const { key } = SettingsGetParamsSchema.parse(params)
    const value = settings.get(key, z.unknown())
    return { value }
  })

  registerHandler('settings.set', async (params) => {
    const { key, value } = SettingsSetParamsSchema.parse(params)
    settings.set(key, value)
    // Side-effect: update native titlebar when resolved theme changes
    if (key === 'appearance.resolvedTheme' && (value === 'dark' || value === 'light')) {
      updateTitlebarColor(value)
    }
    return { updated: true }
  })

  registerHandler('settings.getAll', async (params) => {
    SettingsGetAllParamsSchema.parse(params)
    return { settings: settings.getAll() }
  })

  registerHandler('permissions.list', async (params) => {
    PermissionsListParamsSchema.parse(params)
    const grants = permissions.list().map((g) => ({
      ...g,
      grantedAt: g.grantedAt.getTime(),
      expiresAt: g.expiresAt?.getTime(),
    }))
    return { grants }
  })

  registerHandler('permissions.grant', async (params) => {
    const { scope, expiresAt } = PermissionsGrantParamsSchema.parse(params)
    const grant = permissions.grant(
      scope,
      expiresAt !== undefined ? new Date(expiresAt) : undefined,
    )
    return {
      grant: {
        ...grant,
        grantedAt: grant.grantedAt.getTime(),
        expiresAt: grant.expiresAt?.getTime(),
      },
    }
  })

  registerHandler('permissions.revoke', async (params) => {
    const { scope } = PermissionsRevokeParamsSchema.parse(params)
    permissions.revoke(scope)
    return { revoked: true }
  })

  registerHandler('audit.query', async (params) => {
    const opts = AuditQueryParamsSchema.parse(params)
    const queryOpts: Parameters<typeof audit.query>[0] = {}
    if (opts.after !== undefined) queryOpts.after = new Date(opts.after)
    if (opts.before !== undefined) queryOpts.before = new Date(opts.before)
    if (opts.kind !== undefined) queryOpts.kind = opts.kind
    if (opts.actor !== undefined) queryOpts.actor = opts.actor
    if (opts.limit !== undefined) queryOpts.limit = opts.limit
    if (opts.offset !== undefined) queryOpts.offset = opts.offset
    const entries = audit.query(queryOpts)
    return {
      entries: entries.map((e) => ({ ...e, ts: e.ts.getTime() })),
      total: audit.count(),
    }
  })

  registerHandler('audit.export', async (params) => {
    const { format } = AuditExportParamsSchema.parse(params)
    const entries = audit.query({ limit: 100_000 })
    if (format === 'json') {
      return {
        content: JSON.stringify(
          entries.map((e) => ({ ...e, ts: e.ts.getTime() })),
          null,
          2,
        ),
        mimeType: 'application/json',
      }
    }
    const header = 'id,ts,kind,actor,subject,meta\n'
    const rows = entries
      .map((e) =>
        [e.id, e.ts.getTime(), e.kind, e.actor, e.subject, JSON.stringify(e.meta)]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n')
    return { content: header + rows, mimeType: 'text/csv' }
  })

  registerHandler('audit.purge', async (params) => {
    const { before } = AuditPurgeParamsSchema.parse(params)
    // Purge is a restricted action — caller must have already validated tier
    // For now return 0; real implementation in M5+
    void before
    return { deleted: 0 }
  })
}
