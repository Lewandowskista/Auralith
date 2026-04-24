import { app, BrowserWindow, dialog, screen } from 'electron'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { registerHandler } from '../router'
import { resolvePreloadPath, resolveRendererHtmlPath } from '../../windows/renderer-paths'
import {
  SystemGetVersionParamsSchema,
  SystemGetUpdaterStatusParamsSchema,
  SystemTriggerUpdateCheckParamsSchema,
  SystemInstallUpdateParamsSchema,
  SystemGetDataDirParamsSchema,
  SystemGetDefaultFoldersParamsSchema,
  SystemOpenDataDirParamsSchema,
  SystemPickFolderParamsSchema,
  SystemExportDataParamsSchema,
  SystemDeleteAllDataParamsSchema,
  SystemGetCrashStatsParamsSchema,
  SystemClearCrashStatsParamsSchema,
  SystemOpenMiniWindowParamsSchema,
  SystemCloseMiniWindowParamsSchema,
  SystemGetMiniWindowStateParamsSchema,
  SystemOpenSpotlightWindowParamsSchema,
  SystemCloseSpotlightWindowParamsSchema,
  SystemGetSpotlightWindowStateParamsSchema,
  SystemDispatchShellActionParamsSchema,
} from '@auralith/core-domain'
import { createCrashStatsRepo } from '@auralith/core-db'
import type { DbBundle } from '@auralith/core-db'
import { installUpdate } from '../../updater'
import { getCrashLogContent } from '../../crash-reporter'

let miniWindow: BrowserWindow | null = null
let spotlightWindow: BrowserWindow | null = null

export function openMiniWindow(isDev: boolean): BrowserWindow {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show()
    miniWindow.focus()
    return miniWindow
  }

  miniWindow = new BrowserWindow({
    width: 320,
    height: 120,
    minWidth: 260,
    minHeight: 80,
    maxWidth: 400,
    maxHeight: 180,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: true,
    webPreferences: {
      preload: resolvePreloadPath(__dirname),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    void miniWindow.loadURL('http://localhost:5173/mini.html')
  } else {
    void miniWindow.loadFile(resolveRendererHtmlPath(__dirname, 'mini.html'))
  }

  miniWindow.on('closed', () => {
    miniWindow = null
  })

  return miniWindow
}

export function getMiniWindow(): BrowserWindow | null {
  return miniWindow && !miniWindow.isDestroyed() ? miniWindow : null
}

function sendSpotlightPrefill(prefill?: string): void {
  if (!prefill || !spotlightWindow || spotlightWindow.isDestroyed()) return
  spotlightWindow.webContents.send('spotlight:prefill', { prefill })
}

export function openSpotlightWindow(isDev: boolean, prefill?: string): BrowserWindow {
  if (spotlightWindow && !spotlightWindow.isDestroyed()) {
    spotlightWindow.show()
    spotlightWindow.focus()
    sendSpotlightPrefill(prefill)
    return spotlightWindow
  }

  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const width = 520
  const height = 480
  const x = Math.round(
    Math.min(
      Math.max(display.workArea.x + 24, cursor.x - Math.floor(width / 2)),
      display.workArea.x + display.workArea.width - width - 24,
    ),
  )
  const y = Math.round(
    Math.min(
      Math.max(display.workArea.y + 48, cursor.y - 60),
      display.workArea.y + display.workArea.height - height - 24,
    ),
  )

  spotlightWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    show: true,
    backgroundColor: '#07070b',
    webPreferences: {
      preload: resolvePreloadPath(__dirname),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    void spotlightWindow.loadURL('http://localhost:5173/spotlight.html')
  } else {
    void spotlightWindow.loadFile(resolveRendererHtmlPath(__dirname, 'spotlight.html'))
  }

  spotlightWindow.webContents.on('did-finish-load', () => {
    sendSpotlightPrefill(prefill)
    spotlightWindow?.focus()
  })

  spotlightWindow.on('closed', () => {
    spotlightWindow = null
  })

  return spotlightWindow
}

export function getSpotlightWindow(): BrowserWindow | null {
  return spotlightWindow && !spotlightWindow.isDestroyed() ? spotlightWindow : null
}

function getPrimaryShellWindow(): BrowserWindow | undefined {
  const mini = getMiniWindow()
  const spotlight = getSpotlightWindow()
  return BrowserWindow.getAllWindows().find(
    (win) => win !== mini && win !== spotlight && !win.isDestroyed(),
  )
}

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

let updaterStatus: UpdaterStatus = 'idle'
let updaterVersion: string | undefined
let updaterError: string | undefined

export function setUpdaterStatus(status: UpdaterStatus, version?: string, error?: string): void {
  updaterStatus = status
  updaterVersion = version
  updaterError = error
}

function dirSizeBytes(dirPath: string): number {
  let total = 0
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const full = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        total += dirSizeBytes(full)
      } else {
        try {
          total += statSync(full).size
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* dir unreadable */
  }
  return total
}

export function registerSystemHandlers(dataDir: string, bundle: DbBundle, isDev = false): void {
  registerHandler('system.getVersion', async (params) => {
    SystemGetVersionParamsSchema.parse(params)
    return {
      version: app.getVersion(),
      channel: (process.env['UPDATE_CHANNEL'] ?? 'stable') as 'stable' | 'beta',
    }
  })

  registerHandler('system.getUpdaterStatus', async (params) => {
    SystemGetUpdaterStatusParamsSchema.parse(params)
    const result: { status: UpdaterStatus; version?: string; error?: string } = {
      status: updaterStatus,
    }
    if (updaterVersion !== undefined) result.version = updaterVersion
    if (updaterError !== undefined) result.error = updaterError
    return result
  })

  registerHandler('system.triggerUpdateCheck', async (params) => {
    SystemTriggerUpdateCheckParamsSchema.parse(params)
    const { autoUpdater } = await import('electron-updater')
    setUpdaterStatus('checking')
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      setUpdaterStatus('error', undefined, msg)
    })
    return { triggered: true }
  })

  registerHandler('system.installUpdate', async (params) => {
    SystemInstallUpdateParamsSchema.parse(params)
    installUpdate()
    return { restarting: true }
  })

  registerHandler('system.getDataDir', async (params) => {
    SystemGetDataDirParamsSchema.parse(params)
    const sizeBytes = dirSizeBytes(dataDir)
    return { path: dataDir, sizeBytes }
  })

  registerHandler('system.getDefaultFolders', async (params) => {
    SystemGetDefaultFoldersParamsSchema.parse(params)
    return {
      homeDir: app.getPath('home'),
      folders: [
        { name: 'Downloads', path: app.getPath('downloads') },
        { name: 'Documents', path: app.getPath('documents') },
        { name: 'Desktop', path: app.getPath('desktop') },
      ],
    }
  })

  registerHandler('system.openDataDir', async (params) => {
    SystemOpenDataDirParamsSchema.parse(params)
    const { shell } = await import('electron')
    await shell.openPath(dataDir)
    return { opened: true }
  })

  registerHandler('system.pickFolder', async (params) => {
    const { title, defaultPath } = SystemPickFolderParamsSchema.parse(params)
    const parentWindow = BrowserWindow.getAllWindows()[0]
    const dialogOptions = {
      title: title ?? 'Select a folder',
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
      ...(defaultPath !== undefined ? { defaultPath } : {}),
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    return {
      canceled: result.canceled,
      ...(result.filePaths[0] ? { path: result.filePaths[0] } : {}),
    }
  })

  registerHandler('system.exportData', async (params) => {
    const { destPath } = SystemExportDataParamsSchema.parse(params)
    const { copyFileSync, mkdirSync, readdirSync, statSync: fsStat } = await import('fs')
    const { join: pathJoin, dirname } = await import('path')

    // Copy the database file and crash log into a timestamped folder
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const exportDir = pathJoin(destPath, `auralith-export-${ts}`)
    mkdirSync(exportDir, { recursive: true })

    // Copy all files in dataDir (non-recursive — auralith.db, auralith.db-wal, auralith.db-shm)
    try {
      for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
        if (entry.isFile()) {
          copyFileSync(pathJoin(dataDir, entry.name), pathJoin(exportDir, entry.name))
        }
      }
    } catch (err) {
      throw Object.assign(
        new Error(`Export failed: ${err instanceof Error ? err.message : String(err)}`),
        { code: 'EXPORT_FAILED' },
      )
    }

    // Append crash log if present
    const crashLog = getCrashLogContent()
    if (crashLog) {
      const { writeFileSync } = await import('fs')
      writeFileSync(pathJoin(exportDir, 'crash.log'), crashLog, 'utf8')
    }

    // Write a manifest
    const { writeFileSync: write } = await import('fs')
    write(
      pathJoin(exportDir, 'manifest.json'),
      JSON.stringify(
        { exportedAt: new Date().toISOString(), appVersion: app.getVersion(), dataDir },
        null,
        2,
      ),
      'utf8',
    )

    void fsStat // suppress unused import
    void dirname

    return { exportedPath: exportDir }
  })

  registerHandler('system.deleteAllData', async (params) => {
    SystemDeleteAllDataParamsSchema.parse(params)
    const { rmSync, existsSync } = await import('fs')
    if (existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true, force: true })
    }
    // Restart the app so the DB is re-initialized cleanly on next launch
    app.relaunch()
    app.exit(0)
    return { deleted: true }
  })

  registerHandler('system.getCrashLog', async () => {
    return { content: getCrashLogContent() }
  })

  registerHandler('system.getCrashStats', async (params) => {
    SystemGetCrashStatsParamsSchema.parse(params)
    const repo = createCrashStatsRepo(bundle.db)
    const byModule = repo.getSummary().map((s) => ({
      module: s.module,
      crashCount: s.crashCount,
      errorCount: s.errorCount,
      lastTs: s.lastTs.getTime(),
    }))
    const totals = repo.getTotalCount()
    return {
      byModule,
      totalCrashes: totals.crashes,
      totalErrors: totals.errors,
      windowDays: 30 as const,
    }
  })

  registerHandler('system.clearCrashStats', async (params) => {
    SystemClearCrashStatsParamsSchema.parse(params)
    const repo = createCrashStatsRepo(bundle.db)
    repo.clear()
    return { cleared: true }
  })

  registerHandler('system.openMiniWindow', async (params) => {
    SystemOpenMiniWindowParamsSchema.parse(params)
    openMiniWindow(isDev)
    return { opened: true }
  })

  registerHandler('system.closeMiniWindow', async (params) => {
    SystemCloseMiniWindowParamsSchema.parse(params)
    const win = getMiniWindow()
    if (win) win.close()
    return { closed: true }
  })

  registerHandler('system.getMiniWindowState', async (params) => {
    SystemGetMiniWindowStateParamsSchema.parse(params)
    return { open: getMiniWindow() !== null }
  })

  registerHandler('system.openSpotlightWindow', async (params) => {
    const { prefill } = SystemOpenSpotlightWindowParamsSchema.parse(params)
    openSpotlightWindow(isDev, prefill)
    return { opened: true }
  })

  registerHandler('system.closeSpotlightWindow', async (params) => {
    SystemCloseSpotlightWindowParamsSchema.parse(params)
    const win = getSpotlightWindow()
    if (win) win.close()
    return { closed: true }
  })

  registerHandler('system.getSpotlightWindowState', async (params) => {
    SystemGetSpotlightWindowStateParamsSchema.parse(params)
    return { open: getSpotlightWindow() !== null }
  })

  registerHandler('system.dispatchShellAction', async (params) => {
    const { id, payload } = SystemDispatchShellActionParamsSchema.parse(params)
    const mainWindow = getPrimaryShellWindow()
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send('global-shortcut', {
      id,
      ...(payload !== undefined && typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : payload !== undefined
          ? { payload }
          : {}),
    })
    return { dispatched: true }
  })

  registerHandler('window.minimize', async () => {
    BrowserWindow.getAllWindows()[0]?.minimize()
    return {}
  })

  registerHandler('window.maximize', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
    return {}
  })

  registerHandler('window.close', async () => {
    BrowserWindow.getAllWindows()[0]?.close()
    return {}
  })
}
