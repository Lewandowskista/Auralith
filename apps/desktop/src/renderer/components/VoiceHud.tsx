import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, X, Loader2, XCircle } from 'lucide-react'
import { createPortal } from 'react-dom'

const METER_BARS = 10

type VoiceState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'follow-up-listening'

type VoiceHudProps = {
  onCancel?: (sessionId: string) => void
}

export function VoiceHud({ onCancel }: VoiceHudProps): ReactElement {
  const [state, setState] = useState<VoiceState>('idle')
  const [partialText, setPartialText] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [micLevel, setMicLevel] = useState(0)
  const [conversationActive, setConversationActive] = useState(false)
  const [followUpRemainingMs, setFollowUpRemainingMs] = useState(0)
  const followUpExpiresAtRef = useRef<number>(0)
  const followUpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const unsubState = window.auralith.on('voice:state', (data) => {
      const {
        state: s,
        sessionId: sid,
        conversationActive: ca,
        followUpExpiresAt,
      } = data as {
        state: VoiceState
        sessionId?: string
        conversationActive?: boolean
        followUpExpiresAt?: number
      }
      setState(s)
      if (sid) setSessionId(sid)
      if (ca !== undefined) setConversationActive(ca)
      if (s === 'idle') {
        setPartialText('')
        setErrorMsg(null)
        setMicLevel(0)
        setConversationActive(false)
        setFollowUpRemainingMs(0)
        if (followUpTimerRef.current) {
          clearInterval(followUpTimerRef.current)
          followUpTimerRef.current = null
        }
      }
      if (s === 'follow-up-listening' && followUpExpiresAt) {
        followUpExpiresAtRef.current = followUpExpiresAt
        setFollowUpRemainingMs(Math.max(0, followUpExpiresAt - Date.now()))
        if (followUpTimerRef.current) clearInterval(followUpTimerRef.current)
        followUpTimerRef.current = setInterval(() => {
          const remaining = Math.max(0, followUpExpiresAtRef.current - Date.now())
          setFollowUpRemainingMs(remaining)
          if (remaining === 0 && followUpTimerRef.current) {
            clearInterval(followUpTimerRef.current)
            followUpTimerRef.current = null
          }
        }, 200)
      } else if (s !== 'follow-up-listening') {
        if (followUpTimerRef.current) {
          clearInterval(followUpTimerRef.current)
          followUpTimerRef.current = null
        }
        setFollowUpRemainingMs(0)
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

    const unsubLevel = window.auralith.on('voice:level', (data) => {
      const { level } = data as { level: number }
      setMicLevel(level)
    })

    return () => {
      unsubState()
      unsubPartial()
      unsubFinal()
      unsubError()
      unsubLevel()
      if (followUpTimerRef.current) clearInterval(followUpTimerRef.current)
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
    setMicLevel(0)
  }, [sessionId, onCancel])

  const handleEndConversation = useCallback(() => {
    void window.auralith.invoke('voice.endConversation', {})
    setState('idle')
    setConversationActive(false)
    setPartialText('')
    setMicLevel(0)
  }, [])

  const visible = state !== 'idle'
  const followUpSec = Math.ceil(followUpRemainingMs / 1000)

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
                : state === 'thinking'
                  ? 'Thinking…'
                  : state === 'speaking'
                    ? 'Speaking…'
                    : state === 'follow-up-listening'
                      ? 'Listening for follow-up…'
                      : ''
          }
        >
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl min-w-[240px] max-w-[520px]"
            style={{
              background: 'rgba(14, 14, 20, 0.92)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            {/* State icon */}
            <div className="shrink-0">
              {(state === 'listening' || state === 'follow-up-listening') && (
                <motion.div
                  animate={
                    state === 'follow-up-listening'
                      ? { scale: [1, 1.08, 1], opacity: [0.5, 1, 0.5] }
                      : { scale: [1, 1.15, 1] }
                  }
                  transition={
                    state === 'follow-up-listening'
                      ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 1, repeat: Infinity, ease: 'easeInOut' }
                  }
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20"
                >
                  <Mic
                    size={16}
                    className={
                      state === 'follow-up-listening' ? 'text-violet-300' : 'text-violet-400'
                    }
                  />
                </motion.div>
              )}
              {state === 'transcribing' && (
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20">
                  <Loader2 size={16} className="text-amber-400 animate-spin" />
                </div>
              )}
              {state === 'thinking' && (
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20">
                  <Loader2 size={16} className="text-blue-400 animate-spin" />
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
                  {Array.from({ length: METER_BARS }, (_, i) => {
                    const threshold = (i + 1) / METER_BARS
                    const lit = micLevel >= threshold
                    return (
                      <div
                        key={i}
                        aria-hidden="true"
                        className="w-0.5 rounded-full transition-all duration-75"
                        style={{
                          height: lit ? `${8 + i * 1.4}px` : '3px',
                          background: lit
                            ? i < 6
                              ? 'rgb(139,92,246)'
                              : i < 8
                                ? 'rgb(167,139,250)'
                                : 'rgb(196,181,253)'
                            : 'rgba(139,92,246,0.2)',
                        }}
                      />
                    )
                  })}
                  <div
                    role="meter"
                    aria-label="Microphone level"
                    aria-valuenow={Math.round(micLevel * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="sr-only"
                  />
                  <span className="ml-2 text-xs text-[#A6A6B3]">Listening…</span>
                </div>
              )}
              {state === 'follow-up-listening' && (
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-[#A6A6B3]">
                    Listening for follow-up… <span className="text-[#6F6F80]">{followUpSec}s</span>
                  </p>
                  <p className="text-[10px] text-[#6F6F80]">Speak to continue or wait to end</p>
                </div>
              )}
              {state === 'transcribing' && (
                <p className="text-sm text-[#F4F4F8] truncate">
                  {partialText.length > 0 ? partialText : 'Transcribing…'}
                </p>
              )}
              {state === 'thinking' && <p className="text-sm text-[#A6A6B3]">Thinking…</p>}
              {state === 'speaking' && <p className="text-sm text-[#A6A6B3]">Speaking…</p>}
              <p className="text-[10px] text-[#6F6F80] mt-0.5">Audio is not recorded</p>
            </div>

            {/* Action buttons */}
            <div className="shrink-0 flex items-center gap-1">
              {/* Cancel capture — only when listening or transcribing */}
              {(state === 'listening' || state === 'transcribing') && (
                <button
                  onClick={handleCancel}
                  className="flex items-center justify-center w-6 h-6 rounded-full text-[#6F6F80] hover:text-[#F4F4F8] hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  aria-label="Cancel voice input"
                >
                  <X size={13} />
                </button>
              )}
              {/* End conversation — shown whenever conversation is active */}
              {conversationActive && (
                <button
                  onClick={handleEndConversation}
                  className="flex items-center justify-center w-6 h-6 rounded-full text-[#6F6F80] hover:text-red-400 hover:bg-red-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  aria-label="End conversation"
                  title="End conversation"
                >
                  <XCircle size={13} />
                </button>
              )}
            </div>
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
