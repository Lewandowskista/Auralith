import { z } from 'zod'
import { registerTool } from '@auralith/core-tools'
import { execFileSync as execSync } from 'child_process'

// ---------------------------------------------------------------------------
// Helpers — Windows window management via PowerShell + user32.dll P/Invoke
// ---------------------------------------------------------------------------

const SW_RESTORE = 9
const SW_MINIMIZE = 6
const SW_MAXIMIZE = 3

// PowerShell snippet that compiles a tiny ShowWindow helper
const SHOW_WINDOW_PS = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinUtil {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
'@ -Language CSharp -ErrorAction SilentlyContinue
`

function psRunRaw(script: string, timeoutMs = 10000): string {
  return execSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: timeoutMs,
  }).trim()
}

type WinInfo = { name: string; pid: number; title: string; hwnd: string }

function listWindows(): WinInfo[] {
  try {
    const out = psRunRaw(`
      Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } |
      Select-Object Name, Id, MainWindowTitle, MainWindowHandle |
      ConvertTo-Json -Compress -Depth 1
    `)
    const raw = JSON.parse(out) as
      | Array<{ Name: string; Id: number; MainWindowTitle: string; MainWindowHandle: number }>
      | { Name: string; Id: number; MainWindowTitle: string; MainWindowHandle: number }
    const arr = Array.isArray(raw) ? raw : [raw]
    return arr.map((p) => ({
      name: p.Name,
      pid: p.Id,
      title: p.MainWindowTitle,
      hwnd: p.MainWindowHandle.toString(),
    }))
  } catch {
    return []
  }
}

function findWindow(name: string): WinInfo | null {
  const wins = listWindows()
  const lower = name.toLowerCase()
  return (
    wins.find(
      (w) => w.name.toLowerCase().includes(lower) || w.title.toLowerCase().includes(lower),
    ) ?? null
  )
}

const SAFE_HWND = /^(0x[0-9a-fA-F]+|\d{1,20})$/

function showWindow(hwnd: string, cmd: number): boolean {
  if (!SAFE_HWND.test(hwnd)) return false
  try {
    psRunRaw(`
      ${SHOW_WINDOW_PS}
      [WinUtil]::ShowWindow([IntPtr]${hwnd}, ${cmd})
    `)
    return true
  } catch {
    return false
  }
}

function bringToFront(hwnd: string): boolean {
  if (!SAFE_HWND.test(hwnd)) return false
  try {
    psRunRaw(`
      ${SHOW_WINDOW_PS}
      [WinUtil]::ShowWindow([IntPtr]${hwnd}, ${SW_RESTORE})
      [WinUtil]::SetForegroundWindow([IntPtr]${hwnd})
    `)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Tool registrations
// ---------------------------------------------------------------------------

export function registerWindowManagerTools(): void {
  registerTool({
    id: 'window.list',
    tier: 'safe',
    describeForModel:
      'List all open Windows application windows with their names, process IDs, and titles.',
    paramsSchema: z.object({}),
    resultSchema: z.object({
      windows: z.array(
        z.object({ name: z.string(), pid: z.number(), title: z.string(), hwnd: z.string() }),
      ),
    }),
    execute: async () => ({ windows: listWindows() }),
  })

  registerTool({
    id: 'window.minimize',
    tier: 'confirm-transient',
    describeForModel: 'Minimize a named window (or the foreground window if no name given).',
    paramsSchema: z.object({
      name: z
        .string()
        .optional()
        .describe('App/window name, e.g. "Chrome". Omit for foreground window.'),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    reversible: { windowMs: 30 * 60 * 1000, undo: async () => {} },
    execute: async (params) => {
      const win = params.name ? findWindow(params.name) : listWindows()[0]
      if (!win) return { ok: false, error: `Window not found: ${params.name ?? 'foreground'}` }
      const ok = showWindow(win.hwnd, SW_MINIMIZE)
      return { ok, error: ok ? undefined : 'ShowWindow failed' }
    },
  })

  registerTool({
    id: 'window.maximize',
    tier: 'confirm-transient',
    describeForModel: 'Maximize a named window.',
    paramsSchema: z.object({
      name: z.string().optional().describe('App/window name. Omit for foreground window.'),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    execute: async (params) => {
      const win = params.name ? findWindow(params.name) : listWindows()[0]
      if (!win) return { ok: false, error: `Window not found: ${params.name ?? 'foreground'}` }
      const ok = showWindow(win.hwnd, SW_MAXIMIZE)
      return { ok, error: ok ? undefined : 'ShowWindow failed' }
    },
  })

  registerTool({
    id: 'window.restore',
    tier: 'confirm-transient',
    describeForModel: 'Restore a minimized window to its normal size.',
    paramsSchema: z.object({
      name: z.string().optional().describe('App/window name. Omit for foreground window.'),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    execute: async (params) => {
      const win = params.name ? findWindow(params.name) : listWindows()[0]
      if (!win) return { ok: false, error: `Window not found: ${params.name ?? 'foreground'}` }
      const ok = showWindow(win.hwnd, SW_RESTORE)
      return { ok, error: ok ? undefined : 'ShowWindow failed' }
    },
  })

  registerTool({
    id: 'window.focus',
    tier: 'confirm-transient',
    describeForModel: 'Bring a named application window to the foreground / give it focus.',
    paramsSchema: z.object({
      name: z.string().describe('App/window name, e.g. "Spotify", "VS Code"'),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    execute: async (params) => {
      const win = findWindow(params.name)
      if (!win) return { ok: false, error: `Window not found: ${params.name}` }
      const ok = bringToFront(win.hwnd)
      return { ok, error: ok ? undefined : 'SetForegroundWindow failed' }
    },
  })

  registerTool({
    id: 'window.close',
    tier: 'restricted',
    describeForModel:
      'Force-close (kill) an application window by name. Use with caution — unsaved work may be lost.',
    paramsSchema: z.object({
      name: z.string().describe('Process name, e.g. "chrome", "notepad"'),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    execute: async (params) => {
      try {
        psRunRaw(
          `Stop-Process -Name ${JSON.stringify(params.name)} -Force -ErrorAction SilentlyContinue`,
        )
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Stop-Process failed' }
      }
    },
  })
}
