import { join } from 'path'

export function resolveRendererHtmlPath(mainDirname: string, fileName: string): string {
  return join(mainDirname, '../renderer', fileName)
}

export function resolvePreloadPath(mainDirname: string): string {
  return join(mainDirname, '../preload/index.js')
}
