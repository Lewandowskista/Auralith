import { randomUUID } from 'crypto'

export type VoiceConvState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'follow-up-listening'

export type VoiceConversationSession = {
  id: string
  startedAt: number
  lastActivityAt: number
  state: VoiceConvState
  followUpTimer: ReturnType<typeof setTimeout> | null
  idleTimer: ReturnType<typeof setTimeout> | null
}

export function createConversationSession(): VoiceConversationSession {
  return {
    id: randomUUID(),
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    state: 'idle',
    followUpTimer: null,
    idleTimer: null,
  }
}

export function touchSession(session: VoiceConversationSession): void {
  session.lastActivityAt = Date.now()
}

export function clearSessionTimers(session: VoiceConversationSession): void {
  if (session.followUpTimer) {
    clearTimeout(session.followUpTimer)
    session.followUpTimer = null
  }
  if (session.idleTimer) {
    clearTimeout(session.idleTimer)
    session.idleTimer = null
  }
}
