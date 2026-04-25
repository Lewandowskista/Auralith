import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, session } from 'electron'
import { mkdirSync } from 'fs'
import { join, resolve } from 'path'
import Database from 'better-sqlite3'
import { z } from 'zod'
import {
  initDb,
  createEventsRepo,
  createSettingsRepo,
  createSuggestionsRepo,
  createCrashStatsRepo,
  createClipboardRepo,
  createAppUsageRepo,
  createCalendarEventsRepo,
  createAuditRepo,
} from '@auralith/core-db'
import { createNewsRepo, runFullPipeline } from '@auralith/core-news'
import {
  OllamaClient,
  OllamaStatusMonitor,
  initModelRouter,
  getModelRouter,
  initAiQueue,
} from '@auralith/core-ai'
import { registerAssistantSpeakTool } from '@auralith/core-tools'
import { SuggestionEngine } from '@auralith/core-suggest'
import { setupCrashReporter, setCrashStatRecorder } from './crash-reporter'
import { setupUpdater } from './updater'
import { setupIpcRouter } from './ipc/router'
import { registerSettingsHandlers } from './ipc/handlers/settings.handler'
import { openSpotlightWindow, registerSystemHandlers } from './ipc/handlers/system.handler'
import { registerPaletteHandlers } from './ipc/handlers/palette.handler'
import { registerBrainHandlers, initBrainDeps } from './ipc/handlers/brain.handler'
import {
  registerAssistantHandlers,
  initAssistantDeps,
  sendVoiceMessage,
} from './ipc/handlers/assistant.handler'
import { registerActivityHandlers, initActivityDeps } from './ipc/handlers/activity.handler'
import { registerNewsHandlers, initNewsDeps } from './ipc/handlers/news.handler'
import { registerWeatherHandlers, initWeatherDeps } from './ipc/handlers/weather.handler'
import {
  registerSuggestHandlers,
  initSuggestDeps,
  acceptSuggestionById,
} from './ipc/handlers/suggest.handler'
import { registerStubHandlers } from './ipc/handlers/stub.handler'
import { registerVoiceHandlers, initVoiceDeps } from './ipc/handlers/voice.handler'
import { registerToolsHandlers, initToolsDeps } from './ipc/handlers/tools.handler'
import {
  registerRoutinesHandlers,
  initRoutinesDeps,
  setupRoutineEngine,
} from './ipc/handlers/routines.handler'
import { registerOllamaHandlers } from './ipc/handlers/ollama.handler'
import { registerClipboardHandlers, initClipboardDeps } from './ipc/handlers/clipboard.handler'
import { registerAppUsageHandlers, initAppUsageDeps } from './ipc/handlers/app-usage.handler'
import { initBriefingDeps, setupBriefingScheduler } from './briefing/briefing-job'
import { registerBriefingHandlers } from './ipc/handlers/briefing.handler'
import {
  CalendarIcsImporter,
  IdleTracker,
  FocusAppTracker,
  AppSessionTracker,
  initLearningJob,
  setupLearningRecomputeScheduler,
} from './signals/index'
import { SuggestionBridge } from './signals/suggestion-bridge'
import { ClipboardWatcher } from './watcher/clipboard-watcher'
import { initSignalsDeps, registerSignalsHandlers } from './ipc/handlers/signals.handler'
import { VoiceOrchestrator } from './voice/voice-orchestrator'
import { registerBuiltinTools } from './tools/builtin/index'
import { registerClipperProtocol, initClipperProtocol } from './clipper/clipper-protocol'
import { registerIngestHandlers, initIngestDeps } from './ipc/handlers/ingest.handler'
import { WebhookServer } from './routines/webhook-server'
import { registerAgentHandlers, initAgentDeps } from './ipc/handlers/agent.handler'
import { registerGraphHandlers, initGraphDeps } from './ipc/handlers/graph.handler'
import { setupConfirmationChannel, makeExecutorDeps } from './tools/confirmation'
import { FileWatcher } from './watcher/file-watcher'
import { initAppContextBroker } from './ai/app-context-setup'
import { SessionJob } from './watcher/session-job'
import { RetentionJob } from './watcher/retention-job'

const userDataDirOverride = process.env['AURALITH_DATA_DIR']
if (userDataDirOverride?.trim()) {
  const userDataDir = resolve(userDataDirOverride)
  mkdirSync(userDataDir, { recursive: true })
  app.setPath('userData', userDataDir)
}

setupCrashReporter()
registerClipperProtocol()

const isE2E = process.env['AURALITH_E2E'] === '1'
const isDev = !isE2E && (process.env['NODE_ENV'] === 'development' || !app.isPackaged)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let trayInterval: ReturnType<typeof setInterval> | null = null

function createWindow(titlebarBg = '#07070B'): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: titlebarBg,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: !isE2E,
    },
    show: false,
  })

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray(getOpenSuggestions: () => Array<{ id: string; title: string }>): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  function rebuildMenu(): void {
    const suggestions = getOpenSuggestions()
    const count = suggestions.length
    const badgeLabel = count > 0 ? ` (${count} suggestion${count !== 1 ? 's' : ''})` : ''

    const contextMenu = Menu.buildFromTemplate([
      { label: `Open Auralith${badgeLabel}`, click: () => mainWindow?.show() },
      {
        label: 'Ask assistant...',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
          mainWindow?.webContents.send('global-shortcut', { id: 'assistant.focus' })
        },
      },
      {
        label: 'Open spotlight...',
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
            mainWindow.webContents.send('global-shortcut', { id: 'spotlight.open' })
          } else {
            openSpotlightWindow(isDev)
          }
        },
      },
      {
        label: 'Notification center',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
          mainWindow?.webContents.send('global-shortcut', { id: 'notifications.open' })
        },
      },
      {
        label: "Today's activity",
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
          mainWindow?.webContents.send('global-shortcut', { id: 'nav.activity' })
        },
      },
      ...(suggestions.length > 0
        ? [
            { type: 'separator' as const },
            {
              label: 'Open suggestions',
              submenu: suggestions.slice(0, 5).map((suggestion) => ({
                label: suggestion.title,
                click: () => {
                  mainWindow?.show()
                  mainWindow?.focus()
                  void acceptSuggestionById(suggestion.id).finally(() => rebuildMenu())
                },
              })),
            },
          ]
        : []),
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])

    tray?.setContextMenu(contextMenu)
    tray?.setToolTip(
      count > 0 ? `Auralith - ${count} suggestion${count !== 1 ? 's' : ''} pending` : 'Auralith',
    )
  }

  rebuildMenu()
  trayInterval = setInterval(rebuildMenu, 60_000)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow?.show()
    }
  })
}

function registerGlobalShortcuts(): void {
  globalShortcut.register('CommandOrControl+K', () => {
    mainWindow?.webContents.send('global-shortcut', { id: 'palette.open' })
  })
  globalShortcut.register('CommandOrControl+/', () => {
    mainWindow?.webContents.send('global-shortcut', { id: 'shortcuts.open' })
  })
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    mainWindow?.webContents.send('global-shortcut', { id: 'capture.open' })
  })
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('global-shortcut', { id: 'spotlight.open' })
    } else {
      openSpotlightWindow(isDev)
    }
  })
}

app.whenReady().then(() => {
  const dataDir = join(app.getPath('userData'), 'data')
  const bundle = initDb({ dataDir })

  const crashStatsRepo = createCrashStatsRepo(bundle.db)
  setCrashStatRecorder((level, module, message) => crashStatsRepo.record(level, module, message))
  crashStatsRepo.purgeStale()

  const sqlite = new Database(join(dataDir, 'auralith.db'))

  const settings = createSettingsRepo(bundle.db)
  const eventsRepo = createEventsRepo(bundle.db)
  if (isE2E) {
    settings.set('onboarding.complete', true)
  }

  const baseUrl = settings.get('ollama.url', z.string()) ?? 'http://localhost:11434'

  const ollamaClient = new OllamaClient({ baseUrl })

  // Model roles are hardcoded — no per-role overrides from settings.
  // Role → model assignments live in packages/core-ai/src/router.ts (balanced preset).
  initModelRouter(ollamaClient)

  // Single shared AI queue — one foreground + one background slot.
  // Background slots pause while the user is actively chatting (foreground).
  // Conservative for 8 GB VRAM: only one large model active at a time.
  const aiQueue = initAiQueue({ foregroundConcurrency: 1, backgroundConcurrency: 1 })

  const statusMonitor = new OllamaStatusMonitor(ollamaClient)
  statusMonitor.start(30_000)

  statusMonitor.subscribe((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('ollama:status', { status })
    }
  })

  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('ollama:status', { status: statusMonitor.getStatus() })
    })
  })

  const savedResolvedTheme = settings.get('appearance.resolvedTheme', z.enum(['dark', 'light']))
  const titlebarBg = savedResolvedTheme === 'light' ? '#f4f4f8' : '#07070B'

  const watchedFolders = settings.get('activity.watchedFolders', z.array(z.string())) ?? []

  const fileWatcher = new FileWatcher({ eventsRepo })
  if (watchedFolders.length > 0) {
    fileWatcher.start(watchedFolders)
  }

  const sessionJob = new SessionJob(eventsRepo)
  sessionJob.start()

  const retentionJob = new RetentionJob(eventsRepo, settings, sqlite)
  retentionJob.start()

  const auditRepo = createAuditRepo(bundle.db)
  const executorDeps = makeExecutorDeps(auditRepo)

  // All feature deps read resolved model names from the router — the single
  // source of truth for which model serves each role.
  const router = getModelRouter()
  const resolvedChatModel = router.modelFor('chat')
  const resolvedAgentModel = router.modelFor('agent')
  const resolvedEmbedModel = router.modelFor('embed')
  const resolvedClassifierModel = router.modelFor('classifier')
  const resolvedSummarizeModel = router.modelFor('summarize')
  const resolvedExtractModel = router.modelFor('extract')

  initBrainDeps({ bundle, sqlite, embedClient: ollamaClient, embedModel: resolvedEmbedModel })
  initAssistantDeps({
    bundle,
    sqlite,
    chatClient: ollamaClient,
    chatModel: resolvedChatModel,
    embedClient: ollamaClient,
    embedModel: resolvedEmbedModel,
    executorDeps,
  })
  // Initialize the app-aware context broker — injects weather, news, activity, etc. into prompts
  initAppContextBroker({
    bundle,
    sqlite,
    embedClient: ollamaClient,
    embedModel: resolvedEmbedModel,
  })
  initActivityDeps({ bundle, watcher: fileWatcher })
  initNewsDeps({
    bundle,
    ollamaClient,
    classifierModel: resolvedClassifierModel,
    summarizeModel: resolvedSummarizeModel,
    extractModel: resolvedExtractModel,
  })
  initWeatherDeps(bundle)
  initBriefingDeps({
    bundle,
    ollamaClient,
    classifierModel: resolvedClassifierModel,
    summarizeModel: resolvedSummarizeModel,
  })
  initSuggestDeps(bundle)

  const voiceOrchestrator = new VoiceOrchestrator({
    settingsRepo: settings,
    sqlite,
    sendToAssistant: async (text) => {
      const win = BrowserWindow.getAllWindows()[0] ?? null
      return sendVoiceMessage(text, win)
    },
    broadcast: (channel, data) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.webContents.send(channel, data)
    },
  })

  registerAssistantSpeakTool((text, voiceId, rate) => voiceOrchestrator.speak(text, voiceId, rate))

  const notesDir =
    settings.get('notes.directory', z.string()) ?? join(app.getPath('documents'), 'Auralith Notes')
  const extraSandboxRoots = settings.get('tools.extraSandboxRoots', z.array(z.string())) ?? []
  registerBuiltinTools({
    bundle,
    sqlite,
    embedClient: ollamaClient,
    embedModel: resolvedEmbedModel,
    getDownloadsPath: () => app.getPath('downloads'),
    getNotesDir: () => notesDir,
    eventsRepo: () => createEventsRepo(bundle.db),
    extraSandboxRoots,
  })

  initClipperProtocol({ bundle, sqlite, embedClient: ollamaClient, embedModel: resolvedEmbedModel })

  const voiceEnabled = settings.get('voice.enabled', z.boolean()) ?? false
  if (voiceEnabled) {
    void voiceOrchestrator.setEnabled(true)
  }

  initVoiceDeps({
    getStatus: () => voiceOrchestrator.getStatus(),
    getSettings: () => voiceOrchestrator.getSettings(),
    startCapture: () => voiceOrchestrator.startCapture(),
    stopCapture: (sessionId) => voiceOrchestrator.stopCapture(sessionId),
    pushAudioChunk: (sessionId, pcm16Base64) =>
      voiceOrchestrator.pushAudioChunk(sessionId, pcm16Base64),
    cancelCapture: (sessionId) => voiceOrchestrator.cancelCapture(sessionId),
    speak: (text, voiceId, rate) => voiceOrchestrator.speak(text, voiceId, rate),
    listTtsVoices: () => voiceOrchestrator.listTtsVoices(),
    listSttModels: () => voiceOrchestrator.listSttModels(),
    downloadSttModel: (modelId) => voiceOrchestrator.downloadSttModel(modelId),
    setEnabled: (enabled) => voiceOrchestrator.setEnabled(enabled),
    setPttBinding: async (binding) => ({
      conflict: voiceOrchestrator.setPttBinding(binding).conflict,
    }),
    setSettings: async (opts) => {
      voiceOrchestrator.setSettings(opts)
    },
  })

  initToolsDeps(bundle)
  initRoutinesDeps(bundle, sqlite)

  const calendarImporter = new CalendarIcsImporter(createCalendarEventsRepo(bundle.db))
  const idleTracker = new IdleTracker()
  const focusTracker = new FocusAppTracker()

  const savedCalendarPath = settings.get('signals.calendarPath', z.string())
  if (savedCalendarPath) {
    calendarImporter.setFilePath(savedCalendarPath)
    calendarImporter.importNow()
    calendarImporter.startPolling()
  }

  const focusAppEnabled = settings.get('signals.focusAppEnabled', z.boolean()) ?? false
  if (focusAppEnabled) {
    const focusAuditRepo = createAuditRepo(bundle.db)
    focusTracker.setEnabled(true, focusAuditRepo)
  }

  const clipboardRepo = createClipboardRepo(bundle.db)
  const clipboardWatcher = new ClipboardWatcher({
    repo: clipboardRepo,
    enabled: settings.get('activity.clipboardEnabled', z.boolean()) ?? false,
    redactSensitive: settings.get('activity.clipboardRedact', z.boolean()) ?? true,
    extraRedactPatterns:
      settings.get('activity.clipboardRedactPatterns', z.array(z.string())) ?? [],
  })

  const appUsageRepo = createAppUsageRepo(bundle.db)
  const appSessionTracker = new AppSessionTracker()
  const appUsageEnabled = settings.get('activity.appUsageEnabled', z.boolean()) ?? false
  if (appUsageEnabled) {
    appSessionTracker.setEnabled(true, appUsageRepo, eventsRepo)
  }

  initSignalsDeps({
    bundle,
    calendarImporter,
    focusTracker,
    getIdleMs: () => idleTracker.getIdleMs(),
  })
  initClipboardDeps({ clipboardRepo, clipboardWatcher, settings })
  initAppUsageDeps({ appUsageRepo, eventsRepo, appSessionTracker, settings })
  initLearningJob(bundle)

  registerSettingsHandlers(bundle)
  registerSystemHandlers(dataDir, bundle, isDev)
  registerPaletteHandlers()
  registerBrainHandlers()
  registerAssistantHandlers()
  registerActivityHandlers()
  registerNewsHandlers()
  registerWeatherHandlers()
  registerSuggestHandlers()
  registerSignalsHandlers()
  registerClipboardHandlers()
  registerAppUsageHandlers()
  registerVoiceHandlers()
  registerToolsHandlers()
  registerRoutinesHandlers()
  registerOllamaHandlers(bundle)
  initIngestDeps({ bundle, sqlite })
  registerIngestHandlers()
  initAgentDeps({
    bundle,
    sqlite,
    chatClient: ollamaClient,
    chatModel: resolvedAgentModel,
    executorDeps,
  })
  registerAgentHandlers()
  initGraphDeps({ bundle, sqlite })
  registerGraphHandlers()
  registerStubHandlers()
  registerBriefingHandlers()
  setupBriefingScheduler()

  // Background news refresh every 3 hours (quiet hours: before 6am or after 11pm).
  // Queued as a background task so it does not compete with foreground chat/agent calls.
  setInterval(
    () => {
      const hour = new Date().getHours()
      if (hour < 6 || hour >= 23) return
      void aiQueue
        .enqueueBackgroundAiTask(async () => {
          const newsRepo = createNewsRepo(bundle.db)
          await runFullPipeline({
            repo: newsRepo,
            ollamaClient,
            classifierModel: resolvedClassifierModel,
            summarizeModel: resolvedSummarizeModel,
            extractModel: resolvedExtractModel,
          })
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed())
              win.webContents.send('news:fetch-complete', { clustersUpdated: true })
          }
        })
        .catch((err: unknown) => console.error('[news] bg-refresh error:', err))
    },
    3 * 60 * 60 * 1000,
  )

  const suggestionEngine = new SuggestionEngine(bundle)
  const signalProviders = {
    getIdleMs: () => idleTracker.getIdleMs(),
    getNextCalendarEvent: (withinMs: number) => calendarImporter.getNextEvent(withinMs),
    ...(focusAppEnabled ? { getFocusAppBucket: () => focusTracker.getBucket() } : {}),
  }
  const newsRepo = createNewsRepo(bundle.db)
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
  suggestionEngine.setSignals({
    signalProviders,
    getSavedOldNewsItemCount: () => newsRepo.countSavedOlderThan(SEVEN_DAYS_MS),
  })
  suggestionEngine.start()

  const suggestionBridge = new SuggestionBridge({
    bundle,
    settingsRepo: settings,
    onOpenSuggestions: () => {
      mainWindow?.show()
      mainWindow?.focus()
      mainWindow?.webContents.send('global-shortcut', { id: 'nav.home' })
    },
  })
  suggestionBridge.start()

  setupLearningRecomputeScheduler(() => suggestionEngine.invalidateWeightsCache())
  setupConfirmationChannel()

  const routineEngine = setupRoutineEngine(bundle)
  void routineEngine.onStartup()

  const webhookServer = new WebhookServer({ engine: routineEngine })
  void webhookServer.start().catch(() => {
    /* webhook server start is non-fatal */
  })

  app.on('will-quit', () => {
    if (trayInterval) clearInterval(trayInterval)
    fileWatcher.stop()
    sessionJob.stop()
    retentionJob.stop()
    suggestionEngine.stop()
    suggestionBridge.stop()
    routineEngine.stop()
    webhookServer.stop()
    voiceOrchestrator.dispose()
    calendarImporter.stopPolling()
    focusTracker.dispose()
    clipboardWatcher.dispose()
    appSessionTracker.dispose()
  })

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })

  createWindow(titlebarBg)
  createTray(() => {
    try {
      return createSuggestionsRepo(bundle.db)
        .listOpen(10)
        .map((suggestion) => ({
          id: suggestion.id,
          title: suggestion.title,
        }))
    } catch {
      return []
    }
  })
  registerGlobalShortcuts()
  setupIpcRouter()
  setupUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On Windows, keep the app running in the tray.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
