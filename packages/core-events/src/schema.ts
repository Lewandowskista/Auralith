import { z } from 'zod'

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

export type ActivityEvent = {
  id: string
  ts: Date
  kind: ActivityEventKind
  source: 'watcher' | 'assistant' | 'user' | 'signal'
  path: string
  prevPath?: string
  spaceId?: string
  actor: string
  payloadJson: string
  sessionId?: string
}

export type RawFileEvent = {
  kind: ActivityEventKind
  path: string
  prevPath?: string
  size?: number
  sourceUrl?: string
  ts: number
}
