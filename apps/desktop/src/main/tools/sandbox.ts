import { realpathSync, mkdirSync } from 'fs'
import { resolve, normalize, isAbsolute, dirname, basename } from 'path'
import { homedir } from 'os'
import { app } from 'electron'

/** Roots approved for file-system tool access. Populated from settings at startup + user additions. */
let sandboxRoots: string[] = []

export function initSandboxRoots(roots: string[]): void {
  sandboxRoots = roots.map(normalizeRoot).filter(Boolean) as string[]
}

export function getSandboxRoots(): string[] {
  return [...sandboxRoots]
}

export function addSandboxRoot(root: string): void {
  const normalized = normalizeRoot(root)
  if (normalized && !sandboxRoots.includes(normalized)) {
    sandboxRoots.push(normalized)
  }
}

export type SandboxResult =
  | { ok: true; absPath: string }
  | { ok: false; reason: string; suggestAddRoot?: string }

/**
 * Resolves a user-supplied path and checks it is inside an approved sandbox root.
 * Handles ~, env vars, relative paths, and blocks traversal / symlink escapes.
 */
export function resolveInSandbox(rawPath: string): SandboxResult {
  if (!rawPath || typeof rawPath !== 'string') {
    return { ok: false, reason: 'Empty path provided' }
  }

  // Expand ~ and env vars
  let expanded = rawPath
    .replace(/^~/, homedir())
    .replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`)

  // Make absolute (relative to user home if not absolute)
  if (!isAbsolute(expanded)) {
    expanded = resolve(homedir(), expanded)
  }

  const normalized = normalize(expanded)

  // Resolve real path to catch symlink escapes — if path doesn't exist yet, resolve parent
  let realPath: string
  try {
    realPath = realpathSync(normalized)
  } catch {
    // Path doesn't exist yet — resolve the parent to check sandbox membership
    try {
      const parentReal = realpathSync(dirname(normalized))
      realPath = resolve(parentReal, basename(normalized))
    } catch {
      realPath = normalized
    }
  }

  // Check if inside any approved root
  const matchingRoot = sandboxRoots.find((root) => {
    return realPath === root || realPath.startsWith(root + '\\') || realPath.startsWith(root + '/')
  })

  if (matchingRoot) {
    return { ok: true, absPath: realPath }
  }

  // Suggest the nearest parent as a root to add
  const suggestAddRoot = dirname(realPath)
  return {
    ok: false,
    reason: `Path is outside sandboxed roots. Approved roots: ${sandboxRoots.join(', ') || '(none)'}`,
    suggestAddRoot,
  }
}

/** Build default sandbox roots from Electron app paths */
export function getDefaultSandboxRoots(): string[] {
  const roots: string[] = []
  const push = (p: string) => {
    try {
      mkdirSync(p, { recursive: true })
      roots.push(normalizeRoot(p) as string)
    } catch {
      // skip if we can't create it
    }
  }
  push(app.getPath('desktop'))
  push(app.getPath('documents'))
  push(app.getPath('downloads'))
  return roots.filter(Boolean)
}

function normalizeRoot(p: string): string | null {
  try {
    const expanded = p.replace(/^~/, homedir())
    const abs = isAbsolute(expanded) ? expanded : resolve(homedir(), expanded)
    // Try real path; fall back to normalized abs path
    try {
      return realpathSync(abs)
    } catch {
      return normalize(abs)
    }
  } catch {
    return null
  }
}
