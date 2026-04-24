import { z } from 'zod'
import type { PermissionTier } from '@auralith/core-domain'

export type ToolCtx = {
  traceId: string
  actor: 'user' | 'suggestion' | 'scheduler'
}

export type ToolDef<P = unknown, R = unknown> = {
  id: string
  tier: PermissionTier
  paramsSchema: z.ZodType<P>
  resultSchema: z.ZodType<R>
  describeForModel: string
  execute: (params: P, ctx: ToolCtx) => Promise<R>
  reversible?: {
    windowMs: number
    undo: (params: P, result: R, ctx: ToolCtx) => Promise<void>
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ToolDef<any, any>>()

export function registerTool<P, R>(def: ToolDef<P, R>): void {
  if (registry.has(def.id)) {
    throw new Error(`Tool already registered: ${def.id}`)
  }
  registry.set(def.id, def)
}

export function getTool(id: string): ToolDef | undefined {
  return registry.get(id)
}

export function listTools(): ToolDef[] {
  return Array.from(registry.values())
}

export function listToolsForModel(): Array<{
  id: string
  tier: PermissionTier
  description: string
  paramsSchema: object
}> {
  return listTools().map((t) => ({
    id: t.id,
    tier: t.tier,
    description: t.describeForModel,
    paramsSchema: paramsToJsonSchema(t.paramsSchema),
  }))
}

function paramsToJsonSchema(schema: z.ZodType): object {
  // Minimal JSON schema extraction — covers object types with string/number/boolean fields
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>
    const properties: Record<string, object> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonSchema(value)
      if (!(value instanceof z.ZodOptional)) required.push(key)
    }
    return { type: 'object', properties, required }
  }
  return {}
}

function zodTypeToJsonSchema(schema: z.ZodType): object {
  if (schema instanceof z.ZodString) return { type: 'string' }
  if (schema instanceof z.ZodNumber) return { type: 'number' }
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' }
  if (schema instanceof z.ZodOptional) return zodTypeToJsonSchema(schema.unwrap())
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options }
  if (schema instanceof z.ZodArray)
    return { type: 'array', items: zodTypeToJsonSchema(schema.element) }
  return {}
}
