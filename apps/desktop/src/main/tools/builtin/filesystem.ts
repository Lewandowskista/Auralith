import { z } from 'zod'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  rmdirSync,
  statSync,
  readdirSync,
  rmSync,
  cpSync,
} from 'fs'
import { basename, dirname, join, relative } from 'path'
import { registerTool } from '@auralith/core-tools'
import { resolveInSandbox } from '../sandbox'

const MAX_READ_BYTES = 1_024 * 1_024 // 1 MB

export function registerFilesystemTools(): void {
  registerTool({
    id: 'files.createFile',
    tier: 'confirm',
    paramsSchema: z.object({
      path: z.string(),
      content: z.string().default(''),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      absPath: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel:
      'Create a new file at the given path with optional text content. Path must be inside an approved sandbox root (Desktop, Documents, Downloads, or user-added folders).',
    reversible: {
      windowMs: 30 * 60 * 1000,
      undo: async (_params, result) => {
        if (result.absPath) {
          try {
            unlinkSync(result.absPath)
          } catch {
            /* best-effort */
          }
        }
      },
    },
    execute: async (params) => {
      const resolved = resolveInSandbox(params.path)
      if (!resolved.ok) return { ok: false, error: resolved.reason }
      mkdirSync(dirname(resolved.absPath), { recursive: true })
      writeFileSync(resolved.absPath, params.content ?? '', 'utf8')
      return { ok: true, absPath: resolved.absPath }
    },
  })

  registerTool({
    id: 'files.createFolder',
    tier: 'confirm',
    paramsSchema: z.object({ path: z.string() }),
    resultSchema: z.object({
      ok: z.boolean(),
      absPath: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel:
      'Create a folder (and any missing parent folders) at the given path. Path must be inside an approved sandbox root.',
    reversible: {
      windowMs: 30 * 60 * 1000,
      undo: async (_params, result) => {
        if (result.absPath) {
          try {
            rmdirSync(result.absPath)
          } catch {
            /* only removes empty dirs */
          }
        }
      },
    },
    execute: async (params) => {
      const resolved = resolveInSandbox(params.path)
      if (!resolved.ok) return { ok: false, error: resolved.reason }
      mkdirSync(resolved.absPath, { recursive: true })
      return { ok: true, absPath: resolved.absPath }
    },
  })

  registerTool({
    id: 'files.writeToFile',
    tier: 'confirm',
    paramsSchema: z.object({
      path: z.string(),
      content: z.string(),
      mode: z.enum(['overwrite', 'append']).default('overwrite'),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      absPath: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel:
      'Write or append text to an existing file. Path must be inside an approved sandbox root.',
    execute: async (params) => {
      const resolved = resolveInSandbox(params.path)
      if (!resolved.ok) return { ok: false, error: resolved.reason }
      if (!existsSync(resolved.absPath))
        return { ok: false, error: 'File does not exist. Use files.createFile to create it first.' }
      if (params.mode === 'append') {
        writeFileSync(resolved.absPath, '\n' + params.content, { encoding: 'utf8', flag: 'a' })
      } else {
        writeFileSync(resolved.absPath, params.content, 'utf8')
      }
      return { ok: true, absPath: resolved.absPath }
    },
  })

  registerTool({
    id: 'files.readFile',
    tier: 'safe',
    paramsSchema: z.object({ path: z.string() }),
    resultSchema: z.object({
      ok: z.boolean(),
      content: z.string().optional(),
      error: z.string().optional(),
      truncated: z.boolean().optional(),
    }),
    describeForModel:
      'Read the text content of a file. Size-capped at 1 MB. Path must be inside an approved sandbox root. Use to give the assistant context about a specific file.',
    execute: async (params) => {
      const resolved = resolveInSandbox(params.path)
      if (!resolved.ok) return { ok: false, error: resolved.reason }
      if (!existsSync(resolved.absPath)) return { ok: false, error: 'File not found' }
      const stat = statSync(resolved.absPath)
      if (!stat.isFile()) return { ok: false, error: 'Path is not a file' }
      const size = stat.size
      const content = readFileSync(resolved.absPath, 'utf8').slice(0, MAX_READ_BYTES)
      return { ok: true, content, truncated: size > MAX_READ_BYTES }
    },
  })

  registerTool({
    id: 'files.listDirectory',
    tier: 'safe',
    paramsSchema: z.object({
      path: z.string(),
      recursive: z.boolean().default(false),
      maxEntries: z.number().int().min(1).max(500).default(200),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      entries: z
        .array(
          z.object({
            path: z.string(),
            name: z.string(),
            type: z.enum(['file', 'directory']),
            size: z.number().optional(),
          }),
        )
        .optional(),
      truncated: z.boolean().optional(),
      error: z.string().optional(),
    }),
    describeForModel:
      'List files and folders inside a sandbox-approved directory. Can recurse for deeper inspection.',
    execute: async (params) => {
      const maxEntries = params.maxEntries ?? 200
      const resolved = resolveInSandbox(params.path)
      if (!resolved.ok) return { ok: false, error: resolved.reason }
      if (!existsSync(resolved.absPath)) return { ok: false, error: 'Path not found' }
      if (!statSync(resolved.absPath).isDirectory())
        return { ok: false, error: 'Path is not a directory' }

      const entries: Array<{
        path: string
        name: string
        type: 'file' | 'directory'
        size?: number
      }> = []
      let truncated = false

      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entries.length >= maxEntries) {
            truncated = true
            return
          }
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            entries.push({
              path: fullPath,
              name: entry.name,
              type: 'directory',
            })
            if (params.recursive) walk(fullPath)
          } else if (entry.isFile()) {
            const size = safeStatSize(fullPath)
            entries.push({
              path: fullPath,
              name: entry.name,
              type: 'file',
              ...(size !== undefined ? { size } : {}),
            })
          }
        }
      }

      walk(resolved.absPath)
      return { ok: true, entries, truncated }
    },
  })

  registerTool({
    id: 'files.copy',
    tier: 'confirm',
    paramsSchema: z.object({
      sourcePath: z.string(),
      destinationPath: z.string(),
      overwrite: z.boolean().default(false),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      sourcePath: z.string().optional(),
      destinationPath: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel: 'Copy a file or directory between sandbox-approved paths.',
    execute: async (params) => {
      const source = resolveInSandbox(params.sourcePath)
      if (!source.ok) return { ok: false, error: source.reason }
      const destination = resolveInSandbox(params.destinationPath)
      if (!destination.ok) return { ok: false, error: destination.reason }
      if (!existsSync(source.absPath)) return { ok: false, error: 'Source path not found' }

      cpSync(source.absPath, destination.absPath, {
        recursive: true,
        errorOnExist: !params.overwrite,
        force: params.overwrite,
      })
      return { ok: true, sourcePath: source.absPath, destinationPath: destination.absPath }
    },
  })

  registerTool({
    id: 'files.delete',
    tier: 'confirm',
    paramsSchema: z.object({
      path: z.string(),
      recursive: z.boolean().default(false),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      absPath: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel:
      'Delete a file or directory inside the sandbox. Directories require recursive=true.',
    execute: async (params) => {
      const resolved = resolveInSandbox(params.path)
      if (!resolved.ok) return { ok: false, error: resolved.reason }
      if (!existsSync(resolved.absPath)) return { ok: false, error: 'Path not found' }

      const stat = statSync(resolved.absPath)
      if (stat.isDirectory() && !params.recursive) {
        return { ok: false, error: 'Directory deletion requires recursive=true' }
      }

      rmSync(resolved.absPath, { recursive: params.recursive, force: false })
      return { ok: true, absPath: resolved.absPath }
    },
  })

  registerTool({
    id: 'files.search',
    tier: 'safe',
    paramsSchema: z.object({
      path: z.string(),
      glob: z.string().default('**/*'),
      query: z.string().optional(),
      maxResults: z.number().int().min(1).max(200).default(50),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      matches: z
        .array(z.object({ path: z.string(), relativePath: z.string(), name: z.string() }))
        .optional(),
      truncated: z.boolean().optional(),
      error: z.string().optional(),
    }),
    describeForModel:
      'Search for files inside a sandbox-approved root using a glob-like pattern and optional text filter.',
    execute: async (params) => {
      const glob = params.glob ?? '**/*'
      const maxResults = params.maxResults ?? 50
      const resolved = resolveInSandbox(params.path)
      if (!resolved.ok) return { ok: false, error: resolved.reason }
      if (!existsSync(resolved.absPath)) return { ok: false, error: 'Path not found' }
      if (!statSync(resolved.absPath).isDirectory())
        return { ok: false, error: 'Path is not a directory' }

      const matches: Array<{ path: string; relativePath: string; name: string }> = []
      let truncated = false
      const matcher = globToRegExp(glob)
      const query = params.query?.trim().toLowerCase()

      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = join(dir, entry.name)
          const relativePath = relative(resolved.absPath, fullPath).replace(/\\/g, '/')
          if (entry.isDirectory()) {
            walk(fullPath)
            if (truncated) return
            continue
          }
          if (!entry.isFile()) continue

          if (!matcher.test(relativePath)) continue
          if (
            query &&
            !relativePath.toLowerCase().includes(query) &&
            !entry.name.toLowerCase().includes(query)
          )
            continue

          matches.push({
            path: fullPath,
            relativePath,
            name: basename(fullPath),
          })
          if (matches.length >= maxResults) {
            truncated = true
            return
          }
        }
      }

      walk(resolved.absPath)
      return { ok: true, matches, truncated }
    },
  })
}

function safeStatSize(path: string): number | undefined {
  try {
    return statSync(path).size
  } catch {
    return undefined
  }
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/::DOUBLE_STAR::/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}
