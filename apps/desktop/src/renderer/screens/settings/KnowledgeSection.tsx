import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { Brain, RefreshCw } from 'lucide-react'

declare const window: Window & {
  auralith: {
    invoke(
      op: string,
      params?: unknown,
    ): Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>
  }
}

type KnowledgeSettings = {
  queryRewrite: boolean
  reranker: boolean
  parentContext: number
  topK: number
}

export function KnowledgeSection(): ReactElement {
  const [settings, setSettings] = useState<KnowledgeSettings>({
    queryRewrite: true,
    reranker: false,
    parentContext: 1,
    topK: 6,
  })
  const [reindexStatus, setReindexStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [reindexMsg, setReindexMsg] = useState('')

  useEffect(() => {
    async function load() {
      const keys = [
        'retrieval.queryRewrite',
        'retrieval.reranker',
        'retrieval.parentContext',
        'retrieval.topK',
      ]
      const res = await window.auralith.invoke('settings.getAll', {})
      if (res.ok && res.data) {
        const all = res.data as Record<string, unknown>
        setSettings({
          queryRewrite: (all['retrieval.queryRewrite'] as boolean) ?? true,
          reranker: (all['retrieval.reranker'] as boolean) ?? false,
          parentContext: (all['retrieval.parentContext'] as number) ?? 1,
          topK: (all['retrieval.topK'] as number) ?? 6,
        })
      }
      void keys
    }
    void load()
  }, [])

  async function updateSetting(key: string, value: unknown) {
    await window.auralith.invoke('settings.set', { key, value })
  }

  async function handleReindex() {
    setReindexStatus('running')
    setReindexMsg('')
    const res = await window.auralith.invoke('assistant.invokeTool', {
      toolId: 'brain.reindexStaleDocs',
      params: {},
    })
    if (res.ok) {
      const data = res.data as { reindexed?: number; skipped?: number } | undefined
      setReindexMsg(`Reindexed ${data?.reindexed ?? 0} doc(s), skipped ${data?.skipped ?? 0}.`)
      setReindexStatus('done')
    } else {
      setReindexMsg(res.error?.message ?? 'Reindex failed.')
      setReindexStatus('error')
    }
  }

  const label = (text: string) => (
    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
      {text}
    </span>
  )
  const hint = (text: string) => (
    <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
      {text}
    </p>
  )
  const divider = (
    <div className="my-6" style={{ borderTop: '1px solid var(--color-border-hairline)' }} />
  )

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5" style={{ color: 'var(--color-accent-mid)' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Knowledge & Retrieval
        </h2>
      </div>

      {/* Query rewriting */}
      <div className="rounded-xl p-5" style={{ background: 'var(--color-surface-elevated)' }}>
        <div className="flex items-center justify-between">
          <div>
            {label('Query rewriting')}
            {hint(
              'Expands your query into paraphrases and keywords to improve recall. Uses phi4-mini (fast).',
            )}
          </div>
          <button
            role="switch"
            aria-checked={settings.queryRewrite}
            onClick={async () => {
              const next = !settings.queryRewrite
              setSettings((s) => ({ ...s, queryRewrite: next }))
              await updateSetting('retrieval.queryRewrite', next)
            }}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            style={{
              background: settings.queryRewrite
                ? 'var(--color-accent-mid)'
                : 'var(--color-border-subtle)',
            }}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
              style={{ transform: settings.queryRewrite ? 'translateX(22px)' : 'translateX(4px)' }}
            />
          </button>
        </div>
      </div>

      {/* Reranker */}
      <div className="rounded-xl p-5" style={{ background: 'var(--color-surface-elevated)' }}>
        <div className="flex items-center justify-between">
          <div>
            {label('LLM reranker')}
            {hint(
              'Re-scores the top results with phi4-mini for better precision. Adds ~200 ms per query.',
            )}
          </div>
          <button
            role="switch"
            aria-checked={settings.reranker}
            onClick={async () => {
              const next = !settings.reranker
              setSettings((s) => ({ ...s, reranker: next }))
              await updateSetting('retrieval.reranker', next)
            }}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            style={{
              background: settings.reranker
                ? 'var(--color-accent-mid)'
                : 'var(--color-border-subtle)',
            }}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
              style={{ transform: settings.reranker ? 'translateX(22px)' : 'translateX(4px)' }}
            />
          </button>
        </div>
      </div>

      {/* Parent-context size */}
      <div className="rounded-xl p-5" style={{ background: 'var(--color-surface-elevated)' }}>
        {label('Parent context chunks')}
        {hint(
          'Number of neighbouring chunks from the same section to include alongside each result (0 = off).',
        )}
        <div className="mt-3 flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={settings.parentContext}
            onChange={async (e) => {
              const val = Number(e.target.value)
              setSettings((s) => ({ ...s, parentContext: val }))
              await updateSetting('retrieval.parentContext', val)
            }}
            className="flex-1 accent-violet-500"
          />
          <span
            className="w-4 text-center text-sm font-mono"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {settings.parentContext}
          </span>
        </div>
      </div>

      {/* Top-K */}
      <div className="rounded-xl p-5" style={{ background: 'var(--color-surface-elevated)' }}>
        {label('Results per query (top-K)')}
        {hint(
          'Number of chunks returned per search. Higher values improve coverage but increase latency.',
        )}
        <div className="mt-3 flex items-center gap-4">
          <input
            type="range"
            min={4}
            max={12}
            step={1}
            value={settings.topK}
            onChange={async (e) => {
              const val = Number(e.target.value)
              setSettings((s) => ({ ...s, topK: val }))
              await updateSetting('retrieval.topK', val)
            }}
            className="flex-1 accent-violet-500"
          />
          <span
            className="w-5 text-center text-sm font-mono"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {settings.topK}
          </span>
        </div>
      </div>

      {divider}

      {/* Reindex stale docs */}
      <div className="rounded-xl p-5" style={{ background: 'var(--color-surface-elevated)' }}>
        {label('Reindex outdated documents')}
        {hint(
          'Re-processes documents that were indexed with an older pipeline version to generate summaries and refresh chunks.',
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void handleReindex()}
            disabled={reindexStatus === 'running'}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
            style={{
              background: 'var(--color-accent-dim)',
              color: 'var(--color-accent-mid)',
              opacity: reindexStatus === 'running' ? 0.5 : 1,
              cursor: reindexStatus === 'running' ? 'not-allowed' : 'pointer',
              border: 'none',
            }}
          >
            <RefreshCw className={`h-4 w-4 ${reindexStatus === 'running' ? 'animate-spin' : ''}`} />
            {reindexStatus === 'running' ? 'Reindexing…' : 'Reindex now'}
          </button>
          {reindexMsg && (
            <span
              className="text-xs"
              style={{
                color:
                  reindexStatus === 'error'
                    ? 'var(--color-state-error)'
                    : 'var(--color-text-secondary)',
              }}
            >
              {reindexMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
