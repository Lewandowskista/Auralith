import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactElement, ReactNode } from 'react'

export type ThemeMode = 'dark' | 'light' | 'system'

type ThemeContextValue = {
  mode: ThemeMode
  resolved: 'dark' | 'light'
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  resolved: 'dark',
  setMode: () => undefined,
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

function resolveMode(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return mode
}

function applyThemeClass(resolved: 'dark' | 'light'): void {
  const root = document.documentElement
  if (resolved === 'light') {
    root.classList.add('light')
    root.classList.remove('dark')
  } else {
    root.classList.remove('light')
    root.classList.add('dark')
  }
  // Notify main process so titlebar overlay color can be updated
  void window.auralith.invoke('settings.set', { key: 'appearance.resolvedTheme', value: resolved })
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [resolved, setResolved] = useState<'dark' | 'light'>('dark')

  // Load persisted setting on mount
  useEffect(() => {
    void window.auralith.invoke('settings.get', { key: 'appearance.theme' }).then((res) => {
      if (res.ok) {
        const data = res.data as { value: unknown }
        const saved = data.value
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          const r = resolveMode(saved)
          setModeState(saved)
          setResolved(r)
          applyThemeClass(r)
        } else {
          // Default: dark
          applyThemeClass('dark')
        }
      }
    })
  }, [])

  // Listen for system preference changes when mode === 'system'
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = (): void => {
      const r = resolveMode('system')
      setResolved(r)
      applyThemeClass(r)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    const r = resolveMode(next)
    setModeState(next)
    setResolved(r)
    applyThemeClass(r)
    void window.auralith.invoke('settings.set', { key: 'appearance.theme', value: next })
  }, [])

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
  )
}
