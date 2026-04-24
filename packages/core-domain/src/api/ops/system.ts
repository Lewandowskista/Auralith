import { z } from 'zod'

export const SystemGetVersionParamsSchema = z.object({})
export const SystemGetVersionResultSchema = z.object({
  version: z.string(),
  buildDate: z.string().optional(),
  channel: z.enum(['stable', 'beta']),
})

export const SystemGetUpdaterStatusParamsSchema = z.object({})
export const SystemGetUpdaterStatusResultSchema = z.object({
  status: z.enum(['idle', 'checking', 'available', 'downloading', 'ready', 'error']),
  version: z.string().optional(),
  error: z.string().optional(),
})

export const SystemTriggerUpdateCheckParamsSchema = z.object({})
export const SystemTriggerUpdateCheckResultSchema = z.object({ triggered: z.boolean() })

export const SystemInstallUpdateParamsSchema = z.object({})
export const SystemInstallUpdateResultSchema = z.object({ restarting: z.boolean() })

export const SystemGetDataDirParamsSchema = z.object({})
export const SystemGetDataDirResultSchema = z.object({ path: z.string(), sizeBytes: z.number() })

export const SystemGetDefaultFoldersParamsSchema = z.object({})
export const SystemDefaultFolderSchema = z.object({
  name: z.string(),
  path: z.string(),
})
export const SystemGetDefaultFoldersResultSchema = z.object({
  homeDir: z.string(),
  folders: z.array(SystemDefaultFolderSchema),
})

export const SystemOpenDataDirParamsSchema = z.object({})
export const SystemOpenDataDirResultSchema = z.object({ opened: z.boolean() })

export const SystemPickFolderParamsSchema = z.object({
  title: z.string().optional(),
  defaultPath: z.string().optional(),
})
export const SystemPickFolderResultSchema = z.object({
  canceled: z.boolean(),
  path: z.string().optional(),
})

export const SystemExportDataParamsSchema = z.object({ destPath: z.string() })
export const SystemExportDataResultSchema = z.object({ exportedPath: z.string() })

export const SystemDeleteAllDataParamsSchema = z.object({ confirm: z.literal('DELETE') })
export const SystemDeleteAllDataResultSchema = z.object({ deleted: z.boolean() })

export const SystemGetCrashStatsParamsSchema = z.object({})
export const CrashStatSummarySchema = z.object({
  module: z.string(),
  crashCount: z.number(),
  errorCount: z.number(),
  lastTs: z.number(),
})
export const SystemGetCrashStatsResultSchema = z.object({
  byModule: z.array(CrashStatSummarySchema),
  totalCrashes: z.number(),
  totalErrors: z.number(),
  windowDays: z.literal(30),
})

export const SystemClearCrashStatsParamsSchema = z.object({})
export const SystemClearCrashStatsResultSchema = z.object({ cleared: z.boolean() })

// M13: mini companion window
export const SystemOpenMiniWindowParamsSchema = z.object({})
export const SystemOpenMiniWindowResultSchema = z.object({ opened: z.boolean() })

export const SystemCloseMiniWindowParamsSchema = z.object({})
export const SystemCloseMiniWindowResultSchema = z.object({ closed: z.boolean() })

export const SystemGetMiniWindowStateParamsSchema = z.object({})
export const SystemGetMiniWindowStateResultSchema = z.object({ open: z.boolean() })

export const SystemOpenSpotlightWindowParamsSchema = z.object({
  prefill: z.string().optional(),
})
export const SystemOpenSpotlightWindowResultSchema = z.object({ opened: z.boolean() })

export const SystemCloseSpotlightWindowParamsSchema = z.object({})
export const SystemCloseSpotlightWindowResultSchema = z.object({ closed: z.boolean() })

export const SystemGetSpotlightWindowStateParamsSchema = z.object({})
export const SystemGetSpotlightWindowStateResultSchema = z.object({ open: z.boolean() })

export const SystemDispatchShellActionParamsSchema = z.object({
  id: z.string(),
  payload: z.unknown().optional(),
})
export const SystemDispatchShellActionResultSchema = z.object({ dispatched: z.boolean() })
