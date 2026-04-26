import { useState } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Shield,
  Bot,
  RefreshCw,
  HardDrive,
  ClipboardList,
  Mic,
  Coffee,
  Cpu,
  Newspaper,
  Activity,
  Brain,
  Stethoscope,
  Palette,
  Database,
  Monitor,
  Keyboard,
  Info,
  Download,
  ChevronRight,
  Joystick,
} from 'lucide-react'
import { PermissionsSection } from './PermissionsSection'
import { AuditSection } from './AuditSection'
import { AppearanceSection } from './AppearanceSection'
import { AssistantSection } from './AssistantSection'
import { UpdatesSection } from './UpdatesSection'
import { PrivacySection } from './PrivacySection'
import { VoiceSection } from './VoiceSection'
import { LeisureSection } from './LeisureSection'
import { OllamaSection } from './OllamaSection'
import { NewsSection } from './NewsSection'
import { ActivitySection } from './ActivitySection'
import { KnowledgeSection } from './KnowledgeSection'
import { DiagnosticsSection } from './DiagnosticsSection'
import { PcControlSection } from './PcControlSection'

type SettingsTab =
  | 'appearance'
  | 'assistant'
  | 'ollama'
  | 'voice'
  | 'leisure'
  | 'news'
  | 'activity'
  | 'knowledge'
  | 'diagnostics'
  | 'pccontrol'
  | 'permissions'
  | 'privacy'
  | 'audit'
  | 'updates'
  | 'shortcuts'
  | 'about'

// Grouped nav sections matching the reference design's 8 categories
// Each group can have a primary tab + optional sub-tabs
type NavGroup = {
  id: string
  label: string
  icon: ReactElement
  primaryTab: SettingsTab
  subTabs?: Array<{ id: SettingsTab; label: string; icon: ReactElement }>
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'appearance-group',
    label: 'Appearance',
    icon: <Palette size={15} />,
    primaryTab: 'appearance',
    subTabs: [
      { id: 'appearance', label: 'Appearance', icon: <Palette size={13} /> },
      { id: 'assistant', label: 'Assistant', icon: <Bot size={13} /> },
    ],
  },
  {
    id: 'privacy-tiers',
    label: 'Privacy & tiers',
    icon: <Shield size={15} />,
    primaryTab: 'permissions',
    subTabs: [
      { id: 'permissions', label: 'Permissions', icon: <Shield size={13} /> },
      { id: 'privacy', label: 'Privacy & Data', icon: <HardDrive size={13} /> },
      { id: 'audit', label: 'Audit Log', icon: <ClipboardList size={13} /> },
    ],
  },
  {
    id: 'models',
    label: 'Models',
    icon: <Cpu size={15} />,
    primaryTab: 'ollama',
    subTabs: [
      { id: 'ollama', label: 'Ollama', icon: <Cpu size={13} /> },
      { id: 'voice', label: 'Voice', icon: <Mic size={13} /> },
    ],
  },
  {
    id: 'data-storage',
    label: 'Data & storage',
    icon: <Database size={15} />,
    primaryTab: 'knowledge',
    subTabs: [
      { id: 'knowledge', label: 'Knowledge', icon: <Brain size={13} /> },
      { id: 'news', label: 'News', icon: <Newspaper size={13} /> },
      { id: 'leisure', label: 'Leisure', icon: <Coffee size={13} /> },
    ],
  },
  {
    id: 'devices',
    label: 'Devices',
    icon: <Monitor size={15} />,
    primaryTab: 'activity',
    subTabs: [
      { id: 'activity', label: 'Activity', icon: <Activity size={13} /> },
      { id: 'pccontrol', label: 'PC Control', icon: <Joystick size={13} /> },
      { id: 'diagnostics', label: 'Diagnostics', icon: <Stethoscope size={13} /> },
    ],
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: <Keyboard size={15} />,
    primaryTab: 'shortcuts',
  },
  {
    id: 'about',
    label: 'About',
    icon: <Info size={15} />,
    primaryTab: 'about',
  },
]

function SettingRow({
  title,
  sub,
  control,
  danger,
}: {
  title: string
  sub?: string
  control: ReactElement
  danger?: boolean
}): ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 20,
        alignItems: 'center',
        padding: '14px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: danger ? '#f87171' : 'var(--color-text-primary)',
            marginBottom: 2,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {title}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.5,
              fontFamily: 'var(--font-sans)',
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  )
}

const SHORTCUT_MAP: Array<[string, string]> = [
  ['Open Auralith', '⌘ Space'],
  ['Push-to-talk', '⌘ ⇧ V'],
  ['New thread', '⌘ N'],
  ['Save to Knowledge', '⌘ S'],
  ['Quick capture', '⌘ ⇧ C'],
  ['Toggle ether', '⌘ ⇧ E'],
  ['Focus assistant', '⌘ /'],
  ['Go to Home', '⌘ 1'],
  ['Go to Assistant', '⌘ 2'],
  ['Go to Knowledge', '⌘ 6'],
]

function ShortcutsContent(): ReactElement {
  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--color-border-hairline)',
        background: 'rgba(18,18,26,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        padding: '4px 22px 18px',
      }}
    >
      {SHORTCUT_MAP.map(([label, combo]) => (
        <SettingRow
          key={label}
          title={label}
          control={
            <kbd
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 7,
                border: '1px solid var(--color-border-subtle)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {combo}
            </kbd>
          }
        />
      ))}
    </div>
  )
}

function AboutContent(): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          borderRadius: 14,
          border: '1px solid var(--color-border-hairline)',
          background: 'rgba(18,18,26,0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          padding: 22,
        }}
      >
        {/* Logo + name */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: 'var(--color-accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 22px rgba(139,92,246,0.35), inset 0 0 0 1px rgba(255,255,255,0.18)',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
              <path d="M8 1 L14 4.5 V11.5 L8 15 L2 11.5 V4.5 Z" fill="rgba(255,255,255,0.92)" />
              <circle cx="8" cy="8" r="2.6" fill="rgba(139,92,246,0.8)" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 24,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                marginBottom: 2,
              }}
            >
              Auralith
            </div>
            <div
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              v0.1.0 (build 2026.04.26) · Windows 11 · x64
            </div>
          </div>
        </div>

        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.65,
            marginBottom: 18,
            maxWidth: 520,
            fontFamily: 'var(--font-sans)',
          }}
        >
          A calm, on-device assistant that remembers what you choose to remember. Built quietly.
          Runs quietly. Leaves gracefully when you ask it to.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            {
              label: 'Release notes',
              icon: <ChevronRight size={11} />,
              onClick: () => toast.info('Release notes — coming soon'),
            },
            {
              label: 'Open-source licenses',
              icon: <ChevronRight size={11} />,
              onClick: () => toast.info('License details will open in a browser window'),
            },
            {
              label: 'Privacy principles',
              icon: <ChevronRight size={11} />,
              onClick: () => toast.info('All data stays on-device · no telemetry · no cloud sync'),
            },
            {
              label: 'Check for updates',
              icon: <RefreshCw size={11} />,
              onClick: async () => {
                const res = await window.auralith.invoke('system.triggerUpdateCheck', {})
                if (res.ok) toast.success('Checking for updates…')
                else toast.error('Could not check for updates')
              },
            },
          ].map(({ label, icon, onClick }) => (
            <button
              key={label}
              onClick={() => void onClick()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 500,
                border: '1px solid var(--color-border-hairline)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'all 140ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.color = 'var(--color-text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = 'var(--color-text-secondary)'
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Underlying updates section */}
      <UpdatesSection />
    </div>
  )
}

export function SettingsScreen(): ReactElement {
  const [tab, setTab] = useState<SettingsTab>('permissions')
  const [expandedGroup, setExpandedGroup] = useState<string | null>('privacy-tiers')

  // Find which group the current tab belongs to
  const activeGroup = NAV_GROUPS.find(
    (g) => g.primaryTab === tab || g.subTabs?.some((s) => s.id === tab),
  )

  const isShortcuts = tab === 'shortcuts'
  const isAbout = tab === 'about'

  function handleGroupClick(group: NavGroup) {
    if (group.subTabs && group.subTabs.length > 0) {
      if (expandedGroup === group.id) {
        setExpandedGroup(null)
      } else {
        setExpandedGroup(group.id)
        setTab(group.primaryTab)
      }
    } else {
      setExpandedGroup(group.id)
      setTab(group.primaryTab)
    }
  }

  return (
    <div
      data-testid="settings-screen"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* Narrative header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        style={{
          padding: '28px 28px 20px',
          borderBottom: '1px solid var(--color-border-hairline)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              marginBottom: 6,
              color: 'var(--color-text-primary)',
            }}
          >
            Settings,{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--color-accent-mid)' }}>calmly</em>{' '}
            arranged
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Everything runs locally by default · all data stays on-device
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
          {[
            {
              label: 'Export config',
              icon: <Download size={12} />,
              onClick: async () => {
                const res = await window.auralith.invoke('settings.getAll', {})
                if (res.ok) {
                  const blob = new Blob(
                    [JSON.stringify((res.data as { settings: unknown }).settings, null, 2)],
                    { type: 'application/json' },
                  )
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'auralith-config.json'
                  a.click()
                  URL.revokeObjectURL(url)
                  toast.success('Config exported')
                } else toast.error('Export failed')
              },
            },
          ].map(({ label, icon, onClick }) => (
            <button
              key={label}
              onClick={() => void onClick()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 500,
                border: '1px solid var(--color-border-hairline)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'all 140ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.color = 'var(--color-text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = 'var(--color-text-secondary)'
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Glassmorphic sidebar */}
        <aside
          style={{
            width: 220,
            flexShrink: 0,
            padding: 12,
            borderRight: '1px solid var(--color-border-hairline)',
            background: 'rgba(14,14,20,0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {NAV_GROUPS.map((group) => {
            const isGroupActive = activeGroup?.id === group.id
            const isExpanded = expandedGroup === group.id

            return (
              <div key={group.id}>
                <button
                  data-testid={`settings-group-${group.id}`}
                  onClick={() => handleGroupClick(group)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: 'none',
                    background: isGroupActive ? 'rgba(139,92,246,0.12)' : 'transparent',
                    color: isGroupActive
                      ? 'var(--color-accent-mid)'
                      : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 13,
                    fontWeight: isGroupActive ? 600 : 500,
                    fontFamily: 'var(--font-sans)',
                    transition: 'all 140ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isGroupActive) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      e.currentTarget.style.color = 'var(--color-text-primary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isGroupActive) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--color-text-secondary)'
                    }
                  }}
                  aria-current={isGroupActive ? 'page' : undefined}
                >
                  <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {group.icon}
                  </span>
                  <span style={{ flex: 1 }}>{group.label}</span>
                  {group.subTabs && group.subTabs.length > 0 && (
                    <ChevronRight
                      size={12}
                      style={{
                        flexShrink: 0,
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 200ms ease',
                        opacity: 0.5,
                      }}
                    />
                  )}
                </button>

                {/* Sub-tabs */}
                <AnimatePresence initial={false}>
                  {group.subTabs && isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          paddingLeft: 12,
                          paddingTop: 2,
                          paddingBottom: 4,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                        }}
                      >
                        {group.subTabs.map((subTab) => {
                          const isSubActive = tab === subTab.id
                          return (
                            <button
                              key={subTab.id}
                              data-testid={`settings-tab-${subTab.id}`}
                              onClick={() => setTab(subTab.id)}
                              style={{
                                display: 'flex',
                                width: '100%',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 10px',
                                borderRadius: 8,
                                border: 'none',
                                background: isSubActive ? 'rgba(139,92,246,0.10)' : 'transparent',
                                color: isSubActive
                                  ? 'var(--color-accent-mid)'
                                  : 'var(--color-text-tertiary)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: 12,
                                fontWeight: isSubActive ? 600 : 400,
                                fontFamily: 'var(--font-sans)',
                                transition: 'all 140ms ease',
                              }}
                              onMouseEnter={(e) => {
                                if (!isSubActive) {
                                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSubActive) {
                                  e.currentTarget.style.background = 'transparent'
                                  e.currentTarget.style.color = 'var(--color-text-tertiary)'
                                }
                              }}
                              aria-current={isSubActive ? 'page' : undefined}
                            >
                              <span
                                style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}
                              >
                                {subTab.icon}
                              </span>
                              {subTab.label}
                            </button>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 40px' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={isShortcuts ? 'shortcuts' : isAbout ? 'about' : tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {isShortcuts ? (
                <div>
                  <SectionLabel eyebrow="Keyboard" title="Shortcuts" />
                  <ShortcutsContent />
                </div>
              ) : isAbout ? (
                <div>
                  <SectionLabel eyebrow="App" title="About Auralith" />
                  <AboutContent />
                </div>
              ) : (
                <>
                  {tab === 'appearance' && <AppearanceSection />}
                  {tab === 'assistant' && <AssistantSection />}
                  {tab === 'ollama' && <OllamaSection />}
                  {tab === 'voice' && <VoiceSection />}
                  {tab === 'leisure' && <LeisureSection />}
                  {tab === 'news' && <NewsSection />}
                  {tab === 'activity' && <ActivitySection />}
                  {tab === 'pccontrol' && <PcControlSection />}
                  {tab === 'knowledge' && <KnowledgeSection />}
                  {tab === 'diagnostics' && <DiagnosticsSection />}
                  {tab === 'permissions' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      <TierSummaryCard />
                      <PermissionsSection />
                    </div>
                  )}
                  {tab === 'privacy' && <PrivacySection />}
                  {tab === 'audit' && <AuditSection />}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ eyebrow, title }: { eyebrow: string; title: string }): ReactElement {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-mono)',
          marginBottom: 3,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {title}
      </div>
    </div>
  )
}

// Tiered permission summary — shown at top of Privacy & tiers section
function TierSummaryCard(): ReactElement {
  const tiers = [
    {
      label: 'Safe',
      color: '#34d399',
      bg: 'rgba(52,211,153,0.08)',
      border: 'rgba(52,211,153,0.2)',
      count: 42,
      sub: 'read · summarize · search',
    },
    {
      label: 'Confirm',
      color: '#fbbf24',
      bg: 'rgba(251,191,36,0.08)',
      border: 'rgba(251,191,36,0.2)',
      count: 6,
      sub: 'send · write · post',
    },
    {
      label: 'Restricted',
      color: '#f87171',
      bg: 'rgba(248,113,113,0.08)',
      border: 'rgba(248,113,113,0.2)',
      count: 0,
      sub: 'off by default',
    },
  ]

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--color-border-hairline)',
        background: 'rgba(18,18,26,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        padding: 18,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-accent-mid)',
          }}
        >
          <Shield size={16} />
        </div>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
              marginBottom: 2,
            }}
          >
            Everything runs on-device
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Captures, embeddings, and model calls stay local unless you flip a switch.
          </div>
        </div>
      </div>

      {/* Tier tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {tiers.map((t) => (
          <div
            key={t.label}
            style={{
              padding: 14,
              borderRadius: 10,
              background: t.bg,
              border: `1px solid ${t.border}`,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: t.color,
                marginBottom: 6,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {t.label}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                fontWeight: 500,
                lineHeight: 1,
                color: 'var(--color-text-primary)',
                marginBottom: 4,
              }}
            >
              {t.count}
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {t.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
