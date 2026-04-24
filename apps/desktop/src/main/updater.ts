import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { setUpdaterStatus } from './ipc/handlers/system.handler'

export function setupUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    setUpdaterStatus('checking')
  })

  autoUpdater.on('update-available', (info) => {
    setUpdaterStatus('available', info.version)
    BrowserWindow.getAllWindows()[0]?.webContents.send('updater:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    })
  })

  autoUpdater.on('update-not-available', () => {
    setUpdaterStatus('idle')
  })

  autoUpdater.on('download-progress', () => {
    setUpdaterStatus('downloading')
  })

  autoUpdater.on('update-downloaded', (info) => {
    setUpdaterStatus('ready', info.version)
    BrowserWindow.getAllWindows()[0]?.webContents.send('updater:update-downloaded', {
      version: info.version,
    })
  })

  autoUpdater.on('error', (err) => {
    setUpdaterStatus('error', undefined, err.message)
    console.error('[Updater]', err.message)
  })

  // Check for updates 10s after launch (only in production)
  if (process.env['NODE_ENV'] !== 'development') {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err: unknown) => {
        console.error('[Updater] check failed:', err)
      })
    }, 10_000)
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}
