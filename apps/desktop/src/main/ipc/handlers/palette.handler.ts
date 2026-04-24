import { BrowserWindow } from 'electron'
import { registerHandler } from '../router'
import {
  PaletteOpenParamsSchema,
  PaletteCloseParamsSchema,
  PaletteQueryParamsSchema,
} from '@auralith/core-domain'

export function registerPaletteHandlers(): void {
  registerHandler('palette.open', async (params) => {
    const { prefill } = PaletteOpenParamsSchema.parse(params)
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('global-shortcut', { id: 'palette.open', prefill })
    return { opened: true }
  })

  registerHandler('palette.close', async (params) => {
    PaletteCloseParamsSchema.parse(params)
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('global-shortcut', { id: 'palette.close' })
    return { closed: true }
  })

  registerHandler('palette.query', async (params) => {
    // Query is resolved client-side for now; this op is reserved for future server-side search
    PaletteQueryParamsSchema.parse(params)
    return { items: [] }
  })
}
