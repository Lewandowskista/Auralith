import { z } from 'zod'

// Base IPC envelope — every op follows this shape
export const IpcRequestSchema = z.object({
  op: z.string(),
  params: z.unknown(),
  requestId: z.string(),
})

export const IpcResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({ message: z.string(), code: z.string().optional() }),
  }),
])

export type IpcRequest = z.infer<typeof IpcRequestSchema>
export type IpcResponse = z.infer<typeof IpcResponseSchema>

// Permission tiers
export const PermissionTierSchema = z.enum(['safe', 'confirm', 'confirm-transient', 'restricted'])
export type PermissionTier = z.infer<typeof PermissionTierSchema>

// Activity event kinds
export const ActivityEventKindSchema = z.enum([
  'file.create',
  'file.edit',
  'file.move',
  'file.rename',
  'file.delete',
  'file.download',
  'assistant.action',
  'app.focus',
])
export type ActivityEventKind = z.infer<typeof ActivityEventKindSchema>
