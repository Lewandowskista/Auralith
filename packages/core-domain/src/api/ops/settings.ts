import { z } from 'zod'
import { PermissionTierSchema } from '../types'

const PermissionGrantSchema = z.object({
  id: z.string(),
  scope: z.string(),
  grantedAt: z.number(),
  expiresAt: z.number().optional(),
})

const AuditEntrySchema = z.object({
  id: z.string(),
  ts: z.number(),
  kind: z.string(),
  actor: z.string(),
  subject: z.string(),
  meta: z.record(z.unknown()),
})

export const SettingsGetParamsSchema = z.object({ key: z.string() })
export const SettingsGetResultSchema = z.object({ value: z.unknown() })

export const SettingsSetParamsSchema = z.object({ key: z.string(), value: z.unknown() })
export const SettingsSetResultSchema = z.object({ updated: z.boolean() })

export const SettingsGetAllParamsSchema = z.object({})
export const SettingsGetAllResultSchema = z.object({ settings: z.record(z.unknown()) })

export const PermissionsListParamsSchema = z.object({})
export const PermissionsListResultSchema = z.object({ grants: z.array(PermissionGrantSchema) })

export const PermissionsGrantParamsSchema = z.object({
  scope: z.string(),
  expiresAt: z.number().optional(),
})
export const PermissionsGrantResultSchema = z.object({ grant: PermissionGrantSchema })

export const PermissionsRevokeParamsSchema = z.object({ scope: z.string() })
export const PermissionsRevokeResultSchema = z.object({ revoked: z.boolean() })

export const AuditQueryParamsSchema = z.object({
  after: z.number().optional(),
  before: z.number().optional(),
  kind: z.string().optional(),
  actor: z.string().optional(),
  limit: z.number().int().positive().default(100),
  offset: z.number().int().min(0).default(0),
})
export const AuditQueryResultSchema = z.object({
  entries: z.array(AuditEntrySchema),
  total: z.number(),
})

export const AuditExportParamsSchema = z.object({ format: z.enum(['json', 'csv']) })
export const AuditExportResultSchema = z.object({ content: z.string(), mimeType: z.string() })

export const AuditPurgeParamsSchema = z.object({ before: z.number().optional() })
export const AuditPurgeResultSchema = z.object({ deleted: z.number() })

export { PermissionTierSchema }
