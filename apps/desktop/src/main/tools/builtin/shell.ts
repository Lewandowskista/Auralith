import { spawn } from 'child_process'
import { z } from 'zod'
import { registerTool } from '@auralith/core-tools'

const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 120_000
const OUTPUT_CAP = 64_000

export function registerShellTools(): void {
  registerTool({
    id: 'shell.run',
    tier: 'restricted',
    paramsSchema: z.object({
      command: z.string().min(1),
      cwd: z.string().optional(),
      timeoutMs: z.number().int().min(1_000).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      exitCode: z.number().nullable(),
      stdout: z.string(),
      stderr: z.string(),
      timedOut: z.boolean(),
      cwd: z.string(),
      truncated: z.boolean(),
    }),
    describeForModel:
      'Run a PowerShell command on the local Windows machine. This is a restricted action and always requires the user to type CONFIRM before execution.',
    execute: async (params) => {
      const cwd = params.cwd?.trim() || process.cwd()
      const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS

      return await new Promise((resolve, reject) => {
        let stdout = ''
        let stderr = ''
        let truncated = false
        let timedOut = false

        const child = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', params.command],
          {
            cwd,
            windowsHide: true,
          },
        )

        const append = (target: 'stdout' | 'stderr', chunk: string) => {
          if (chunk.length === 0) return
          if (target === 'stdout') {
            stdout = appendCapped(stdout, chunk)
            truncated = truncated || stdout.endsWith('\n...[truncated]')
            return
          }
          stderr = appendCapped(stderr, chunk)
          truncated = truncated || stderr.endsWith('\n...[truncated]')
        }

        child.stdout.on('data', (chunk: Buffer | string) => {
          append('stdout', chunk.toString())
        })
        child.stderr.on('data', (chunk: Buffer | string) => {
          append('stderr', chunk.toString())
        })
        child.on('error', (error) => reject(error))

        const timeout = setTimeout(() => {
          timedOut = true
          child.kill()
        }, timeoutMs)

        child.on('close', (code) => {
          clearTimeout(timeout)
          resolve({
            ok: code === 0 && !timedOut,
            exitCode: code,
            stdout,
            stderr,
            timedOut,
            cwd,
            truncated,
          })
        })
      })
    },
  })
}

function appendCapped(current: string, chunk: string): string {
  if (current.endsWith('\n...[truncated]')) {
    return current
  }
  const next = current + chunk
  if (next.length <= OUTPUT_CAP) {
    return next
  }
  return next.slice(0, OUTPUT_CAP) + '\n...[truncated]'
}
