import type { ReactElement } from 'react'
import { AppShell } from './components/AppShell'
import { ThemeProvider } from './context/ThemeContext'

export function App(): ReactElement {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  )
}
