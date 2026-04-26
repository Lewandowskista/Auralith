import { z } from 'zod'
import { registerHandler } from '../router'
import type Database from 'better-sqlite3'
import { getCdpStatus, launchChromeWithCdp } from '../../tools/builtin/browser'
import { addToAllowList, removeFromAllowList, getAllowList } from '../../tools/confirmation'

let _sqlite: Database.Database | null = null

export function initPcControlDeps(sqlite: Database.Database): void {
  _sqlite = sqlite
}

function getSqlite(): Database.Database {
  if (!_sqlite) throw new Error('PcControl deps not initialized')
  return _sqlite
}

export function registerPcControlHandlers(): void {
  registerHandler('pccontrol.getStatus', async () => {
    const cdp = await getCdpStatus()
    return { cdp }
  })

  registerHandler('pccontrol.launchChrome', async () => {
    launchChromeWithCdp()
    return { ok: true }
  })

  registerHandler('pccontrol.getAllowList', async () => {
    const entries = getAllowList(getSqlite())
    return { entries }
  })

  registerHandler('pccontrol.addAllowList', async (params) => {
    const { toolId } = z.object({ toolId: z.string() }).parse(params)
    addToAllowList(getSqlite(), toolId)
    return { ok: true }
  })

  registerHandler('pccontrol.removeAllowList', async (params) => {
    const { toolId } = z.object({ toolId: z.string() }).parse(params)
    removeFromAllowList(getSqlite(), toolId)
    return { ok: true }
  })
}
