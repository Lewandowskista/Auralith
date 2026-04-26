import { useState, useEffect, useRef } from 'react'

export type OllamaStatus = 'online' | 'offline' | 'checking'

async function probeOllama(): Promise<OllamaStatus> {
  try {
    const res = await window.auralith.invoke('ollama.ping', { url: '' })
    if (res.ok) {
      const d = res.data as { online: boolean }
      return d.online ? 'online' : 'offline'
    }
    return 'offline'
  } catch {
    return 'offline'
  }
}

export function useOllamaStatus(): { status: OllamaStatus; retry: () => void } {
  const [status, setStatus] = useState<OllamaStatus>('checking')
  const retryDelayRef = useRef(15_000)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function scheduleRetry() {
    clearTimer()
    timerRef.current = setTimeout(async () => {
      const next = await probeOllama()
      setStatus(next)
      if (next === 'offline') {
        retryDelayRef.current = Math.min(retryDelayRef.current * 1.5, 60_000)
        scheduleRetry()
      } else {
        retryDelayRef.current = 15_000
      }
    }, retryDelayRef.current)
  }

  async function retry() {
    clearTimer()
    setStatus('checking')
    const next = await probeOllama()
    setStatus(next)
    if (next === 'offline') {
      retryDelayRef.current = 15_000
      scheduleRetry()
    }
  }

  useEffect(() => {
    const unsub = window.auralith.on('ollama:status', (data) => {
      const { status: s } = data as { status: OllamaStatus }
      setStatus(s)
      if (s === 'online') {
        clearTimer()
        retryDelayRef.current = 15_000
      }
    })

    // Delay initial probe by 2s — avoids a guaranteed-to-fail call on cold start
    // before Ollama has had a chance to come up
    const initTimer = setTimeout(() => {
      void probeOllama().then((next) => {
        setStatus(next)
        if (next === 'offline') scheduleRetry()
      })
    }, 2_000)

    return () => {
      clearTimeout(initTimer)
      unsub()
      clearTimer()
    }
  }, [])

  return { status, retry }
}
