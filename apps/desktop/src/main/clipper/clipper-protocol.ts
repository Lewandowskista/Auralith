import { protocol } from 'electron'
import { randomUUID } from 'crypto'
import type { DbBundle } from '@auralith/core-db'
import type { OllamaClient } from '@auralith/core-ai'
import type Database from 'better-sqlite3'
import { ingestClip, type ClipPayload } from './clip-ingestor'

export function registerClipperProtocol(): void {
  // Must be called before app.whenReady()
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'auralith',
      privileges: { secure: false, standard: false, supportFetchAPI: false },
    },
  ])
}

type ClipperDeps = {
  bundle: DbBundle
  sqlite: Database.Database
  embedClient: OllamaClient
  embedModel: string
}

let _deps: ClipperDeps | null = null

export function initClipperProtocol(deps: ClipperDeps): void {
  _deps = deps

  protocol.handle('auralith', (request) => {
    void handleClipRequest(request)
    return new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  })
}

async function handleClipRequest(request: Request): Promise<void> {
  if (!_deps) return

  let body: ClipPayload
  try {
    const url = new URL(request.url)
    if (url.pathname !== '/clip') return

    const raw = await request.text()
    body = JSON.parse(raw) as ClipPayload
    if (!body.url || typeof body.url !== 'string') return
  } catch {
    return
  }

  body.id = body.id ?? randomUUID()
  await ingestClip(body, _deps.bundle, _deps.sqlite, _deps.embedClient, _deps.embedModel)
}

/** Generate the auralith://clip endpoint URL the extension should POST to. */
export function getClipEndpointUrl(): string {
  return 'auralith://localhost/clip'
}
