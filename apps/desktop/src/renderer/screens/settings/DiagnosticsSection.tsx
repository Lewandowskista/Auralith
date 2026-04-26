import { useState } from 'react'
import type { ReactElement } from 'react'
import { Activity, CheckCircle, XCircle, RefreshCw, Clock } from 'lucide-react'

declare const window: Window & {
  auralith: {
    invoke(
      op: string,
      params?: unknown,
    ): Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>
  }
}

type TraceStat = {
  op: string
  p50: number
  p95: number
  count: number
  errorRate: number
}

type ReliabilityRow = {
  model: string
  role: string
  promptId: string
  hourBucket: number
  attempts: number
  parseFailures: number
  validationFailures: number
  repaired: number
  successes: number
}

type CheckupResult = {
  id: string
  label: string
  pass: boolean
  ms: number
  detail: string
}

type CheckupData = {
  results: CheckupResult[]
  allPass: boolean
  ts: number
}

export function DiagnosticsSection(): ReactElement {
  const [traceStats, setTraceStats] = useState<TraceStat[]>([])
  const [reliabilityRows, setReliabilityRows] = useState<ReliabilityRow[]>([])
  const [checkup, setCheckup] = useState<CheckupData | null>(null)
  const [loadingTraces, setLoadingTraces] = useState(false)
  const [loadingReliability, setLoadingReliability] = useState(false)
  const [runningCheckup, setRunningCheckup] = useState(false)

  async function loadTraces() {
    setLoadingTraces(true)
    const res = await window.auralith.invoke('obs.queryTraces', {
      fromTs: Date.now() - 24 * 60 * 60 * 1000,
    })
    if (res.ok && res.data) {
      const d = res.data as { stats?: TraceStat[] }
      setTraceStats(d.stats ?? [])
    }
    setLoadingTraces(false)
  }

  async function loadReliability() {
    setLoadingReliability(true)
    const res = await window.auralith.invoke('obs.getReliability', {})
    if (res.ok && res.data) {
      const d = res.data as { rows?: ReliabilityRow[] }
      // Aggregate rows by model+role
      const agg = new Map<string, ReliabilityRow>()
      for (const r of d.rows ?? []) {
        const key = `${r.model}::${r.role}`
        const existing = agg.get(key)
        if (existing) {
          existing.attempts += r.attempts
          existing.parseFailures += r.parseFailures
          existing.validationFailures += r.validationFailures
          existing.repaired += r.repaired
          existing.successes += r.successes
        } else {
          agg.set(key, { ...r })
        }
      }
      setReliabilityRows(Array.from(agg.values()))
    }
    setLoadingReliability(false)
  }

  async function runCheckup() {
    setRunningCheckup(true)
    const res = await window.auralith.invoke('obs.runCheckup', {})
    if (res.ok && res.data) {
      setCheckup(res.data as CheckupData)
    }
    setRunningCheckup(false)
  }

  const sectionTitle = (text: string) => (
    <h3
      className="mb-3 text-sm font-semibold uppercase tracking-wider"
      style={{ color: 'var(--color-text-tertiary)' }}
    >
      {text}
    </h3>
  )

  const loadBtn = (label: string, loading: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition"
      style={{
        background: 'var(--color-accent-dim)',
        color: 'var(--color-accent-mid)',
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1,
      }}
    >
      <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Loading…' : label}
    </button>
  )

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5" style={{ color: 'var(--color-accent-mid)' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Diagnostics
        </h2>
      </div>

      {/* Run checkup */}
      <section>
        {sectionTitle('System checkup')}
        <div className="rounded-xl p-5" style={{ background: 'var(--color-surface-elevated)' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void runCheckup()}
              disabled={runningCheckup}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
              style={{
                background: 'var(--color-accent-mid)',
                color: '#fff',
                border: 'none',
                cursor: runningCheckup ? 'not-allowed' : 'pointer',
                opacity: runningCheckup ? 0.7 : 1,
              }}
            >
              <RefreshCw className={`h-4 w-4 ${runningCheckup ? 'animate-spin' : ''}`} />
              {runningCheckup ? 'Running…' : 'Run checkup'}
            </button>
            {checkup && (
              <span
                className="flex items-center gap-1 text-sm"
                style={{
                  color: checkup.allPass
                    ? 'var(--color-state-success)'
                    : 'var(--color-state-error)',
                }}
              >
                {checkup.allPass ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {checkup.allPass ? 'All checks passed' : 'Some checks failed'}
              </span>
            )}
          </div>
          {checkup && (
            <div className="mt-4 space-y-2">
              {checkup.results.map((r) => (
                <div key={r.id} className="flex items-start gap-3">
                  {r.pass ? (
                    <CheckCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: 'var(--color-state-success)' }}
                    />
                  ) : (
                    <XCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: 'var(--color-state-error)' }}
                    />
                  )}
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {r.label}
                      <span
                        className="ml-2 text-xs font-normal"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {r.ms}ms
                      </span>
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {r.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* IPC latency */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          {sectionTitle('IPC latency (last 24 h)')}
          {loadBtn('Load', loadingTraces, () => void loadTraces())}
        </div>
        {traceStats.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                  {['Op', 'p50', 'p95', 'Calls', 'Err %'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left font-semibold"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {traceStats.map((s) => (
                  <tr key={s.op} style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                    <td
                      className="px-4 py-2 font-mono"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {s.op}
                    </td>
                    <td
                      className="px-4 py-2"
                      style={{
                        color:
                          s.p50 > 1000
                            ? 'var(--color-state-warning)'
                            : 'var(--color-text-secondary)',
                      }}
                    >
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {s.p50}ms
                      </span>
                    </td>
                    <td
                      className="px-4 py-2"
                      style={{
                        color:
                          s.p95 > 2000 ? 'var(--color-state-error)' : 'var(--color-text-secondary)',
                      }}
                    >
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {s.p95}ms
                      </span>
                    </td>
                    <td className="px-4 py-2" style={{ color: 'var(--color-text-secondary)' }}>
                      {s.count}
                    </td>
                    <td
                      className="px-4 py-2"
                      style={{
                        color:
                          s.errorRate > 0.1
                            ? 'var(--color-state-error)'
                            : 'var(--color-text-secondary)',
                      }}
                    >
                      {(s.errorRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {traceStats.length === 0 && !loadingTraces && (
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            No trace data yet — click Load to fetch.
          </p>
        )}
      </section>

      {/* Model reliability */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          {sectionTitle('Model structured-output reliability (last 7 days)')}
          {loadBtn('Load', loadingReliability, () => void loadReliability())}
        </div>
        {reliabilityRows.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--color-surface-elevated)' }}
          >
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                  {[
                    'Model',
                    'Role',
                    'Attempts',
                    'Parse fail',
                    'Validation fail',
                    'Repaired',
                    'Success %',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left font-semibold"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reliabilityRows.map((r, i) => {
                  const successPct =
                    r.attempts > 0 ? ((r.successes / r.attempts) * 100).toFixed(0) : '—'
                  const successNum = r.attempts > 0 ? (r.successes / r.attempts) * 100 : 100
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                      <td
                        className="px-4 py-2 font-mono text-xs"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        {r.model}
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--color-text-secondary)' }}>
                        {r.role}
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--color-text-secondary)' }}>
                        {r.attempts}
                      </td>
                      <td
                        className="px-4 py-2"
                        style={{
                          color:
                            r.parseFailures > 0
                              ? 'var(--color-state-warning)'
                              : 'var(--color-text-secondary)',
                        }}
                      >
                        {r.parseFailures}
                      </td>
                      <td
                        className="px-4 py-2"
                        style={{
                          color:
                            r.validationFailures > 0
                              ? 'var(--color-state-warning)'
                              : 'var(--color-text-secondary)',
                        }}
                      >
                        {r.validationFailures}
                      </td>
                      <td className="px-4 py-2" style={{ color: 'var(--color-text-secondary)' }}>
                        {r.repaired}
                      </td>
                      <td
                        className="px-4 py-2 font-semibold"
                        style={{
                          color:
                            successNum < 90
                              ? 'var(--color-state-error)'
                              : 'var(--color-state-success)',
                        }}
                      >
                        {successPct}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {reliabilityRows.length === 0 && !loadingReliability && (
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            No reliability data yet — click Load to fetch.
          </p>
        )}
      </section>
    </div>
  )
}
