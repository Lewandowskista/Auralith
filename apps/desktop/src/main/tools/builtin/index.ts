import type { DbBundle, EventsRepo } from '@auralith/core-db'
import type { OllamaClient } from '@auralith/core-ai'
import type Database from 'better-sqlite3'
import { registerFileTools } from './files'
import { registerNoteTools } from './notes'
import { registerBrainTools } from './brain'
import { registerNavigationTools } from './navigation'
import { registerWebTools } from './web'
import { registerEmailTools } from './email'
import { registerFilesystemTools } from './filesystem'
import { registerSystemExtTools } from './system-ext'
import { registerShellTools } from './shell'
import { registerActivityTools } from './activity'
import { registerScreenTools } from './screen'
import { registerBrowserTools } from './browser'
import { makeAwarenessToolDeps, registerAwarenessTools } from './awareness'
import { initSandboxRoots, getDefaultSandboxRoots } from '../sandbox'

export type BuiltinToolDeps = {
  bundle: DbBundle
  sqlite: Database.Database
  embedClient: OllamaClient
  embedModel: string
  getDownloadsPath: () => string
  getNotesDir: () => string
  eventsRepo: () => EventsRepo
  extraSandboxRoots?: string[]
}

export function registerBuiltinTools(deps: BuiltinToolDeps): void {
  // Init sandbox with default roots + any user-specified extras
  const defaultRoots = getDefaultSandboxRoots()
  initSandboxRoots([...defaultRoots, ...(deps.extraSandboxRoots ?? [])])

  registerFileTools(deps.getDownloadsPath)
  registerNoteTools(deps.getNotesDir, deps.eventsRepo)
  registerBrainTools(
    () => deps.bundle,
    () => deps.embedClient,
    deps.embedModel,
    () => deps.sqlite,
  )
  registerNavigationTools()
  registerWebTools()
  registerEmailTools()
  registerFilesystemTools()
  registerSystemExtTools()
  registerShellTools()
  registerActivityTools(deps.eventsRepo)
  registerScreenTools()
  registerBrowserTools()
  registerAwarenessTools(makeAwarenessToolDeps(deps.bundle))
}
