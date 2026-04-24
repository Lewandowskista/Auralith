import { describe, expect, it } from 'vitest'
import { join, normalize } from 'path'
import { resolvePreloadPath, resolveRendererHtmlPath } from './renderer-paths'

describe('resolveRendererHtmlPath', () => {
  it('resolves secondary renderer HTML next to dist/main', () => {
    const mainDir = join('C:', 'apps', 'auralith', 'dist', 'main')

    expect(normalize(resolveRendererHtmlPath(mainDir, 'spotlight.html'))).toBe(
      normalize(join('C:', 'apps', 'auralith', 'dist', 'renderer', 'spotlight.html')),
    )
    expect(normalize(resolveRendererHtmlPath(mainDir, 'mini.html'))).toBe(
      normalize(join('C:', 'apps', 'auralith', 'dist', 'renderer', 'mini.html')),
    )
  })

  it('resolves the shared preload script next to dist/main', () => {
    const mainDir = join('C:', 'apps', 'auralith', 'dist', 'main')

    expect(normalize(resolvePreloadPath(mainDir))).toBe(
      normalize(join('C:', 'apps', 'auralith', 'dist', 'preload', 'index.js')),
    )
  })
})
