import { registerHandler } from '../router'
import { triggerBriefingNow, getLastBriefingPayload } from '../../briefing/briefing-job'

export function registerBriefingHandlers(): void {
  registerHandler('briefing.triggerNow', async () => {
    await triggerBriefingNow()
    return { triggered: true }
  })

  registerHandler('briefing.getLastBriefing', async () => {
    const payload = getLastBriefingPayload()
    return { payload }
  })
}
