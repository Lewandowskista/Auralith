import { useState, useEffect } from 'react'

export type OllamaStatus = 'online' | 'offline' | 'checking'

export function useOllamaStatus(): OllamaStatus {
  const [status, setStatus] = useState<OllamaStatus>('checking')

  useEffect(() => {
    const unsub = window.auralith.on('ollama:status', (data) => {
      const { status: s } = data as { status: OllamaStatus }
      setStatus(s)
    })

    // Probe once on mount using the configured URL
    void window.auralith
      .invoke('ollama.ping', { url: '' })
      .then((res) => {
        if (res.ok) {
          const d = res.data as { online: boolean }
          setStatus(d.online ? 'online' : 'offline')
        } else {
          setStatus('offline')
        }
      })
      .catch(() => setStatus('offline'))

    return unsub
  }, [])

  return status
}
