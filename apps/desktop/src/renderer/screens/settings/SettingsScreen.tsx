import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  Shield,
  BookOpen,
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
  | 'permissions'
  | 'privacy'
  | 'audit'
  | 'updates'

const TABS: Array<{ id: SettingsTab; label: string; icon: ReactElement }> = [
  { id: 'appearance', label: 'Appearance', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'assistant', label: 'Assistant', icon: <Bot className="h-4 w-4" /> },
  { id: 'ollama', label: 'Ollama', icon: <Cpu className="h-4 w-4" /> },
  { id: 'voice', label: 'Voice', icon: <Mic className="h-4 w-4" /> },
  { id: 'leisure', label: 'Leisure', icon: <Coffee className="h-4 w-4" /> },
  { id: 'news', label: 'News', icon: <Newspaper className="h-4 w-4" /> },
  { id: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
  { id: 'knowledge', label: 'Knowledge', icon: <Brain className="h-4 w-4" /> },
  { id: 'diagnostics', label: 'Diagnostics', icon: <Stethoscope className="h-4 w-4" /> },
  { id: 'permissions', label: 'Permissions', icon: <Shield className="h-4 w-4" /> },
  { id: 'privacy', label: 'Privacy & Data', icon: <HardDrive className="h-4 w-4" /> },
  { id: 'audit', label: 'Audit Log', icon: <ClipboardList className="h-4 w-4" /> },
  { id: 'updates', label: 'Updates', icon: <RefreshCw className="h-4 w-4" /> },
]

export function SettingsScreen(): ReactElement {
  const [tab, setTab] = useState<SettingsTab>('appearance')

  return (
    <div data-testid="settings-screen" className="flex h-full">
      {/* Left sidebar */}
      <aside
        className="w-52 shrink-0 p-4"
        style={{
          borderRight: '1px solid var(--color-border-hairline)',
          background: 'rgba(14,14,20,0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <p
          className="mb-3 px-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Settings
        </p>
        <nav className="space-y-0.5">
          {TABS.map((t) => {
            const isActive = tab === t.id
            return (
              <button
                key={t.id}
                data-testid={`settings-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                style={{
                  background: isActive ? 'rgba(139,92,246,0.12)' : 'transparent',
                  color: isActive ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
                  border: 'none',
                  cursor: 'default',
                  textAlign: 'left',
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                {t.icon}
                {t.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {tab === 'appearance' && <AppearanceSection />}
        {tab === 'assistant' && <AssistantSection />}
        {tab === 'ollama' && <OllamaSection />}
        {tab === 'voice' && <VoiceSection />}
        {tab === 'leisure' && <LeisureSection />}
        {tab === 'news' && <NewsSection />}
        {tab === 'activity' && <ActivitySection />}
        {tab === 'knowledge' && <KnowledgeSection />}
        {tab === 'diagnostics' && <DiagnosticsSection />}
        {tab === 'permissions' && <PermissionsSection />}
        {tab === 'privacy' && <PrivacySection />}
        {tab === 'audit' && <AuditSection />}
        {tab === 'updates' && <UpdatesSection />}
      </main>
    </div>
  )
}
