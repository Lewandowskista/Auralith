import { describe, it, expect } from 'vitest'
import { IpcRequestSchema, PermissionTierSchema, ActivityEventKindSchema } from './types'

describe('IpcRequestSchema', () => {
  it('parses a valid request', () => {
    const result = IpcRequestSchema.safeParse({ op: 'settings.get', params: {}, requestId: 'r1' })
    expect(result.success).toBe(true)
  })

  it('rejects missing op', () => {
    const result = IpcRequestSchema.safeParse({ params: {}, requestId: 'r1' })
    expect(result.success).toBe(false)
  })
})

describe('PermissionTierSchema', () => {
  it('accepts valid tiers', () => {
    expect(PermissionTierSchema.parse('safe')).toBe('safe')
    expect(PermissionTierSchema.parse('confirm')).toBe('confirm')
    expect(PermissionTierSchema.parse('restricted')).toBe('restricted')
  })

  it('rejects invalid tier', () => {
    expect(() => PermissionTierSchema.parse('admin')).toThrow()
  })
})

describe('ActivityEventKindSchema', () => {
  it('accepts all defined kinds', () => {
    const kinds = [
      'file.create',
      'file.edit',
      'file.move',
      'file.rename',
      'file.delete',
      'file.download',
      'assistant.action',
      'app.focus',
    ]
    kinds.forEach((k) => expect(ActivityEventKindSchema.parse(k)).toBe(k))
  })
})
