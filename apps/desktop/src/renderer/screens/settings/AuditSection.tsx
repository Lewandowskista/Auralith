import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

type AuditEntry = {
  id: string
  ts: number
  kind: string
  actor: string
  subject: string
  meta: Record<string, unknown>
}

const ACTOR_COLORS: Record<string, string> = {
  user: 'text-violet-400',
  suggestion: 'text-amber-400',
  scheduler: 'text-sky-400',
  system: 'text-[#6F6F80]',
}

export function AuditSection(): ReactElement {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const limit = 50

  const load = useCallback(async (off: number) => {
    setLoading(true)
    try {
      const res = await window.auralith.invoke('audit.query', { limit, offset: off })
      if (res.ok) {
        const data = res.data as { entries: AuditEntry[]; total: number }
        setEntries(data.entries)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(0)
  }, [load])

  async function handleExport(format: 'json' | 'csv') {
    const res = await window.auralith.invoke('audit.export', { format })
    if (!res.ok) {
      toast.error('Export failed')
      return
    }
    const { content, mimeType } = res.data as { content: string; mimeType: string }
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auralith-audit.${format}`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported as ${format.toUpperCase()}`)
  }

  function handleNextPage() {
    const next = offset + limit
    setOffset(next)
    void load(next)
  }

  function handlePrevPage() {
    const prev = Math.max(0, offset - limit)
    setOffset(prev)
    void load(prev)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 text-lg font-semibold text-[#F4F4F8]">Audit Log</h2>
          <p className="text-sm text-[#6F6F80]">
            All tool invocations, permission changes, and system events.{' '}
            <span className="text-[#A6A6B3]">{total} total entries.</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => {
              setOffset(0)
              void load(0)
            }}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#A6A6B3] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => void handleExport('json')}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#A6A6B3] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
          <button
            onClick={() => void handleExport('csv')}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#A6A6B3] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02] text-left text-xs text-[#6F6F80]">
              <th className="px-4 py-2.5 font-medium">Time</th>
              <th className="px-4 py-2.5 font-medium">Kind</th>
              <th className="px-4 py-2.5 font-medium">Actor</th>
              <th className="px-4 py-2.5 font-medium">Subject</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-[#6F6F80]">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-[#6F6F80]">
                  No audit entries yet.
                </td>
              </tr>
            )}
            {!loading &&
              entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-[#6F6F80]">
                    {new Date(e.ts).toLocaleTimeString()}
                    <br />
                    <span className="text-[10px]">{new Date(e.ts).toLocaleDateString()}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[#A6A6B3]">{e.kind}</td>
                  <td
                    className={[
                      'px-4 py-2.5 text-xs font-medium',
                      ACTOR_COLORS[e.actor] ?? 'text-[#A6A6B3]',
                    ].join(' ')}
                  >
                    {e.actor}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#F4F4F8]">{e.subject}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between text-xs text-[#6F6F80]">
          <span>
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handlePrevPage}
              disabled={offset === 0}
              className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={offset + limit >= total}
              className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
