import type { Page } from '@playwright/test'
import type { AxeResults } from 'axe-core'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

const require = createRequire(__filename)
const axeUrl = pathToFileURL(require.resolve('axe-core/axe.min.js')).href

declare global {
  interface Window {
    axe?: {
      run: (
        context: Document,
        options: { runOnly: { type: 'tag'; values: string[] } },
      ) => Promise<AxeResults>
    }
  }
}

export async function analyzeA11y(page: Page): Promise<AxeResults> {
  const hasAxe = await page.evaluate(() => typeof window.axe !== 'undefined')
  if (!hasAxe) {
    await page.addScriptTag({ url: axeUrl })
  }

  return page.evaluate(async () => {
    const axe = window.axe
    if (!axe) throw new Error('axe-core did not load')
    return axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    })
  })
}
