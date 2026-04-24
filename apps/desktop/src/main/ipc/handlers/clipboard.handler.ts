import { registerHandler } from '../router'
import { ClipboardListParamsSchema, ClipboardDeleteParamsSchema } from '@auralith/core-domain'
import type { ClipboardRepo } from '@auralith/core-db'
import type { ClipboardWatcher } from '../../watcher/clipboard-watcher'
import type { SettingsRepo } from '@auralith/core-db'
import { z } from 'zod'

type ClipboardDeps = {
  clipboardRepo: ClipboardRepo
  clipboardWatcher: ClipboardWatcher
  settings: SettingsRepo
}

let _deps: ClipboardDeps | null = null

export function initClipboardDeps(deps: ClipboardDeps): void {
  _deps = deps
}

function getDeps(): ClipboardDeps {
  if (!_deps) throw new Error('Clipboard deps not initialized')
  return _deps
}

export function registerClipboardHandlers(): void {
  registerHandler('clipboard.list', async (params) => {
    const { limit, offset } = ClipboardListParamsSchema.parse(params)
    const { clipboardRepo } = getDeps()
    const items = clipboardRepo.list(limit, offset)
    return { items }
  })

  registerHandler('clipboard.delete', async (params) => {
    const { id } = ClipboardDeleteParamsSchema.parse(params)
    const { clipboardRepo } = getDeps()
    clipboardRepo.deleteById(id)
    return { deleted: true }
  })

  registerHandler('clipboard.clear', async () => {
    const { clipboardRepo } = getDeps()
    const deleted = clipboardRepo.clear()
    return { deleted }
  })

  registerHandler('clipboard.setEnabled', async (params) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(params)
    const { clipboardWatcher, settings } = getDeps()
    clipboardWatcher.setEnabled(enabled)
    settings.set('activity.clipboardEnabled', enabled)
    return { enabled }
  })

  registerHandler('clipboard.setRedact', async (params) => {
    const { redact } = z.object({ redact: z.boolean() }).parse(params)
    const { clipboardWatcher, settings } = getDeps()
    clipboardWatcher.setRedactSensitive(redact)
    settings.set('activity.clipboardRedact', redact)
    return { redact }
  })

  registerHandler('clipboard.getSettings', async () => {
    const { clipboardWatcher } = getDeps()
    return { enabled: clipboardWatcher.isEnabled() }
  })
}
