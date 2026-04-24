import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import type { CrashStatLevel } from '@auralith/core-db'

const MAX_LOG_BYTES = 2 * 1024 * 1024 // 2 MB rolling cap

let crashLogPath: string | null = null
let _recordStat: ((level: CrashStatLevel, module: string, message: string) => void) | null = null

// Called after DB is initialized so stats recording is available
export function setCrashStatRecorder(
  fn: (level: CrashStatLevel, module: string, message: string) => void,
): void {
  _recordStat = fn
}

function timestamp(): string {
  return new Date().toISOString()
}

function extractModule(stack?: string): string {
  if (!stack) return 'unknown'
  const match = stack.match(/at\s+\S+\s+\(([^)]+)\)/) ?? stack.match(/\(([^)]+)\)/)
  if (!match) return 'main'
  const raw = match[1] ?? ''
  // Strip leading path down to src/
  const srcIdx = raw.lastIndexOf('src/')
  if (srcIdx >= 0) return raw.slice(srcIdx).replace(/:\d+:\d+$/, '')
  return raw.replace(/.*[\\/]/, '').replace(/:\d+:\d+$/, '') || 'main'
}

function writeEntry(level: 'ERROR' | 'CRASH', message: string, stack?: string): void {
  if (!crashLogPath) return
  const line = `[${timestamp()}] [${level}] ${message}${stack ? `\n${stack}` : ''}\n`
  try {
    appendFileSync(crashLogPath, line, 'utf8')
    // Rolling trim: if log exceeds cap, drop the first half
    const stat = statSync(crashLogPath)
    if (stat.size > MAX_LOG_BYTES) {
      const content = readFileSync(crashLogPath, 'utf8')
      const trimmed = content.slice(Math.floor(content.length / 2))
      appendFileSync(
        crashLogPath,
        `\n[${timestamp()}] [INFO] Log trimmed to prevent unbounded growth\n`,
        'utf8',
      )
      const lines = trimmed.split('\n').slice(1) // drop partial first line
      writeFileSync(crashLogPath, lines.join('\n'), 'utf8')
    }
  } catch {
    // Fail silently — never let the reporter crash the app
  }

  // Record to DB if available (late-bound after DB init)
  try {
    const statLevel: CrashStatLevel = level === 'CRASH' ? 'crash' : 'error'
    const module = extractModule(stack)
    _recordStat?.(statLevel, module, message.slice(0, 500))
  } catch {
    // Never let stats recording crash the process
  }
}

export function setupCrashReporter(): void {
  const logDir = join(app.getPath('userData'), 'logs')
  mkdirSync(logDir, { recursive: true })
  crashLogPath = join(logDir, 'crash.log')

  // Catch uncaught exceptions in main process
  process.on('uncaughtException', (err) => {
    writeEntry('CRASH', `Uncaught exception: ${err.message}`, err.stack)
    console.error('[crash]', err)
  })

  // Catch unhandled promise rejections in main process
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    writeEntry('ERROR', `Unhandled rejection: ${msg}`, stack)
    console.error('[crash] unhandled rejection:', reason)
  })
}

export function logError(message: string, err?: unknown): void {
  const stack = err instanceof Error ? err.stack : undefined
  const detail = err instanceof Error ? err.message : err !== undefined ? String(err) : ''
  writeEntry('ERROR', detail ? `${message}: ${detail}` : message, stack)
}

export function getCrashLogPath(): string | null {
  return crashLogPath
}

export function getCrashLogContent(): string {
  if (!crashLogPath || !existsSync(crashLogPath)) return ''
  try {
    return readFileSync(crashLogPath, 'utf8')
  } catch {
    return ''
  }
}
