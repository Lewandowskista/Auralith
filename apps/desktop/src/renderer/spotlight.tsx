import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { ThemeProvider } from './context/ThemeContext'
import { SpotlightApp } from './components/SpotlightApp'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <SpotlightApp />
    </ThemeProvider>
  </StrictMode>,
)
