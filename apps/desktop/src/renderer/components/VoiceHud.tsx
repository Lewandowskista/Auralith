import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, X, Loader2 } from 'lucide-react'
import { createPortal } from 'react-dom'

type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking'

type VoiceHudProps = {
  onCancel?: (sessionId: string) => void
}

export function VoiceHud({ onCancel }: VoiceHudProps): ReactElement {
  const [state, setState] = useState<VoiceState>('idle')
  const [partialText, setPartialText] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Waveform bars state (animated during listening)
  const [bars] = useState(() => Array.from({ length: 9 }, (_, i) => i))

  useEffect(() => {
    const unsubState = window.auralith.on('voice:state', (data) => {
      const { state: s, sessionId: sid } = data as { state: VoiceState; sessionId?: string }
      setState(s)
      if (sid) setSessionId(sid)
      if (s === 'idle') {
        setPartialText('')
        setErrorMsg(null)
      }
    })

    const unsubPartial = window.auralith.on('voice:partial', (data) => {
      const { text } = data as { text: string }
      setPartialText(text)
    })

    const unsubFinal = window.auralith.on('voice:final', (data) => {
      const { text } = data as { text: string }
      setPartialText(text)
    })

    const unsubError = window.auralith.on('voice:error', (data) => {
      const { message } = data as { message: string }
      setErrorMsg(message)
      setState('idle')
    })

    return () => {
      unsubState()
      unsubPartial()
      unsubFinal()
      unsubError()
    }
  }, [])

  const handleCancel = useCallback(() => {
    if (sessionId) {
      onCancel?.(sessionId)
      void window.auralith.invoke('voice.cancelCapture', { sessionId })
    }
    setState('idle')
    setPartialText('')
    setSessionId(null)
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [sessionId, onCancel])

  const visible = state !== 'idle'

  const hudContent = (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-6 left-1/2 z-[9999] -translate-x-1/2"
          style={{ pointerEvents: 'auto' }}
          role="status"
          aria-live="polite"
          aria-label={
            state === 'listening'
              ? 'Listening…'
              : state === 'transcribing'
                ? 'Transcribing…'
                : state === 'speaking'
                  ? 'Speaking…'
                  : ''
          }
        >
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl min-w-[240px] max-w-[480px]"
            style={{
              background: 'rgba(14, 14, 20, 0.92)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            {/* State icon */}
            <div className="shrink-0">
              {state === 'listening' && (
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20"
                >
                  <Mic size={16} className="text-violet-400" />
                </motion.div>
              )}
              {state === 'transcribing' && (
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20">
                  <Loader2 size={16} className="text-amber-400 animate-spin" />
                </div>
              )}
              {state === 'speaking' && (
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/20">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="w-3 h-3 rounded-full bg-cyan-400"
                  />
                </div>
              )}
            </div>

            {/* Waveform + text */}
            <div className="flex-1 min-w-0">
              {state === 'listening' && (
                <div className="flex items-center gap-0.5 h-5">
                  {bars.map((i) => (
                    <motion.div
                      key={i}
                      className="w-0.5 rounded-full bg-violet-400"
                      animate={{
                        height: ['4px', `${8 + Math.random() * 12}px`, '4px'],
                      }}
                      transition={{
                        duration: 0.5 + i * 0.07,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.04,
                      }}
                    />
                  ))}
                  <span className="ml-2 text-xs text-[#A6A6B3]">Listening…</span>
                </div>
              )}
              {state === 'transcribing' && (
                <p className="text-sm text-[#F4F4F8] truncate">
                  {partialText.length > 0 ? partialText : 'Transcribing…'}
                </p>
              )}
              {state === 'speaking' && <p className="text-sm text-[#A6A6B3]">Speaking…</p>}
              <p className="text-[10px] text-[#6F6F80] mt-0.5">Audio is not recorded</p>
            </div>

            {/* Cancel button — only shown when listening or transcribing */}
            {(state === 'listening' || state === 'transcribing') && (
              <button
                onClick={handleCancel}
                className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-[#6F6F80] hover:text-[#F4F4F8] hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                aria-label="Cancel voice input"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Error toast */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 px-3 py-2 rounded-xl text-xs text-red-300 bg-red-900/30 border border-red-500/20"
              >
                <MicOff size={11} className="inline mr-1.5 shrink-0" />
                {errorMsg}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(hudContent, document.body) as ReactElement
}
