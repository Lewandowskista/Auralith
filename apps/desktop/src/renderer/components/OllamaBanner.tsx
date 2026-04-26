import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { CheckCircle2, RefreshCw, WifiOff } from 'lucide-react'
import { motion } from 'framer-motion'

type RetryState = 'idle' | 'checking' | 'success' | 'failed'

type Props = {
  onRetry?: () => Promise<void> | void
}

export function OllamaBanner({ onRetry }: Props): ReactElement {
  const [retryState, setRetryState] = useState<RetryState>('idle')

  useEffect(() => {
    if (retryState === 'success' || retryState === 'failed') {
      const t = setTimeout(() => setRetryState('idle'), 3000)
      return () => clearTimeout(t)
    }
  }, [retryState])

  async function handleRetry() {
    if (!onRetry || retryState === 'checking') return
    setRetryState('checking')
    try {
      await onRetry()
      const statusRes = await window.auralith.invoke('ollama.getStatus', {})
      const online = statusRes.ok && (statusRes.data as { online?: boolean }).online === true
      setRetryState(online ? 'success' : 'failed')
    } catch {
      setRetryState('failed')
    }
  }

  const retryLabel =
    retryState === 'checking'
      ? 'Checking…'
      : retryState === 'success'
        ? 'Connected!'
        : retryState === 'failed'
          ? 'Still offline'
          : 'Retry'

  const isSuccess = retryState === 'success'

  return (
    <motion.div
      data-testid="ollama-offline"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className={`flex items-center gap-2.5 border-b px-4 py-2.5 text-sm transition-colors ${
        isSuccess
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <WifiOff className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">
        {isSuccess ? (
          'Ollama connected — AI features are now available.'
        ) : retryState === 'failed' ? (
          'Still offline — is Ollama running? Try starting it with: ollama serve'
        ) : (
          <>
            Local model offline.{' '}
            <a
              href="https://ollama.ai"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-amber-200"
            >
              Install Ollama
            </a>{' '}
            or start it to enable AI features.
          </>
        )}
      </span>
      {onRetry && !isSuccess && (
        <button
          onClick={() => void handleRetry()}
          disabled={retryState === 'checking'}
          className="flex items-center gap-1 rounded-md border border-amber-500/30 px-2 py-1 text-xs text-amber-300 transition-colors hover:bg-amber-500/15 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${retryState === 'checking' ? 'animate-spin' : ''}`} />
          {retryLabel}
        </button>
      )}
    </motion.div>
  )
}
