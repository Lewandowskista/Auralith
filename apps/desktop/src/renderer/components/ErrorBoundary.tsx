import { Component } from 'react'
import type { ReactNode, ReactElement, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = {
  children: ReactNode
  fallbackTitle?: string
}

type State = {
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ error, errorInfo })
    void window.auralith.invoke('system.getCrashLog', {}).catch(() => null)
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  override render(): ReactNode {
    if (this.state.error) {
      const extraProps =
        this.props.fallbackTitle !== undefined ? { title: this.props.fallbackTitle } : {}
      return <ErrorFallback error={this.state.error} {...extraProps} />
    }
    return this.props.children
  }
}

function ErrorFallback({ error, title }: { error: Error; title?: string }): ReactElement {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-8 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          border: '1px solid rgba(248,113,113,0.30)',
          background: 'rgba(248,113,113,0.10)',
        }}
      >
        <AlertTriangle size={24} style={{ color: 'var(--color-state-danger)' }} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {title ?? 'Something went wrong'}
        </p>
        <p
          className="max-w-sm text-xs leading-relaxed"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {error.message || 'An unexpected error occurred in this section.'}
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        style={{
          border: '1px solid var(--color-border-hairline)',
          color: 'var(--color-text-secondary)',
          background: 'transparent',
          cursor: 'default',
          fontFamily: 'var(--font-sans)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <RefreshCw size={13} />
        Reload app
      </button>
      {(import.meta as { env?: { DEV?: boolean } }).env?.DEV === true && (
        <pre
          className="mt-2 max-h-40 max-w-full overflow-auto rounded-lg p-3 text-left font-mono text-[10px]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--color-border-hairline)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {error.stack}
        </pre>
      )}
    </div>
  )
}
