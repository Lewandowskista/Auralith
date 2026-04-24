import { registerHandler } from '../router'

// Placeholder handlers for namespaces to be implemented in future milestones.
// assistant.*, brain.*, activity.*, news.*, weather.*, suggest.* are now live.
const STUB_OPS = [
  // No stubs remaining for MVP — all ops implemented through M6
] as const

export function registerStubHandlers(): void {
  for (const op of STUB_OPS) {
    registerHandler(op, async () => {
      throw Object.assign(new Error('Not yet implemented'), { code: 'NOT_IMPLEMENTED' })
    })
  }
}
