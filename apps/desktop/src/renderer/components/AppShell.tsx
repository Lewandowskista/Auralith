import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import type { ReactElement, ComponentType } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster } from 'sonner'
import {
  Bell,
  BookOpen,
  Camera,
  CloudSun,
  Home,
  MessageSquare,
  Newspaper,
  Settings,
  Sparkles,
  Workflow,
  Activity as ActivityIcon,
} from 'lucide-react'
import { NavRail } from './NavRail'
import type { NavSection } from './NavRail'
import { CommandPalette, type PaletteItem } from './CommandPalette'
import { ConfirmActionSheet } from './ConfirmActionSheet'
import type { ConfirmActionRequest } from './ConfirmActionSheet'
import { ShortcutsDialog } from './ShortcutsDialog'
import { NotificationCenter } from './NotificationCenter'
import { HomeScreen } from '../screens/home/HomeScreen'
import { OnboardingFlow } from '../screens/onboarding/OnboardingFlow'
import { motionDuration, motionEasing, EtherBackdrop } from '@auralith/design-system'
import { useTheme } from '../context/ThemeContext'
import { ErrorBoundary } from './ErrorBoundary'
import { AuralithOrb } from './AuralithOrb'
import { VoiceCaptureBridge } from './VoiceCaptureBridge'
import { TitleBar } from './TitleBar'
import { toast } from 'sonner'
import { loadPromptPresets } from '../lib/prompt-presets'
import { SpotlightModal } from './SpotlightApp'

const AssistantScreen = lazy(() =>
  import('../screens/assistant/AssistantScreen').then((m) => ({ default: m.AssistantScreen })),
)
const ActivityScreen = lazy(() =>
  import('../screens/activity/ActivityScreen').then((m) => ({ default: m.ActivityScreen })),
)
const KnowledgeScreen = lazy(() =>
  import('../screens/knowledge/KnowledgeScreen').then((m) => ({ default: m.KnowledgeScreen })),
)
const NewsScreen = lazy(() =>
  import('../screens/news/NewsScreen').then((m) => ({ default: m.NewsScreen })),
)
const WeatherScreen = lazy(() =>
  import('../screens/weather/WeatherScreen').then((m) => ({ default: m.WeatherScreen })),
)
const AutomationsScreen = lazy(() =>
  import('../screens/automations/AutomationsScreen').then((m) => ({
    default: m.AutomationsScreen,
  })),
)
const SettingsScreen = lazy(() =>
  import('../screens/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
)

function ScreenFallback(): ReactElement {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-1 w-20 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-violet-500/50"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}

const SCREENS: Record<NavSection, ComponentType> = {
  home: HomeScreen,
  assistant: AssistantScreen,
  activity: ActivityScreen,
  knowledge: KnowledgeScreen,
  news: NewsScreen,
  weather: WeatherScreen,
  automations: AutomationsScreen,
  settings: SettingsScreen,
}

export function AppShell(): ReactElement {
  const { resolved: resolvedTheme } = useTheme()
  const [activeSection, setActiveSection] = useState<NavSection>('home')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palettePrefill, setPalettePrefill] = useState('')
  const [paletteItems, setPaletteItems] = useState<PaletteItem[]>([])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmActionRequest | null>(null)
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [spotlightOpen, setSpotlightOpen] = useState(false)

  // Check whether onboarding has been done
  useEffect(() => {
    void window.auralith
      .invoke('settings.get', { key: 'onboarding.complete' })
      .then((res) => {
        if (res.ok) {
          const data = res.data as { value: unknown }
          setOnboardingComplete(data.value === true)
        } else {
          setOnboardingComplete(false)
        }
      })
      .catch(() => setOnboardingComplete(false))
  }, [])

  const openPalette = useCallback((prefill?: string) => {
    setPalettePrefill(prefill ?? '')
    setPaletteOpen(true)
  }, [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const openShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), [])
  const openNotifications = useCallback(() => setNotificationCenterOpen(true), [])
  const closeNotifications = useCallback(() => setNotificationCenterOpen(false), [])
  const openSpotlight = useCallback(() => {
    setSpotlightOpen(true)
  }, [])

  const openAssistantWithPrefill = useCallback((text: string) => {
    setActiveSection('assistant')
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('auralith:assistant-prefill', { detail: text }))
    })
  }, [])

  const openAssistantThread = useCallback((threadId: string) => {
    setActiveSection('assistant')
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('auralith:assistant-open-thread', { detail: threadId }))
    })
  }, [])

  const runQuickCapture = useCallback(async () => {
    const res = await window.auralith.invoke('assistant.invokeTool', {
      toolId: 'screen.capture',
      toolParams: {},
    })
    if (!res.ok) {
      toast.error('Quick capture failed')
      return
    }
    const data = res.data as {
      outcome: 'success' | 'failure' | 'cancelled'
      result?: { ocrText?: string }
    }
    if (data.outcome !== 'success') {
      toast.error(data.outcome === 'cancelled' ? 'Quick capture cancelled' : 'Quick capture failed')
      return
    }
    toast.success(
      data.result?.ocrText?.trim() ? 'Screen captured with OCR text extracted' : 'Screen captured',
    )
  }, [])

  const refreshPaletteItems = useCallback(async () => {
    const [promptPresets, threadRes, miniWindowRes] = await Promise.all([
      loadPromptPresets(),
      window.auralith.invoke('assistant.listSessions', { limit: 8, offset: 0 }),
      window.auralith.invoke('system.getMiniWindowState', {}),
    ])

    const threads = threadRes.ok
      ? (
          threadRes.data as {
            sessions: Array<{ id: string; title?: string; lastMessageAt?: number }>
          }
        ).sessions
      : []
    const miniOpen = miniWindowRes.ok ? (miniWindowRes.data as { open: boolean }).open : false

    const items: PaletteItem[] = [
      {
        id: 'nav.home',
        label: 'Go to Home',
        description: 'Dashboard and suggestions',
        icon: <Home size={14} />,
        group: 'Navigation',
        onSelect: () => setActiveSection('home'),
      },
      {
        id: 'nav.assistant',
        label: 'Go to Assistant',
        description: 'Chat, threads, and tools',
        icon: <MessageSquare size={14} />,
        group: 'Navigation',
        onSelect: () => setActiveSection('assistant'),
      },
      {
        id: 'nav.activity',
        label: 'Go to Activity',
        description: 'Timeline, clipboard, and app usage',
        icon: <ActivityIcon size={14} />,
        group: 'Navigation',
        onSelect: () => setActiveSection('activity'),
      },
      {
        id: 'nav.knowledge',
        label: 'Go to Knowledge',
        description: 'Search indexed documents',
        icon: <BookOpen size={14} />,
        group: 'Navigation',
        onSelect: () => setActiveSection('knowledge'),
      },
      {
        id: 'nav.news',
        label: 'Go to News',
        description: 'Clustered briefings and saved stories',
        icon: <Newspaper size={14} />,
        group: 'Navigation',
        onSelect: () => setActiveSection('news'),
      },
      {
        id: 'nav.weather',
        label: 'Go to Weather',
        description: 'Forecast and briefing',
        icon: <CloudSun size={14} />,
        group: 'Navigation',
        onSelect: () => setActiveSection('weather'),
      },
      {
        id: 'nav.automations',
        label: 'Go to Automations',
        description: 'Routines and history',
        icon: <Workflow size={14} />,
        group: 'Navigation',
        onSelect: () => setActiveSection('automations'),
      },
      {
        id: 'nav.settings',
        label: 'Open Settings',
        description: 'Permissions, voice, and privacy',
        icon: <Settings size={14} />,
        group: 'Navigation',
        onSelect: () => setActiveSection('settings'),
      },
      {
        id: 'action.capture',
        label: 'Capture screen',
        description: 'Screenshot with OCR extraction',
        icon: <Camera size={14} />,
        group: 'Actions',
        shortcut: ['Ctrl', 'Shift', 'N'],
        onSelect: () => void runQuickCapture(),
      },
      {
        id: 'action.notifications',
        label: 'Open notification center',
        description: 'Suggestions and audit trail',
        icon: <Bell size={14} />,
        group: 'Actions',
        onSelect: openNotifications,
      },
      {
        id: 'action.spotlight',
        label: 'Open spotlight',
        description: 'Floating quick command window',
        icon: <Sparkles size={14} />,
        group: 'Actions',
        shortcut: ['Ctrl', 'Shift', 'A'],
        onSelect: openSpotlight,
      },
      {
        id: 'action.shortcuts',
        label: 'Open shortcut reference',
        description: 'Keyboard commands and bindings',
        icon: <Sparkles size={14} />,
        group: 'Actions',
        shortcut: ['Ctrl', '/'],
        onSelect: openShortcuts,
      },
      {
        id: 'action.mini',
        label: miniOpen ? 'Close mini companion' : 'Open mini companion',
        description: miniOpen
          ? 'Hide the always-on-top mini window'
          : 'Show the always-on-top mini window',
        icon: <Workflow size={14} />,
        group: 'Actions',
        onSelect: () => {
          void window.auralith.invoke(
            miniOpen ? 'system.closeMiniWindow' : 'system.openMiniWindow',
            {},
          )
        },
      },
      ...promptPresets.map((preset) => ({
        id: `prompt.${preset.id}`,
        label: preset.name,
        description: preset.prompt,
        icon: <Sparkles size={14} />,
        group: 'Prompt Library',
        onSelect: () => openAssistantWithPrefill(preset.prompt),
      })),
      ...threads.map((thread) => ({
        id: `thread.${thread.id}`,
        label: thread.title?.trim() || 'Untitled thread',
        description: thread.lastMessageAt
          ? new Date(thread.lastMessageAt).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Recent thread',
        icon: <MessageSquare size={14} />,
        group: 'Recent Threads',
        onSelect: () => openAssistantThread(thread.id),
      })),
    ]

    setPaletteItems(items)
  }, [
    openAssistantThread,
    openAssistantWithPrefill,
    openNotifications,
    openShortcuts,
    openSpotlight,
  ])

  const handleConfirm = useCallback((invocationId: string) => {
    setConfirmRequest(null)
    // Notify main process via IPC that the user confirmed
    void window.auralith.invoke('__internal.confirmationResolved', {
      invocationId,
      confirmed: true,
    })
  }, [])

  const handleCancelConfirm = useCallback((invocationId: string) => {
    setConfirmRequest(null)
    void window.auralith.invoke('__internal.confirmationResolved', {
      invocationId,
      confirmed: false,
    })
  }, [])

  // Listen for global shortcuts forwarded from main process
  useEffect(() => {
    const unsub = window.auralith.on('global-shortcut', (data) => {
      const { id, prefill, payload } = data as { id: string; prefill?: string; payload?: unknown }
      if (id === 'palette.open') openPalette(prefill)
      if (id === 'palette.close') closePalette()
      if (id === 'spotlight.open') setSpotlightOpen(true)
      if (id === 'assistant.focus') {
        setActiveSection('assistant')
        openPalette()
      }
      if (id === 'assistant.prefill' && typeof payload === 'string') {
        openAssistantWithPrefill(payload)
      }
      if (id === 'nav.home') setActiveSection('home')
      if (id === 'nav.activity') setActiveSection('activity')
      if (id === 'notifications.open') openNotifications()
      if (id === 'shortcuts.open') openShortcuts()
      if (id === 'capture.open') {
        void runQuickCapture()
      }
    })
    return unsub
  }, [
    closePalette,
    openAssistantWithPrefill,
    openNotifications,
    openPalette,
    openShortcuts,
    runQuickCapture,
  ])

  // Listen for confirm-action requests from main process
  useEffect(() => {
    const unsub = window.auralith.on('tool.confirmRequest', (data) => {
      setConfirmRequest(data as ConfirmActionRequest)
    })
    return unsub
  }, [])

  // Ctrl/Cmd+K also works from within the renderer (backup)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        openShortcuts()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        openSpotlight()
        return
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault()
        openShortcuts()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openShortcuts, openSpotlight])

  // Allow screens to request navigation via custom DOM event
  useEffect(() => {
    const handler = (e: Event) => {
      const section = (e as CustomEvent<string>).detail as NavSection
      if (section) setActiveSection(section)
    }
    window.addEventListener('auralith:navigate', handler)
    return () => window.removeEventListener('auralith:navigate', handler)
  }, [])

  useEffect(() => {
    const refreshNotifications = async () => {
      const res = await window.auralith.invoke('suggest.list', { status: 'open', limit: 20 })
      if (!res.ok) return
      const suggestions = (res.data as { suggestions: Array<unknown> }).suggestions
      setNotificationCount(suggestions.length)
    }

    void refreshNotifications()
    const interval = setInterval(() => void refreshNotifications(), 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!paletteOpen) return
    void refreshPaletteItems()
  }, [paletteOpen, refreshPaletteItems])

  useEffect(() => {
    const handleOpenNotifications = () => openNotifications()
    const handleRunCapture = () => {
      void runQuickCapture()
    }
    const handleOpenSpotlight = () => setSpotlightOpen(true)

    window.addEventListener('auralith:notifications-open', handleOpenNotifications)
    window.addEventListener('auralith:run-capture', handleRunCapture)
    window.addEventListener('auralith:spotlight-open', handleOpenSpotlight)
    return () => {
      window.removeEventListener('auralith:notifications-open', handleOpenNotifications)
      window.removeEventListener('auralith:run-capture', handleRunCapture)
      window.removeEventListener('auralith:spotlight-open', handleOpenSpotlight)
    }
  }, [openNotifications, runQuickCapture])

  const ActiveScreen = SCREENS[activeSection]

  // Loading state — checking onboarding status
  if (onboardingComplete === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg-0)]">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-violet-500/60"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    )
  }

  // Onboarding gate
  if (!onboardingComplete) {
    return (
      <>
        <ErrorBoundary fallbackTitle="Error in setup">
          <OnboardingFlow onComplete={() => setOnboardingComplete(true)} />
        </ErrorBoundary>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(20,20,28,0.90)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: '#F4F4F8',
              borderRadius: '10px',
            },
          }}
        />
      </>
    )
  }

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ background: 'var(--color-bg-0)' }}
    >
      {/* Global liquid ether backdrop — fixed behind everything */}
      <EtherBackdrop
        className="fixed inset-0 w-full h-full"
        style={{ zIndex: 0 }}
        opacity={0.55}
        theme={resolvedTheme}
      />

      {/* Custom title bar with semaphore window controls */}
      <TitleBar
        notificationCount={notificationCount}
        onOpenNotifications={openNotifications}
        onOpenPalette={() => openPalette()}
        onOpenSpotlight={openSpotlight}
      />

      {/* Skip-to-content link — keyboard accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-1.5 focus:rounded-md focus:text-sm focus:bg-accent-low focus:text-white"
      >
        Skip to main content
      </a>

      {/* Content row — pushed down by title bar height */}
      <div className="flex flex-1 overflow-hidden" style={{ marginTop: 36 }}>
        {/* Nav rail */}
        <div className="relative z-10">
          <NavRail active={activeSection} onNavigate={setActiveSection} />
        </div>

        {/* Main content area */}
        <main className="flex-1 relative overflow-hidden z-10" id="main-content" tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeSection}
              className="absolute inset-0"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{
                duration: motionDuration.standard / 1000,
                ease: motionEasing.standard,
              }}
            >
              <ErrorBoundary key={activeSection} fallbackTitle={`Error in ${activeSection}`}>
                <Suspense fallback={<ScreenFallback />}>
                  <ActiveScreen />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {/* end content row */}

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        items={paletteItems}
        prefill={palettePrefill}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />
      <NotificationCenter open={notificationCenterOpen} onClose={closeNotifications} />

      {/* Spotlight — in-app modal with frosted backdrop */}
      <AnimatePresence>
        {spotlightOpen && (
          <>
            <motion.div
              key="spotlight-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[200]"
              style={{
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
              onClick={() => setSpotlightOpen(false)}
            />
            <motion.div
              key="spotlight-panel"
              initial={{ opacity: 0, scale: 0.95, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -12 }}
              transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
              className="fixed z-[201] left-1/2 top-[22%]"
              style={{ width: 520, transform: 'translateX(-50%)', pointerEvents: 'all' }}
            >
              <SpotlightModal onClose={() => setSpotlightOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirm action sheet (confirm + restricted tier) */}
      <ConfirmActionSheet
        request={confirmRequest}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />

      {/* Ambient voice orb — always present when voice is enabled */}
      <VoiceCaptureBridge />
      <AuralithOrb />

      {/* Toast notifications */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(20,20,28,0.90)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: '#F4F4F8',
            borderRadius: '10px',
          },
        }}
      />
    </div>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}
