import { z } from 'zod'
import { registerTool } from '@auralith/core-tools'
import { execFileSync, spawn } from 'child_process'

// ---------------------------------------------------------------------------
// Helpers — Windows app discovery
// ---------------------------------------------------------------------------

function findAppPath(name: string): string | null {
  // 1. Try direct command (works for apps on PATH) — use argument array to prevent injection
  try {
    const result = execFileSync('where', [name], { encoding: 'utf8', timeout: 3000 }).trim()
    if (result) return result.split('\n')[0].trim()
  } catch {
    // not on PATH — continue
  }

  // 2. Search App Paths registry key — use argument array to prevent injection
  const regKey = `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths`
  try {
    const out = execFileSync('reg', ['query', regKey, '/s', '/f', name, '/k'], {
      encoding: 'utf8',
      timeout: 5000,
    })
    const lines = out.split('\n').filter((l) => l.trim().startsWith('HKEY'))
    if (lines.length > 0) {
      const keyPath = lines[0].trim()
      const valOut = execFileSync('reg', ['query', keyPath, '/ve'], {
        encoding: 'utf8',
        timeout: 3000,
      })
      const match = valOut.match(/REG_SZ\s+(.+)/)
      if (match) return match[1].trim()
    }
  } catch {
    // not in registry
  }

  // 3. Fuzzy search known Start Menu dirs for a .lnk or .exe — dir patterns are fixed, name only used for JS filter
  const startMenuDirs = [
    `${process.env.APPDATA}\\Microsoft\\Windows\\Start Menu\\Programs`,
    `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs`,
  ]
  const nameLower = name.toLowerCase().replace(/\s+/g, '')
  for (const dir of startMenuDirs) {
    try {
      const entries = execFileSync(
        'cmd',
        ['/c', 'dir', '/b', '/s', `${dir}\\*.lnk`, `${dir}\\*.exe`],
        {
          encoding: 'utf8',
          timeout: 5000,
        },
      )
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const match = entries.find((e) => {
        const base = e.replace(/\\/g, '/').split('/').pop()?.toLowerCase().replace(/\s+/g, '') ?? ''
        return base.includes(nameLower)
      })
      if (match) return match
    } catch {
      // dir failed
    }
  }

  return null
}

function listRunningApps(): Array<{ name: string; pid: number }> {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Name,Id | ConvertTo-Json -Compress",
      ],
      { encoding: 'utf8', timeout: 8000 },
    )
    const raw = JSON.parse(out.trim()) as
      | Array<{ Name: string; Id: number }>
      | { Name: string; Id: number }
    const arr = Array.isArray(raw) ? raw : [raw]
    return arr.map((p) => ({ name: p.Name, pid: p.Id }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Tool registrations
// ---------------------------------------------------------------------------

export function registerAppLauncherTools(): void {
  registerTool({
    id: 'app.launch',
    tier: 'confirm',
    describeForModel:
      'Launch an installed Windows application by name. Fuzzy-matches app name against PATH, registry, and Start Menu.',
    paramsSchema: z.object({
      name: z.string().describe('App name, e.g. "Chrome", "Notepad", "VS Code"'),
      args: z.array(z.string()).optional().describe('Optional command-line arguments'),
    }),
    resultSchema: z.object({
      launched: z.boolean(),
      path: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async (params) => {
      const { name, args = [] } = params

      // Special-case common aliases
      const aliases: Record<string, string> = {
        chrome: 'chrome',
        'google chrome': 'chrome',
        firefox: 'firefox',
        edge: 'msedge',
        notepad: 'notepad',
        explorer: 'explorer',
        'file explorer': 'explorer',
        spotify: 'Spotify',
        discord: 'Discord',
        slack: 'slack',
        vscode: 'code',
        'vs code': 'code',
        'visual studio code': 'code',
        terminal: 'wt',
        'windows terminal': 'wt',
        calculator: 'calc',
        paint: 'mspaint',
        wordpad: 'wordpad',
        word: 'winword',
        excel: 'excel',
        powerpoint: 'powerpnt',
      }
      const resolved = aliases[name.toLowerCase()] ?? name

      // Try shell open first (most reliable for registered apps)
      try {
        const proc = spawn(resolved, args, {
          detached: true,
          stdio: 'ignore',
          shell: true,
          windowsHide: false,
        })
        proc.unref()
        return { launched: true, path: resolved }
      } catch {
        // Fall back to full path lookup
      }

      const path = findAppPath(resolved)
      if (!path) {
        return { launched: false, error: `Could not find application: ${name}` }
      }

      try {
        const proc = spawn(path, args, { detached: true, stdio: 'ignore', shell: false })
        proc.unref()
        return { launched: true, path }
      } catch (err) {
        return {
          launched: false,
          path,
          error: err instanceof Error ? err.message : 'Failed to launch',
        }
      }
    },
  })

  registerTool({
    id: 'app.close',
    tier: 'confirm',
    describeForModel: 'Close (gracefully terminate) a running Windows application by name.',
    paramsSchema: z.object({
      name: z.string().describe('Process name, e.g. "chrome", "notepad", "spotify"'),
    }),
    resultSchema: z.object({
      closed: z.boolean(),
      error: z.string().optional(),
    }),
    execute: async (params) => {
      try {
        execFileSync(
          'powershell',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Get-Process -Name ${JSON.stringify(params.name)} -ErrorAction SilentlyContinue | Stop-Process -Force`,
          ],
          { encoding: 'utf8', timeout: 8000 },
        )
        return { closed: true }
      } catch (err) {
        return { closed: false, error: err instanceof Error ? err.message : 'Failed to close' }
      }
    },
  })

  registerTool({
    id: 'app.list',
    tier: 'safe',
    describeForModel: 'List currently running Windows applications that have visible windows.',
    paramsSchema: z.object({}),
    resultSchema: z.object({
      apps: z.array(z.object({ name: z.string(), pid: z.number() })),
    }),
    execute: async () => {
      return { apps: listRunningApps() }
    },
  })
}
