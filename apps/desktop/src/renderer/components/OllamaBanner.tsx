import type { ReactElement } from 'react'
import { WifiOff } from 'lucide-react'

export function OllamaBanner(): ReactElement {
  return (
    <div
      data-testid="ollama-offline"
      className="flex items-center gap-2.5 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
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
      </span>
    </div>
  )
}
