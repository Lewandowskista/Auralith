import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { Mic, X, Loader2, MicOff, ChevronUp } from 'lucide-react'

type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking' | 'thinking'

type ConversationEntry = {
  role: 'user' | 'assistant'
  content: string
}

type AuralithOrbProps = {
  onCancel?: (sessionId: string) => void
}

const ORB_SIZE = 72

export function AuralithOrb({ onCancel }: AuralithOrbProps): ReactElement {
  const [state, setState] = useState<VoiceState>('idle')
  const [partialText, setPartialText] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [conversation, setConversation] = useState<ConversationEntry[]>([])
  const [offlineMode, setOfflineMode] = useState(false)
  const [conversationMode, setConversationMode] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentAssistantText = useRef('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setCountdown(null)
  }, [])

  useEffect(() => {
    const unsubState = window.auralith.on('voice:state', (data) => {
      const { state: s, sessionId: sid } = data as { state: VoiceState; sessionId?: string }
      setState(s)
      if (sid) setSessionId(sid)
      if (s === 'idle') {
        setPartialText('')
        setErrorMsg(null)
        stopCountdown()
      }
    })

    const unsubPartial = window.auralith.on('voice:partial', (data) => {
      const { text } = data as { text: string }
      setPartialText(text)
    })

    const unsubFinal = window.auralith.on('voice:final', (data) => {
      const { text } = data as { text: string }
      if (text.trim()) {
        setConversation((prev) => [...prev, { role: 'user', content: text }])
        setState('thinking')
      }
    })

    const unsubToken = window.auralith.on('assistant:token', (data) => {
      const { token } = data as { token: string }
      if (token.startsWith('[Calling tool:')) return // skip tool-call announcements
      currentAssistantText.current += token
    })

    const unsubDone = window.auralith.on('assistant:done', () => {
      const text = currentAssistantText.current.trim()
      if (text) {
        setConversation((prev) => [...prev, { role: 'assistant', content: text }])
      }
      currentAssistantText.current = ''
      setState('idle')
    })

    const unsubError = window.auralith.on('voice:error', (data) => {
      const { message } = data as { message: string }
      setErrorMsg(message)
      setState('idle')
    })

    const unsubOllama = window.auralith.on('ollama:status', (data) => {
      const { status } = data as { status: string }
      setOfflineMode(status === 'offline')
    })

    const unsubVoiceMsg = window.auralith.on('voice:assistant-message', (data) => {
      const { text } = data as { text: string }
      if (text.trim()) {
        setConversation((prev) => [...prev, { role: 'user', content: text }])
        setState('thinking')
      }
    })

    // Load conversation mode setting
    void window.auralith.invoke('voice.getSettings', {}).then((res) => {
      if (res.ok) {
        const s = res.data as { conversationMode?: boolean }
        setConversationMode(s.conversationMode ?? false)
      }
    })

    return () => {
      unsubState()
      unsubPartial()
      unsubFinal()
      unsubToken()
      unsubDone()
      unsubError()
      unsubOllama()
      unsubVoiceMsg()
    }
  }, [stopCountdown])

  // Auto-scroll conversation
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [conversation, expanded])

  useEffect(() => {
    // Start countdown after TTS finishes when conversation mode is on
    if (state === 'idle' && conversationMode && conversation.length > 0) {
      const last = conversation[conversation.length - 1]
      if (last?.role === 'assistant') {
        let secs = 10
        setCountdown(secs)
        countdownRef.current = setInterval(() => {
          secs--
          setCountdown(secs)
          if (secs <= 0) {
            stopCountdown()
          }
        }, 1_000)
        return () => stopCountdown()
      }
    }
  }, [state, conversationMode, conversation, stopCountdown])

  const handleCancel = useCallback(() => {
    if (sessionId) {
      onCancel?.(sessionId)
      void window.auralith.invoke('voice.cancelCapture', { sessionId })
    }
    setState('idle')
    setPartialText('')
    setSessionId(null)
    stopCountdown()
  }, [sessionId, onCancel, stopCountdown])

  const handleOrbClick = useCallback(() => {
    setExpanded((v) => !v)
  }, [])

  // Determine orb ring color class based on state
  const ringColor =
    state === 'listening'
      ? '#8B5CF6'
      : state === 'transcribing'
        ? '#F59E0B'
        : state === 'thinking'
          ? '#F59E0B'
          : state === 'speaking'
            ? '#22D3EE'
            : offlineMode
              ? '#F97316'
              : '#3B3B4D'

  const orbContent = (
    <div className="fixed bottom-6 right-6 z-[9998]" style={{ pointerEvents: 'auto' }}>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-[84px] right-0 w-[380px] max-h-[480px] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'rgba(14,14,20,0.92)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
              <span className="text-xs font-medium text-text-secondary tracking-wide uppercase">
                Auralith
              </span>
              <div className="flex items-center gap-2">
                {offlineMode && (
                  <span className="text-[10px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                    Offline
                  </span>
                )}
                <button
                  onClick={() => setExpanded(false)}
                  className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-white/8 transition-colors"
                  aria-label="Close"
                >
                  <ChevronUp size={12} />
                </button>
              </div>
            </div>

            {/* Conversation */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[80px]"
            >
              {conversation.length === 0 && (
                <p className="text-xs text-text-tertiary text-center py-4">
                  {offlineMode
                    ? 'Ollama is offline — voice notes still work'
                    : 'Say something to start…'}
                </p>
              )}
              {conversation.map((entry, i) => (
                <div
                  key={i}
                  className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      entry.role === 'user'
                        ? 'bg-accent-low/20 text-text-primary border border-accent-low/20'
                        : 'bg-white/5 text-text-secondary border border-white/[0.06]'
                    }`}
                  >
                    {entry.content}
                  </div>
                </div>
              ))}
              {/* Live partial text */}
              {(state === 'listening' || state === 'transcribing') && partialText && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-accent-low/10 text-text-secondary border border-accent-low/10 italic">
                    {partialText}
                  </div>
                </div>
              )}
              {state === 'thinking' && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/[0.06]">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-amber-400"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="px-4 py-2.5 border-t border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-2">
                {state === 'listening' && (
                  <>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 7 }, (_, i) => (
                        <motion.div
                          key={i}
                          className="w-0.5 rounded-full bg-violet-400"
                          animate={{ height: ['3px', `${6 + Math.random() * 10}px`, '3px'] }}
                          transition={{
                            duration: 0.4 + i * 0.06,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: i * 0.04,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-text-tertiary">Listening…</span>
                  </>
                )}
                {state === 'transcribing' && (
                  <>
                    <Loader2 size={12} className="text-amber-400 animate-spin" />
                    <span className="text-xs text-text-tertiary">Transcribing…</span>
                  </>
                )}
                {state === 'speaking' && (
                  <>
                    <motion.div
                      className="w-2 h-2 rounded-full bg-cyan-400"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.7, repeat: Infinity }}
                    />
                    <span className="text-xs text-text-tertiary">Speaking…</span>
                  </>
                )}
                {state === 'thinking' && (
                  <>
                    <Loader2 size={12} className="text-amber-400 animate-spin" />
                    <span className="text-xs text-text-tertiary">Thinking…</span>
                  </>
                )}
                {state === 'idle' && countdown !== null && (
                  <span className="text-xs text-accent-mid">Listening in {countdown}s…</span>
                )}
                {state === 'idle' && countdown === null && (
                  <span className="text-xs text-text-tertiary">PTT: Ctrl+Shift+Space</span>
                )}
              </div>
              {(state === 'listening' || state === 'transcribing') && (
                <button
                  onClick={handleCancel}
                  className="flex items-center justify-center w-6 h-6 rounded-full text-text-tertiary hover:text-state-danger hover:bg-state-danger/10 transition-colors"
                  aria-label="Cancel"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Error */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-4 py-2 text-xs text-red-300 bg-red-900/20 border-t border-red-500/15 flex items-center gap-1.5"
                >
                  <MicOff size={11} />
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The orb itself */}
      <motion.button
        onClick={handleOrbClick}
        aria-label={`Auralith voice assistant — ${state}`}
        aria-expanded={expanded}
        style={{
          width: ORB_SIZE,
          height: ORB_SIZE,
          borderRadius: '50%',
          background: 'rgba(14,14,20,0.70)',
          backdropFilter: 'blur(16px)',
          border: `2px solid ${ringColor}`,
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 20px ${ringColor}40, 0 2px 16px rgba(0,0,0,0.5)`,
          transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        animate={
          state === 'idle' && !offlineMode
            ? { scale: [1, 1.02, 1] }
            : state === 'speaking'
              ? { scale: [1, 1.04, 1] }
              : {}
        }
        transition={
          state === 'idle' && !offlineMode
            ? { duration: 3, repeat: Infinity, ease: 'easeInOut' }
            : state === 'speaking'
              ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' }
              : {}
        }
      >
        {/* State icon */}
        {state === 'idle' && !offlineMode && (
          <motion.div
            className="flex items-center justify-center"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Mic size={22} style={{ color: ringColor }} />
          </motion.div>
        )}
        {state === 'idle' && offlineMode && <MicOff size={22} className="text-orange-400" />}
        {state === 'listening' && (
          <div className="flex items-end justify-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <motion.div
                key={i}
                style={{ width: 3, borderRadius: 2, background: '#8B5CF6' }}
                animate={{ height: ['4px', `${10 + i * 3}px`, '4px'] }}
                transition={{
                  duration: 0.35 + i * 0.08,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.05,
                }}
              />
            ))}
          </div>
        )}
        {(state === 'transcribing' || state === 'thinking') && (
          <Loader2 size={22} className="text-amber-400 animate-spin" />
        )}
        {state === 'speaking' && (
          <motion.div
            style={{ width: 18, height: 18, borderRadius: '50%', background: '#22D3EE' }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 0.7, repeat: Infinity }}
          />
        )}

        {/* Countdown ring overlay */}
        {countdown !== null && state === 'idle' && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={ORB_SIZE}
            height={ORB_SIZE}
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle
              cx={ORB_SIZE / 2}
              cy={ORB_SIZE / 2}
              r={ORB_SIZE / 2 - 4}
              fill="none"
              stroke="#8B5CF6"
              strokeWidth="2"
              strokeOpacity="0.5"
              strokeDasharray={`${2 * Math.PI * (ORB_SIZE / 2 - 4)}`}
              strokeDashoffset={`${2 * Math.PI * (ORB_SIZE / 2 - 4) * (1 - countdown / 10)}`}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
        )}
      </motion.button>
    </div>
  )

  return createPortal(orbContent, document.body) as ReactElement
}
