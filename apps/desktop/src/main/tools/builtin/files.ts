import { z } from 'zod'
import { shell } from 'electron'
import { readdirSync, mkdirSync, renameSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { registerTool } from '@auralith/core-tools'

const EXT_BUCKETS: Record<string, string> = {
  pdf: 'Documents',
  doc: 'Documents',
  docx: 'Documents',
  odt: 'Documents',
  xls: 'Documents',
  xlsx: 'Documents',
  ppt: 'Documents',
  pptx: 'Documents',
  txt: 'Documents',
  rtf: 'Documents',
  csv: 'Documents',
  jpg: 'Images',
  jpeg: 'Images',
  png: 'Images',
  gif: 'Images',
  svg: 'Images',
  webp: 'Images',
  bmp: 'Images',
  ico: 'Images',
  tiff: 'Images',
  zip: 'Archives',
  rar: 'Archives',
  '7z': 'Archives',
  tar: 'Archives',
  gz: 'Archives',
  bz2: 'Archives',
  js: 'Code',
  ts: 'Code',
  py: 'Code',
  rs: 'Code',
  go: 'Code',
  java: 'Code',
  cpp: 'Code',
  c: 'Code',
  cs: 'Code',
  rb: 'Code',
  mp4: 'Media',
  mkv: 'Media',
  avi: 'Media',
  mov: 'Media',
  mp3: 'Media',
  flac: 'Media',
  wav: 'Media',
  ogg: 'Media',
  exe: 'Installers',
  msi: 'Installers',
  dmg: 'Installers',
  deb: 'Installers',
}

const undoSnapshots = new Map<string, Array<{ from: string; to: string }>>()

export function registerFileTools(getDownloadsPath: () => string): void {
  registerTool({
    id: 'files.organizeDownloads',
    tier: 'confirm',
    paramsSchema: z.object({ olderThanDays: z.number().int().min(0).default(3) }),
    resultSchema: z.object({ moved: z.number(), invocationId: z.string() }),
    describeForModel: 'Sort old files in the Downloads folder into subfolders by type.',
    reversible: {
      windowMs: 30 * 60 * 1000,
      undo: async (_params, result) => {
        const snapshot = undoSnapshots.get(result.invocationId)
        if (!snapshot) return
        for (const { from, to } of snapshot) {
          try {
            renameSync(to, from)
          } catch {
            /* best-effort */
          }
        }
        undoSnapshots.delete(result.invocationId)
      },
    },
    execute: async (params, ctx) => {
      const downloadsDir = getDownloadsPath()
      const olderThanDays = params.olderThanDays ?? 3
      const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
      let entries: string[] = []
      try {
        entries = readdirSync(downloadsDir)
      } catch {
        return { moved: 0, invocationId: ctx.traceId }
      }

      const moves: Array<{ from: string; to: string }> = []
      for (const entry of entries) {
        const src = join(downloadsDir, entry)
        let stat
        try {
          stat = statSync(src)
        } catch {
          continue
        }
        if (!stat.isFile()) continue
        if (stat.mtimeMs > cutoff) continue

        const ext = extname(entry).slice(1).toLowerCase()
        const bucket = EXT_BUCKETS[ext] ?? 'Other'
        const destDir = join(downloadsDir, bucket)
        mkdirSync(destDir, { recursive: true })

        let dest = join(destDir, entry)
        let counter = 1
        while (true) {
          try {
            statSync(dest)
            dest = join(destDir, `${basename(entry, extname(entry))}_${counter}${extname(entry)}`)
            counter++
          } catch {
            break
          }
        }
        try {
          renameSync(src, dest)
          moves.push({ from: src, to: dest })
        } catch {
          /* skip locked files */
        }
      }

      undoSnapshots.set(ctx.traceId, moves)
      if (undoSnapshots.size > 20) {
        const oldest = undoSnapshots.keys().next().value
        if (oldest !== undefined) undoSnapshots.delete(oldest)
      }
      return { moved: moves.length, invocationId: ctx.traceId }
    },
  })

  registerTool({
    id: 'files.revealInExplorer',
    tier: 'safe',
    paramsSchema: z.object({ path: z.string() }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Show a file or folder in the OS file explorer.',
    execute: async (params) => {
      shell.showItemInFolder(params.path)
      return { ok: true }
    },
  })

  registerTool({
    id: 'files.openRecent',
    tier: 'safe',
    paramsSchema: z.object({ paths: z.array(z.string()), sessionId: z.string().optional() }),
    resultSchema: z.object({ opened: z.number() }),
    describeForModel: 'Open recent files from a session in the default application.',
    execute: async (params) => {
      let opened = 0
      for (const p of params.paths.slice(0, 5)) {
        const err = await shell.openPath(p)
        if (!err) opened++
      }
      return { opened }
    },
  })

  registerTool({
    id: 'files.moveToSpace',
    tier: 'confirm',
    paramsSchema: z.object({ filePath: z.string(), destDir: z.string() }),
    resultSchema: z.object({ dest: z.string() }),
    describeForModel: 'Move a file into a space folder.',
    reversible: {
      windowMs: 30 * 60 * 1000,
      undo: async (params, result) => {
        try {
          renameSync(result.dest, params.filePath)
        } catch {
          /* best-effort */
        }
      },
    },
    execute: async (params) => {
      const dest = join(params.destDir, basename(params.filePath))
      mkdirSync(params.destDir, { recursive: true })
      renameSync(params.filePath, dest)
      return { dest }
    },
  })
}
