import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Bell, History, Sparkles } from 'lucide-react'
import { DataTable, Dialog, Tabs, type DataTableColumn } from '@auralith/design-system'

type SuggestionRow = {
  id: string
  title: string
  rationale: string
  tier: 'safe' | 'confirm' | 'restricted'
  createdAt: number
}

type AuditEntry = {
  id: string
  ts: number
  kind: string
  actor: string
  subject: string
  meta: Record<string, unknown>
}

type Props = {
  open: boolean
  onClose: () => void
}

type NotificationTab = 'inbox' | 'audit'

function formatRelative(ts: number): string {
  const diffMs = Math.max(0, Date.now() - ts)
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.round(diffHr / 24)}d ago`
}

export function NotificationCenter({ open, onClose }: Props): ReactElement | null {
  const [tab, setTab] = useState<NotificationTab>('inbox')
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])

  useEffect(() => {
    if (!open) return
    const load = async () => {
      const [suggestRes, auditRes] = await Promise.all([
        window.auralith.invoke('suggest.list', { status: 'open', limit: 8 }),
        window.auralith.invoke('audit.query', { limit: 20, offset: 0 }),
      ])

      if (suggestRes.ok) {
        setSuggestions((suggestRes.data as { suggestions: SuggestionRow[] }).suggestions)
      }
      if (auditRes.ok) {
        setAuditEntries((auditRes.data as { entries: AuditEntry[] }).entries)
      }
    }

    void load()
  }, [open])

  const auditColumns = useMemo<DataTableColumn<AuditEntry>[]>(
    () => [
      {
        id: 'kind',
        header: 'Kind',
        render: (row) => <span className="font-mono text-[12px] text-violet-200">{row.kind}</span>,
      },
      {
        id: 'subject',
        header: 'Subject',
        render: (row) => (
          <div>
            <p className="text-sm text-[#F4F4F8]">{row.subject}</p>
            <p className="mt-1 text-[11px] text-[#6F6F80]">{row.actor}</p>
          </div>
        ),
      },
      {
        id: 'ts',
        header: 'When',
        className: 'whitespace-nowrap',
        render: (row) => <span className="text-xs text-[#6F6F80]">{formatRelative(row.ts)}</span>,
      },
    ],
    [],
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Notification center"
      description="What the assistant has surfaced and done recently."
      className="max-w-[860px]"
    >
      <div className="px-6 py-5">
        <Tabs
          items={[
            { id: 'inbox', label: 'Inbox', icon: <Bell className="h-3.5 w-3.5" /> },
            { id: 'audit', label: 'Audit', icon: <History className="h-3.5 w-3.5" /> },
          ]}
          value={tab}
          onValueChange={(value) => setTab(value as NotificationTab)}
        />

        {tab === 'inbox' ? (
          <div className="mt-4 space-y-3">
            {suggestions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-sm text-[#6F6F80]">
                No open suggestions right now.
              </div>
            ) : (
              suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-300" />
                        <p className="text-sm font-medium text-[#F4F4F8]">{suggestion.title}</p>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[#6F6F80]">
                        {suggestion.rationale}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-[#6F6F80]">
                      {formatRelative(suggestion.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="mt-4">
            <DataTable
              columns={auditColumns}
              rows={auditEntries}
              rowKey={(row) => row.id}
              emptyLabel="No recent audit entries"
            />
          </div>
        )}
      </div>
    </Dialog>
  )
}
