import { useState, useRef, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Square, BookOpen, X, MessageSquare, Plus } from 'lucide-react'
import { OllamaBanner } from '../../components/OllamaBanner'
import { useOllamaStatus } from '../../hooks/useOllamaStatus'

type Citation = {
  n: number
  chunkId: string
  docPath: string
  docTitle: string
  headingPath: string
  charStart: number
  charEnd: number
  page?: number
  text: string
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  streaming?: boolean
}

type Thread = {
  id: string
  startedAt: number
  lastMessageAt?: number
  title?: string
  messageCount?: number
}

function renderMarkdown(text: string): ReactElement[] {
  return text.split('\n').map((line, i, arr) => {
    const isBullet = line.startsWith('• ')
    const html = (isBullet ? line.slice(2) : line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    return (
      <span key={i}>
        {isBullet ? (
          <span style={{ display: 'block', paddingLeft: 14, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 4, color: 'var(--color-accent-low)' }}>
              •
            </span>
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </span>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {i < arr.length - 1 && <br />}
      </span>
    )
  })
}

function formatThreadLabel(thread: Thread): string {
  const ts = thread.lastMessageAt ?? thread.startedAt
  const date = new Date(ts)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function normalizeThreadMessages(
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; ts: number }>,
): Message[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
  }))
}

export function AssistantScreen(): ReactElement {
  const [threads, setThreads] = useState<Thread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null)
  const [citationOpen, setCitationOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const ollamaStatus = useOllamaStatus()

  const loadThreads = useCallback(async (): Promise<Thread[]> => {
    const res = await window.auralith.invoke('assistant.listSessions', { limit: 20, offset: 0 })
    if (!res.ok) {
      setThreads([])
      return []
    }
    const data = res.data as { sessions: Thread[] }
    setThreads(data.sessions)
    return data.sessions
  }, [])

  const loadThread = useCallback(async (threadId: string) => {
    const res = await window.auralith.invoke('assistant.getSession', { sessionId: threadId })
    if (!res.ok) return
    const data = res.data as {
      sessionId: string
      messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; ts: number }>
    }
    setMessages(normalizeThreadMessages(data.messages))
    setActiveThreadId(threadId)
    setSelectedCitation(null)
    setCitationOpen(false)
    void window.auralith.invoke('settings.set', {
      key: 'assistant.activeThreadId',
      value: threadId,
    })
  }, [])

  const startNewThread = useCallback(() => {
    if (activeMessageId) return
    setMessages([])
    setActiveThreadId(null)
    setSelectedCitation(null)
    setCitationOpen(false)
    void window.auralith.invoke('settings.set', {
      key: 'assistant.activeThreadId',
      value: null,
    })
    textareaRef.current?.focus()
  }, [activeMessageId])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const [threadRows, activeThreadRes] = await Promise.all([
        loadThreads(),
        window.auralith.invoke('settings.get', { key: 'assistant.activeThreadId' }),
      ])

      if (cancelled) return
      setThreadsLoading(false)

      const activeThreadSetting = activeThreadRes.ok
        ? (activeThreadRes.data as { value: unknown }).value
        : undefined
      const savedThreadId =
        typeof activeThreadSetting === 'string' ? activeThreadSetting : undefined
      const nextThreadId =
        savedThreadId && threadRows.some((thread) => thread.id === savedThreadId)
          ? savedThreadId
          : threadRows[0]?.id

      if (nextThreadId) {
        await loadThread(nextThreadId)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loadThread, loadThreads])

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      if (typeof text === 'string') {
        setInput(text)
        textareaRef.current?.focus()
      }
    }

    const handleOpenThread = (event: Event) => {
      const threadId = (event as CustomEvent<string>).detail
      if (typeof threadId === 'string' && threadId.trim()) {
        void loadThread(threadId)
      }
    }

    window.addEventListener('auralith:assistant-prefill', handlePrefill)
    window.addEventListener('auralith:assistant-open-thread', handleOpenThread)
    return () => {
      window.removeEventListener('auralith:assistant-prefill', handlePrefill)
      window.removeEventListener('auralith:assistant-open-thread', handleOpenThread)
    }
  }, [loadThread])

  useEffect(() => {
    const unsubToken = window.auralith.on('assistant:token', (data) => {
      const { messageId, token } = data as { messageId: string; token: string }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, content: message.content + token } : message,
        ),
      )
    })
    const unsubDone = window.auralith.on('assistant:done', (data) => {
      const { messageId, citations } = data as { messageId: string; citations: Citation[] }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, streaming: false, citations } : message,
        ),
      )
      setActiveMessageId(null)
      void loadThreads()
    })
    const unsubError = window.auralith.on('assistant:error', (data) => {
      const { messageId, error } = data as { messageId: string; error: string }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? { ...message, content: `Error: ${error}`, streaming: false }
            : message,
        ),
      )
      setActiveMessageId(null)
      void loadThreads()
    })
    return () => {
      unsubToken()
      unsubDone()
      unsubError()
    }
  }, [loadThreads])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || activeMessageId) return
    setInput('')

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text }
    const assistantMsgId = `a-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setActiveMessageId(assistantMsgId)

    const res = await window.auralith.invoke('assistant.send', {
      message: text,
      messageId: assistantMsgId,
      ...(activeThreadId ? { sessionId: activeThreadId } : {}),
    })

    if (!res.ok) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMsgId
            ? { ...message, content: `Error: ${res.error.message}`, streaming: false }
            : message,
        ),
      )
      setActiveMessageId(null)
      return
    }

    const data = res.data as { sessionId: string }
    setActiveThreadId(data.sessionId)
    void window.auralith.invoke('settings.set', {
      key: 'assistant.activeThreadId',
      value: data.sessionId,
    })
    void loadThreads()
  }, [activeMessageId, activeThreadId, input, loadThreads])

  async function abort() {
    if (!activeMessageId) return
    await window.auralith.invoke('assistant.abort', { messageId: activeMessageId })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  function openCitation(citation: Citation) {
    setSelectedCitation(citation)
    setCitationOpen(true)
  }

  function closeCitation() {
    setCitationOpen(false)
    setTimeout(() => setSelectedCitation(null), 200)
  }

  function renderContent(content: string, citations?: Citation[]): ReactElement {
    if (!citations?.length) return <>{renderMarkdown(content)}</>
    const parts = content.split(/(\[\^\d+\])/g)
    return (
      <>
        {parts.map((part, i) => {
          const match = part.match(/\[\^(\d+)\]/)
          if (match) {
            const label = match[1]
            if (label === undefined) return <span key={i}>{part}</span>
            const n = parseInt(label, 10)
            const cite = citations.find((entry) => entry.n === n)
            return (
              <button
                key={i}
                onClick={() => cite && openCitation(cite)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 16,
                  padding: '0 5px',
                  margin: '0 2px',
                  background: 'rgba(139,92,246,0.20)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-accent-mid)',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(139,92,246,0.35)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(139,92,246,0.20)'
                }}
                title={cite?.docTitle}
              >
                {n}
              </button>
            )
          }
          return <span key={i}>{renderMarkdown(part)}</span>
        })}
      </>
    )
  }

  return (
    <div className="flex h-full">
      <aside
        className="flex w-[280px] shrink-0 flex-col"
        style={{
          borderRight: '1px solid var(--color-border-hairline)',
          background: 'rgba(12,12,18,0.78)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <div
          className="px-4 py-4"
          style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
        >
          <div className="mb-3">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Threads
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Persistent conversations stay available after reload.
            </p>
          </div>
          <button
            onClick={startNewThread}
            disabled={activeMessageId !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition disabled:opacity-40"
            style={{
              background: '#7C3AED',
              color: '#fff',
              border: 'none',
              cursor: 'default',
            }}
          >
            <Plus className="h-4 w-4" />
            New thread
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {threadsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed px-4 py-5 text-center"
              style={{
                borderColor: 'var(--color-border-hairline)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <MessageSquare className="mx-auto mb-2 h-4 w-4" />
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                No saved threads yet
              </p>
              <p className="mt-1 text-xs">Your first message will create one automatically.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {threads.map((thread) => {
                const active = activeThreadId === thread.id
                return (
                  <button
                    key={thread.id}
                    onClick={() => {
                      if (!activeMessageId) void loadThread(thread.id)
                    }}
                    className="rounded-2xl px-3 py-3 text-left transition"
                    style={{
                      border: active
                        ? '1px solid var(--color-border-accent)'
                        : '1px solid var(--color-border-hairline)',
                      background: active ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                      cursor: activeMessageId ? 'not-allowed' : 'default',
                      opacity: activeMessageId && !active ? 0.65 : 1,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-medium"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {thread.title?.trim() || 'Untitled thread'}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                          {thread.messageCount ?? 0} message{thread.messageCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-[11px]"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {formatThreadLabel(thread)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1">
        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          {ollamaStatus === 'offline' && <OllamaBanner />}

          <div className="flex-1 overflow-y-auto px-8 py-8">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div
                    className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px]"
                    style={{
                      background: 'var(--color-accent-gradient)',
                      boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
                    }}
                  >
                    <MessageSquare size={20} className="text-white" />
                  </div>
                  <p
                    className="text-xl font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    Ask anything
                  </p>
                  <p className="mt-1.5 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    Answers are grounded in your Knowledge spaces and saved by thread.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-[720px] flex-col gap-5">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                      className={
                        message.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                      }
                    >
                      {message.role === 'user' ? (
                        <div
                          data-testid="user-message"
                          className="max-w-[72%] text-sm leading-relaxed"
                          style={{
                            padding: '10px 16px',
                            borderRadius: '16px 16px 4px 16px',
                            background: 'rgba(139,92,246,0.20)',
                            border: '1px solid rgba(139,92,246,0.25)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {message.content}
                        </div>
                      ) : (
                        <div data-testid="assistant-message" className="max-w-[85%]">
                          <div
                            className="text-[13px] leading-[1.65]"
                            style={{
                              padding: '14px 16px',
                              borderRadius: '4px 16px 16px 16px',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid var(--color-border-hairline)',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            {renderContent(message.content, message.citations)}
                            {message.streaming && (
                              <span
                                className="ml-0.5 inline-block align-middle"
                                style={{
                                  width: 2,
                                  height: 14,
                                  background: 'var(--color-accent-mid)',
                                  animation: 'blink 1s step-end infinite',
                                  display: 'inline-block',
                                }}
                              />
                            )}
                          </div>
                          {message.citations &&
                            message.citations.length > 0 &&
                            !message.streaming && (
                              <div
                                className="mt-2 flex flex-wrap gap-1.5 pt-2"
                                style={{ borderTop: '1px solid var(--color-border-hairline)' }}
                              >
                                {message.citations.map((citation) => (
                                  <button
                                    key={citation.chunkId}
                                    onClick={() => openCitation(citation)}
                                    className="flex items-center gap-1.5 text-[11px] transition-all"
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 8,
                                      border: '1px solid var(--color-border-subtle)',
                                      background: 'rgba(255,255,255,0.03)',
                                      color: 'var(--color-text-secondary)',
                                      cursor: 'default',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                                      e.currentTarget.style.color = 'var(--color-text-primary)'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                      e.currentTarget.style.color = 'var(--color-text-secondary)'
                                    }}
                                  >
                                    <BookOpen
                                      className="h-3 w-3 shrink-0"
                                      style={{ color: 'var(--color-accent-mid)' }}
                                    />
                                    <span className="max-w-[160px] truncate">
                                      {citation.docTitle}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div
            className="relative z-20 px-8 py-3"
            style={{
              borderTop: '1px solid var(--color-border-hairline)',
              background: 'rgba(7,7,11,0.60)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <div className="mx-auto max-w-[720px]">
              <div
                className="flex items-end gap-2.5 transition-all"
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'rgba(255,255,255,0.04)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-accent)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <textarea
                  data-testid="assistant-input"
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    ollamaStatus === 'offline' ? 'Local model offline…' : 'Message Auralith…'
                  }
                  disabled={ollamaStatus === 'offline'}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-40"
                  style={{
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-sans)',
                    lineHeight: 1.5,
                    maxHeight: 140,
                    caretColor: 'var(--color-accent-mid)',
                  }}
                />
                {activeMessageId ? (
                  <button
                    onClick={() => void abort()}
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] transition-colors"
                    style={{
                      background: 'rgba(248,113,113,0.8)',
                      border: 'none',
                      cursor: 'default',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ef4444'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(248,113,113,0.8)'
                    }}
                    aria-label="Stop"
                  >
                    <Square className="h-3.5 w-3.5 fill-white text-white" />
                  </button>
                ) : (
                  <button
                    onClick={() => void send()}
                    disabled={!input.trim() || ollamaStatus === 'offline'}
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] transition-colors disabled:opacity-40"
                    style={{
                      background:
                        input.trim() && ollamaStatus !== 'offline'
                          ? 'var(--color-accent-low)'
                          : 'rgba(255,255,255,0.08)',
                      border: 'none',
                      cursor: 'default',
                    }}
                    aria-label="Send"
                  >
                    <Send className="h-3.5 w-3.5 text-white" />
                  </button>
                )}
              </div>
              <p
                className="mt-1.5 text-center text-[10px]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Shift+Enter for new line · Enter to send
              </p>
            </div>
          </div>
        </div>

        <div
          className="relative z-10 shrink-0 overflow-hidden transition-all"
          style={{
            width: citationOpen ? 'var(--panel-right-width)' : 0,
            transitionDuration: '260ms',
            transitionTimingFunction: 'cubic-bezier(0,0,0.2,1)',
            borderLeft: '1px solid var(--color-border-hairline)',
            background: 'rgba(14,14,20,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          {selectedCitation && (
            <div
              className="h-full overflow-y-auto transition-opacity"
              style={{
                width: 'var(--panel-right-width)',
                padding: 20,
                opacity: citationOpen ? 1 : 0,
                transitionDuration: '180ms',
              }}
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className="mb-1 text-[10px] font-bold uppercase"
                    style={{ color: 'var(--color-accent-mid)', letterSpacing: '0.06em' }}
                  >
                    [^{selectedCitation.n}] Source
                  </p>
                  <p
                    className="text-[13px] font-medium"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {selectedCitation.docTitle}
                  </p>
                  {selectedCitation.headingPath && (
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {selectedCitation.headingPath}
                    </p>
                  )}
                  {selectedCitation.page && (
                    <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      Page {selectedCitation.page}
                    </p>
                  )}
                </div>
                <button
                  onClick={closeCitation}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                  style={{
                    color: 'var(--color-text-tertiary)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'default',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div
                className="mb-3 text-xs leading-[1.65]"
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--color-border-hairline)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {selectedCitation.text}
              </div>
              <p
                className="break-all font-mono text-[10px]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {selectedCitation.docPath}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
