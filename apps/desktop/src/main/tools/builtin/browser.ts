/**
 * Browser tools using Chrome DevTools Protocol (CDP).
 *
 * Chrome must be running with --remote-debugging-port=9222.
 * The cdp-client auto-detects whether Chrome is already open and attaches to it.
 * First-time setup: use pccontrol.getStatus + "Launch Chrome with CDP" button in Settings.
 */
import { z } from 'zod'
import { registerTool } from '@auralith/core-tools'
import type { WebSocket } from 'ws'
import { BrowserWindow } from 'electron'
import * as http from 'http'
import { execSync, spawn } from 'child_process'

// ---------------------------------------------------------------------------
// CDP client
// ---------------------------------------------------------------------------

const CDP_PORT = 9222
const CDP_HOST = 'localhost'

type CdpTarget = {
  id: string
  title: string
  url: string
  type: string
  webSocketDebuggerUrl: string
}

type CdpMessage = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string }
}

class CdpSession {
  private ws: WebSocket | null = null
  private msgId = 1
  private pendingCalls = new Map<
    number,
    { resolve: (r: unknown) => void; reject: (e: Error) => void }
  >()
  private connected = false

  async connect(wsUrl: string): Promise<void> {
    const WsModule = await loadWs()
    const WS = WsModule as unknown as WsConstructor
    this.ws = new WS(wsUrl)
    await new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'))
        return
      }
      this.ws.on('open', () => {
        this.connected = true
        resolve()
      })
      this.ws.on('error', reject)
      setTimeout(() => reject(new Error('CDP WS connect timeout')), 5000)
    })
    this.ws.on('message', (raw: Buffer | string) => {
      try {
        const msg: CdpMessage = JSON.parse(raw.toString())
        if (msg.id !== undefined) {
          const pending = this.pendingCalls.get(msg.id)
          if (pending) {
            this.pendingCalls.delete(msg.id)
            if (msg.error) pending.reject(new Error(msg.error.message))
            else pending.resolve(msg.result)
          }
        }
      } catch {
        // non-JSON or event — ignore
      }
    })
    this.ws.on('close', () => {
      this.connected = false
      for (const pending of this.pendingCalls.values()) {
        pending.reject(new Error('CDP session closed'))
      }
      this.pendingCalls.clear()
    })
  }

  isConnected(): boolean {
    return this.connected
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) {
        reject(new Error('CDP session not connected'))
        return
      }
      const id = this.msgId++
      this.pendingCalls.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pendingCalls.has(id)) {
          this.pendingCalls.delete(id)
          reject(new Error(`CDP call timed out: ${method}`))
        }
      }, 15_000)
    })
  }

  close(): void {
    this.ws?.close()
    this.ws = null
    this.connected = false
  }
}

// Lazy ws import — ws is a Node dep already pulled by electron
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadWs(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ws = (await import(/* @vite-ignore */ 'ws')) as any
  return ws
}

type WsConstructor = new (url: string) => WebSocket

let _session: CdpSession | null = null

async function getCdpTargets(): Promise<CdpTarget[]> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: CDP_HOST, port: CDP_PORT, path: '/json', timeout: 3000 },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as CdpTarget[])
          } catch {
            reject(new Error('Invalid CDP /json response'))
          }
        })
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('CDP /json timeout'))
    })
  })
}

export async function getCdpStatus(): Promise<{
  connected: boolean
  tabCount: number
  tabs: Array<{ id: string; title: string; url: string }>
}> {
  try {
    const targets = await getCdpTargets()
    const tabs = targets
      .filter((t) => t.type === 'page')
      .map((t) => ({ id: t.id, title: t.title, url: t.url }))
    return { connected: true, tabCount: tabs.length, tabs }
  } catch {
    return { connected: false, tabCount: 0, tabs: [] }
  }
}

export function launchChromeWithCdp(): void {
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ]
  let chromePath = ''
  for (const p of chromePaths) {
    try {
      execSync(`if exist "${p}" echo found`, { shell: 'cmd.exe' })
      chromePath = p
      break
    } catch {
      /* try next */
    }
  }
  if (!chromePath) {
    // Fallback: let Windows find it
    chromePath = 'chrome'
  }
  const proc = spawn(chromePath, [`--remote-debugging-port=${CDP_PORT}`], {
    detached: true,
    stdio: 'ignore',
    shell: chromePath === 'chrome',
  })
  proc.unref()
}

async function getSession(): Promise<CdpSession> {
  if (_session?.isConnected()) return _session

  _session?.close()
  _session = null

  let targets: CdpTarget[]
  try {
    targets = await getCdpTargets()
  } catch {
    throw new Error(
      `Chrome is not running with CDP enabled (port ${CDP_PORT}). ` +
        'Open Settings → PC Control and click "Launch Chrome with CDP".',
    )
  }

  // Prefer the active (focused) tab, fall back to first page
  const pages = targets.filter((t) => t.type === 'page')
  if (pages.length === 0) {
    // Activate a new tab
    await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/new`).then(
      () => new Promise<void>((r) => setTimeout(r, 500)),
    )
    const fresh = await getCdpTargets()
    pages.push(...fresh.filter((t) => t.type === 'page'))
  }

  const target = pages[0]
  if (!target.webSocketDebuggerUrl) {
    throw new Error('CDP target has no WebSocket URL — Chrome may need restart')
  }

  const session = new CdpSession()
  await session.connect(target.webSocketDebuggerUrl)
  _session = session
  return session
}

async function activateTarget(targetId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = http.get(
      { hostname: CDP_HOST, port: CDP_PORT, path: `/json/activate/${targetId}`, timeout: 3000 },
      (res) => {
        res.resume()
        res.on('end', resolve)
      },
    )
    req.on('error', reject)
  })
}

function broadcastAction(action: string, detail: object): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('browser:action', { action, detail })
  }
}

// ---------------------------------------------------------------------------
// Tool registrations
// ---------------------------------------------------------------------------

export function registerBrowserTools(): void {
  // Keep old browser.open as alias for navigate
  registerTool({
    id: 'browser.open',
    tier: 'confirm',
    paramsSchema: z.object({
      url: z.string().describe('URL to navigate to'),
      newTab: z.boolean().optional().describe('Open in a new tab (default: false)'),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      title: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel: 'Navigate Chrome to a URL using CDP. Alias for browser.navigate.',
    execute: async (params) => {
      try {
        const session = await getSession()
        if (params.newTab) {
          await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/new?${encodeURIComponent(params.url)}`)
          return { ok: true }
        }
        await session.send('Page.navigate', { url: params.url })
        await session.send('Page.loadEventFired', {})
        const result = (await session.send('Runtime.evaluate', {
          expression: 'document.title',
          returnByValue: true,
        })) as { result: { value: string } }
        const title = result?.result?.value ?? ''
        broadcastAction('navigate', { url: params.url, title })
        return { ok: true, title }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'navigation failed' }
      }
    },
  })

  registerTool({
    id: 'browser.navigate',
    tier: 'confirm',
    paramsSchema: z.object({
      url: z.string().describe('Full URL to navigate to'),
      newTab: z.boolean().optional().describe('Open in a new tab'),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      title: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel: 'Navigate the active Chrome tab to a URL via CDP.',
    execute: async (params) => {
      try {
        const session = await getSession()
        if (params.newTab) {
          await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/new?${encodeURIComponent(params.url)}`)
          return { ok: true }
        }
        await session.send('Page.navigate', { url: params.url })
        await new Promise<void>((r) => setTimeout(r, 1500))
        const result = (await session.send('Runtime.evaluate', {
          expression: 'document.title',
          returnByValue: true,
        })) as { result: { value: string } }
        const title = result?.result?.value ?? ''
        broadcastAction('navigate', { url: params.url, title })
        return { ok: true, title }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'navigation failed' }
      }
    },
  })

  registerTool({
    id: 'browser.search',
    tier: 'confirm',
    paramsSchema: z.object({
      query: z.string().describe('Search query text'),
      engine: z
        .enum(['google', 'youtube', 'bing'])
        .optional()
        .describe('Search engine (default: google)'),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      url: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel: 'Open Chrome and perform a web search on Google, YouTube, or Bing via CDP.',
    execute: async (params) => {
      const engine = params.engine ?? 'google'
      const q = encodeURIComponent(params.query)
      const urls: Record<string, string> = {
        google: `https://www.google.com/search?q=${q}`,
        youtube: `https://www.youtube.com/results?search_query=${q}`,
        bing: `https://www.bing.com/search?q=${q}`,
      }
      const url = urls[engine]
      try {
        const session = await getSession()
        await session.send('Page.navigate', { url })
        await new Promise<void>((r) => setTimeout(r, 1500))
        broadcastAction('search', { query: params.query, engine, url })
        return { ok: true, url }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'search failed' }
      }
    },
  })

  registerTool({
    id: 'browser.click',
    tier: 'confirm',
    paramsSchema: z.object({
      selector: z.string().optional().describe('CSS selector of element to click'),
      text: z
        .string()
        .optional()
        .describe('Visible text of element to click (alternative to selector)'),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    describeForModel:
      'Click an element on the current Chrome page by CSS selector or visible text via CDP.',
    execute: async (params) => {
      try {
        const session = await getSession()
        let jsExpr: string
        if (params.selector) {
          jsExpr = `
            (function() {
              const el = document.querySelector(${JSON.stringify(params.selector)});
              if (!el) return 'not_found';
              el.scrollIntoView({ block: 'center' });
              el.click();
              return 'ok';
            })()
          `
        } else if (params.text) {
          jsExpr = `
            (function() {
              const text = ${JSON.stringify(params.text)}.toLowerCase();
              const all = document.querySelectorAll('a,button,input[type="submit"],[role="button"],[role="link"]');
              for (const el of all) {
                if (el.textContent?.toLowerCase().includes(text)) {
                  el.scrollIntoView({ block: 'center' });
                  el.click();
                  return 'ok';
                }
              }
              return 'not_found';
            })()
          `
        } else {
          return { ok: false, error: 'Must provide selector or text' }
        }
        const result = (await session.send('Runtime.evaluate', {
          expression: jsExpr,
          returnByValue: true,
        })) as { result: { value: string } }
        if (result?.result?.value === 'not_found') return { ok: false, error: 'Element not found' }
        broadcastAction('click', { selector: params.selector, text: params.text })
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
      text: z.string().describe('Text to type'),
      selector: z.string().optional().describe('CSS selector to focus first (optional)'),
      submit: z.boolean().optional().describe('Press Enter after typing'),
      clearFirst: z.boolean().optional().describe('Clear the field before typing'),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    describeForModel:
      'Type text into the focused element (or a specified selector) on the current Chrome page via CDP.',
    execute: async (params) => {
      try {
        const session = await getSession()
        if (params.selector) {
          await session.send('Runtime.evaluate', {
            expression: `document.querySelector(${JSON.stringify(params.selector)})?.focus()`,
          })
          if (params.clearFirst) {
            await session.send('Runtime.evaluate', {
              expression: `
                const el = document.querySelector(${JSON.stringify(params.selector)});
                if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
              `,
            })
          }
        }
        // Use Input.insertText for reliable Unicode typing
        await session.send('Input.insertText', { text: params.text })
        if (params.submit) {
          await session.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Return',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
          })
          await session.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Return',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
          })
        }
        broadcastAction('type', { length: params.text.length, submit: params.submit })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'type failed' }
      }
    },
  })

  registerTool({
    id: 'browser.playVideo',
    tier: 'confirm',
    paramsSchema: z.object({
      query: z.string().describe('Video search query or direct YouTube URL'),
      site: z
        .enum(['youtube', 'url'])
        .optional()
        .describe('"youtube" to search YouTube (default), "url" to navigate directly'),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      url: z.string().optional(),
      title: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel:
      'Search YouTube for a video and auto-play the first result, or navigate to a direct video URL.',
    execute: async (params) => {
      try {
        const session = await getSession()
        const site = params.site ?? 'youtube'

        if (site === 'url') {
          await session.send('Page.navigate', { url: params.query })
          await new Promise<void>((r) => setTimeout(r, 2000))
          await session.send('Runtime.evaluate', {
            expression: 'document.querySelector("video")?.play()',
          })
          return { ok: true, url: params.query }
        }

        // Search YouTube
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(params.query)}`
        await session.send('Page.navigate', { url: searchUrl })
        await new Promise<void>((r) => setTimeout(r, 2000))

        // Click first video result
        const clickResult = (await session.send('Runtime.evaluate', {
          expression: `
            (function() {
              const link = document.querySelector('ytd-video-renderer a#video-title, a#video-title');
              if (!link) return null;
              const href = link.href;
              link.click();
              return href;
            })()
          `,
          returnByValue: true,
        })) as { result: { value: string | null } }

        const videoUrl = clickResult?.result?.value
        await new Promise<void>((r) => setTimeout(r, 2500))

        // Get title from page
        const titleResult = (await session.send('Runtime.evaluate', {
          expression: 'document.title',
          returnByValue: true,
        })) as { result: { value: string } }

        broadcastAction('playVideo', { query: params.query, url: videoUrl })
        return { ok: true, url: videoUrl ?? searchUrl, title: titleResult?.result?.value ?? '' }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'playVideo failed' }
      }
    },
  })

  registerTool({
    id: 'browser.screenshot',
    tier: 'safe',
    paramsSchema: z.object({
      fullPage: z
        .boolean()
        .optional()
        .describe('Capture the full scrollable page (default: false)'),
    }),
    resultSchema: z.object({
      ok: z.boolean(),
      base64: z.string().optional(),
      error: z.string().optional(),
    }),
    describeForModel: 'Take a screenshot of the current Chrome tab via CDP. Returns base64 PNG.',
    execute: async (params) => {
      try {
        const session = await getSession()
        const result = (await session.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: params.fullPage ?? false,
        })) as { data: string }
        broadcastAction('screenshot', {})
        return { ok: true, base64: result.data }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'screenshot failed' }
      }
    },
  })

  registerTool({
    id: 'browser.extract',
    tier: 'safe',
    paramsSchema: z.object({
      selector: z
        .string()
        .optional()
        .describe('CSS selector to extract text from (optional — full page if omitted)'),
    }),
    resultSchema: z.object({ ok: z.boolean(), text: z.string(), error: z.string().optional() }),
    describeForModel:
      'Extract visible text from the current Chrome page (or a specific element) via CDP.',
    execute: async (params) => {
      try {
        const session = await getSession()
        const expr = params.selector
          ? `document.querySelector(${JSON.stringify(params.selector)})?.innerText ?? ''`
          : `document.body.innerText`
        const result = (await session.send('Runtime.evaluate', {
          expression: expr,
          returnByValue: true,
        })) as { result: { value: string } }
        return { ok: true, text: (result?.result?.value ?? '').slice(0, 50_000) }
      } catch (err) {
        return { ok: false, text: '', error: err instanceof Error ? err.message : 'extract failed' }
      }
    },
  })

  registerTool({
    id: 'browser.close',
    tier: 'confirm',
    paramsSchema: z.object({
      tabIndex: z
        .number()
        .optional()
        .describe('Close a specific tab by index (0-based). Omit to close active tab.'),
    }),
    resultSchema: z.object({ ok: z.boolean(), error: z.string().optional() }),
    describeForModel: 'Close the current or a specific Chrome tab via CDP.',
    execute: async (params) => {
      try {
        const targets = await getCdpTargets()
        const pages = targets.filter((t) => t.type === 'page')
        const target = pages[params.tabIndex ?? 0]
        if (!target) return { ok: false, error: 'Tab not found' }
        await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/close/${target.id}`)
        _session?.close()
        _session = null
        broadcastAction('closeTab', { targetId: target.id })
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'close failed' }
      }
    },
  })

  registerTool({
    id: 'browser.tabs',
    tier: 'safe',
    paramsSchema: z.object({}),
    resultSchema: z.object({
      tabs: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })),
    }),
    describeForModel: 'List all open Chrome tabs via CDP.',
    execute: async () => {
      const status = await getCdpStatus()
      return { tabs: status.tabs }
    },
  })

  registerTool({
    id: 'browser.activate',
    tier: 'confirm',
    paramsSchema: z.object({
      tabId: z.string().describe('CDP target ID of the tab to activate'),
    }),
    resultSchema: z.object({ ok: z.boolean() }),
    describeForModel: 'Switch the active Chrome tab by CDP target ID.',
    execute: async (params) => {
      try {
        await activateTarget(params.tabId)
        _session?.close()
        _session = null
        return { ok: true }
      } catch {
        return { ok: false }
      }
    },
  })
}
