import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionGlobalConfig } from 'framer-motion'
import './styles/global.css'
import { App } from './App'
import { initTtsAudioPlayer } from './lib/audio/tts-audio-player'

// Honour OS reduced-motion preference without Framer Motion's console warning
MotionGlobalConfig.skipAnimations = window.matchMedia('(prefers-reduced-motion: reduce)').matches

void initTtsAudioPlayer()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
