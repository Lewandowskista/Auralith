import { z } from 'zod'
import { registerTool } from '@auralith/core-tools'
import { execSync } from 'child_process'

export function registerSystemLockTools(): void {
  registerTool({
    id: 'screen.lock',
    tier: 'restricted',
    describeForModel:
      'Lock the Windows workstation (equivalent to Win+L). Requires explicit user confirmation.',
    paramsSchema: z.object({}),
    resultSchema: z.object({ ok: z.boolean() }),
    execute: async () => {
      execSync('rundll32.exe user32.dll,LockWorkStation', { timeout: 5000 })
      return { ok: true }
    },
  })

  registerTool({
    id: 'system.sleep',
    tier: 'restricted',
    describeForModel: 'Put the Windows PC to sleep after an optional delay in seconds.',
    paramsSchema: z.object({
      delaySeconds: z
        .number()
        .int()
        .min(0)
        .max(300)
        .optional()
        .describe('Seconds before sleep (default 0)'),
    }),
    resultSchema: z.object({ ok: z.boolean() }),
    execute: async (params) => {
      const delay = params.delaySeconds ?? 0
      if (delay > 0) {
        execSync(`powershell -NoProfile -Command "Start-Sleep -Seconds ${delay}"`, {
          timeout: (delay + 5) * 1000,
        })
      }
      execSync(
        'powershell -NoProfile -Command "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState(\'Suspend\', $false, $false)"',
        {
          timeout: 5000,
        },
      )
      return { ok: true }
    },
  })
}
