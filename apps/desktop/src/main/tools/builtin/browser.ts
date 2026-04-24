import { z } from 'zod'
import { registerTool } from '@auralith/core-tools'
import { BrowserWindow } from 'electron'

// Playwright is loaded lazily — it's a large optional dependency.
// Fail gracefully if not installed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PwPage = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PwBrowser = any

type BrowserHandle = {
  browser: PwBrowser
  context: PwPage
  page: PwPage
}

let _handle: BrowserHandle | null = null
let _sessionId: string | null = null

async function getPage(): Promise<PwPage> {
  if (_handle) return _handle.page

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pw: any
  try {
    // Dynamic import via variable to avoid compile-time resolution of optional dep
    const mod = 'playwright'

    pw = await (import(/* @vite-ignore */ mod) as Promise<unknown>)
  } catch {
    throw new Error('Playwright is not installed. Run: pnpm add -w playwright-core')
  }

  const browser = await pw.chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()
  _handle = { browser, context, page }
  _sessionId = Math.random().toString(36).slice(2)

  // Notify renderer that a browser session is live
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('browser:session-start', { sessionId: _sessionId })
  }

  browser.on('disconnected', () => {
    _handle = null
    _sessionId = null
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('browser:session-end', {})
    }
  })

  return page
}

async function closeBrowser(): Promise<void> {
  if (_handle) {
    await _handle.browser.close()
    _handle = null
    _sessionId = null
  }
}

function broadcastAction(action: string, detail: object): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed())
      win.webContents.send('browser:action', { sessionId: _sessionId, action, detail })
  }
}

export function registerBrowserTools(): void {
  registerTool({
    id: 'browser.open',
    tier: 'confirm',
    paramsSchema: z.object({ url: z.string().url() }),
    resultSchema: z.object({
      ok: z.boolean(),
      title: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel:
      'Open a URL in the managed Chromium browser and navigate to it. Returns the page title.',
    execute: async (params) => {
      try {
        const page = await getPage()
        await page.goto(params.url, { timeout: 30_000, waitUntil: 'domcontentloaded' })
        const title = await page.title()
        broadcastAction('open', { url: params.url, title })
        return { ok: true, title }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'navigation failed' }
      }
    },
  })

  registerTool({
    id: 'browser.click',
    tier: 'confirm',
    paramsSchema: z.object({
      selector: z.string(),
      timeout: z.number().int().min(500).max(30_000).default(10_000),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    describeForModel: 'Click an element matching a CSS/text selector on the current browser page.',
    execute: async (params) => {
      try {
        const page = await getPage()
        await page.click(params.selector, { timeout: params.timeout })
        broadcastAction('click', { selector: params.selector })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'click failed' }
      }
    },
  })

  registerTool({
    id: 'browser.type',
    tier: 'confirm',
    paramsSchema: z.object({
      selector: z.string(),
      text: z.string(),
      clearFirst: z.boolean().default(false),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    describeForModel:
      'Type text into an input field matching a CSS/text selector on the current browser page.',
    execute: async (params) => {
      try {
        const page = await getPage()
        if (params.clearFirst) await page.fill(params.selector, '')
        await page.type(params.selector, params.text, { delay: 30 })
        broadcastAction('type', { selector: params.selector, length: params.text.length })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'type failed' }
      }
    },
  })

  registerTool({
    id: 'browser.extract',
    tier: 'confirm',
    paramsSchema: z.object({ selector: z.string().optional(), attribute: z.string().optional() }),
    resultSchema: z.object({ ok: z.boolean(), text: z.string(), error: z.string().optional() }),
    describeForModel:
      'Extract text (or an attribute value) from the current browser page. If selector is omitted, returns all visible text.',
    execute: async (params) => {
      try {
        const page = await getPage()
        let text: string
        if (params.selector) {
          text = params.attribute
            ? ((await page.getAttribute(params.selector, params.attribute)) ?? '')
            : ((await page.textContent(params.selector)) ?? '')
        } else {
          text = await page.evaluate(() => document.body.innerText)
        }
        return { ok: true, text: text.slice(0, 50_000) }
      } catch (err) {
        return { ok: false, text: '', error: err instanceof Error ? err.message : 'extract failed' }
      }
    },
  })

  registerTool({
    id: 'browser.screenshot',
    tier: 'confirm',
    paramsSchema: z.object({ selector: z.string().optional() }),
    resultSchema: z.object({
      ok: z.boolean(),
      base64: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel:
      'Take a screenshot of the current browser page (or a specific element). Returns base64 PNG.',
    execute: async (params) => {
      try {
        const page = await getPage()
        const buf = params.selector
          ? await page.locator(params.selector).screenshot()
          : await page.screenshot({ fullPage: false })
        broadcastAction('screenshot', {})
        return { ok: true, base64: buf.toString('base64') }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'screenshot failed' }
      }
    },
  })

  registerTool({
    id: 'browser.close',
    tier: 'confirm',
    paramsSchema: z.object({}),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Close the managed browser session.',
    execute: async () => {
      await closeBrowser()
      return { ok: true }
    },
  })
}
