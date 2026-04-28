import { useState, useRef, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  Square,
  BookOpen,
  X,
  MessageSquare,
  Plus,
  Trash2,
  Sparkles,
  RotateCcw,
  Clipboard,
  Bookmark,
  BookmarkCheck,
  Paperclip,
  Image,
  Mic,
  Cpu,
  Wand2,
  ChevronDown,
  Search,
  CheckSquare,
  Square as SquareIcon,
  Pin,
  PinOff,
  Trash,
  MoreHorizontal,
} from 'lucide-react'
import { OllamaBanner } from '../../components/OllamaBanner'
import { useOllamaStatus } from '../../hooks/useOllamaStatus'
import { renderMarkdown } from '../../lib/markdown'
import { toast } from 'sonner'

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

type Attachment = {
  type: 'image'
  name: string
  dataUrl: string
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  streaming?: boolean
  attachments?: Attachment[]
}

type Thread = {
  id: string
  startedAt: number
  lastMessageAt?: number
  title?: string
  messageCount?: number
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

const SUGGESTIONS = [
  { label: 'Summarise my recent activity', icon: '⚡' },
  { label: "What's in my knowledge base?", icon: '📚' },
  { label: 'Help me write something', icon: '✍️' },
  { label: "What are today's top news stories?", icon: '📰' },
] as const

function ThinkingDots(): ReactElement {
  return (
    <motion.span
      className="inline-flex items-center gap-[5px]"
      aria-label="Thinking"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.18 } } }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--color-accent-mid)',
            display: 'inline-block',
          }}
          variants={{
            hidden: { opacity: 0.15, y: 0, scale: 0.8 },
            visible: {
              opacity: [0.15, 1, 0.15],
              y: [0, -4, 0],
              scale: [0.8, 1.2, 0.8],
              transition: { duration: 1.0, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 },
            },
          }}
        />
      ))}
    </motion.span>
  )
}

function StreamingMessage({ content }: { content: string }): ReactElement {
  return (
    <div className="prose-auralith relative">
      {renderMarkdown(content)}
      <span
        style={{
          width: 2,
          height: 13,
          background: 'var(--color-accent-mid)',
          animation: 'cursor-blink 0.9s ease-in-out infinite',
          display: 'inline-block',
          borderRadius: 1,
          marginLeft: 2,
          verticalAlign: 'middle',
        }}
      />
    </div>
  )
}

function cleanAssistantContent(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      // Handle {"type":"speak","text":"..."} envelope
      if (parsed['type'] === 'speak' && typeof parsed['text'] === 'string')
        return parsed['text'] as string
      // {"speak":"..."} envelope
      if (typeof parsed['speak'] === 'string') return parsed['speak'] as string
      // {"response":"..."} envelope
      if (typeof parsed['response'] === 'string') return parsed['response'] as string
    } catch {
      /* fall through */
    }
  }
  return raw
}

// ── Inline ghost button ──────────────────────────────────────────────────────

function MsgBtn({
  icon,
  label,
  onClick,
}: {
  icon: ReactElement
  label: string
  onClick?: () => void
}): ReactElement {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-all"
      style={{
        color: 'var(--color-text-tertiary)',
        border: '1px solid transparent',
        background: 'transparent',
        fontFamily: 'var(--font-sans)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
        e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
        e.currentTarget.style.color = 'var(--color-text-secondary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'transparent'
        e.currentTarget.style.color = 'var(--color-text-tertiary)'
      }}
    >
      {icon}
      {label}
    </button>
  )
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
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [threadSearch, setThreadSearch] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showFooterPicker, setShowFooterPicker] = useState(false)
  const [bookmarkedThreads, setBookmarkedThreads] = useState<Set<string>>(new Set())
  const [pinnedThreads, setPinnedThreads] = useState<Set<string>>(new Set())
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const [openContextMenuId, setOpenContextMenuId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pendingAttachmentsRef = useRef<Attachment[]>([])
  const { status: ollamaStatus, retry: retryOllama } = useOllamaStatus()

  useEffect(() => {
    void (async () => {
      const [modelsRes, modelSettingRes, bookmarksRes, pinnedRes] = await Promise.all([
        window.auralith.invoke('ollama.listModels', {}),
        window.auralith.invoke('settings.get', { key: 'assistant.selectedModel' }),
        window.auralith.invoke('settings.get', { key: 'assistant.bookmarkedThreads' }),
        window.auralith.invoke('settings.get', { key: 'assistant.pinnedThreads' }),
      ])
      if (modelsRes.ok) {
        const data = modelsRes.data as { models: Array<{ name: string }> }
        const names = data.models.map((m) => m.name)
        if (names.length) {
          setAvailableModels(names)
          const saved = modelSettingRes.ok
            ? (modelSettingRes.data as { value: unknown }).value
            : null
          const initial = typeof saved === 'string' && names.includes(saved) ? saved : names[0]
          setSelectedModel(initial ?? '')
        }
      }
      if (bookmarksRes.ok) {
        const saved = (bookmarksRes.data as { value: unknown }).value
        if (Array.isArray(saved)) setBookmarkedThreads(new Set(saved as string[]))
      }
      if (pinnedRes.ok) {
        const saved = (pinnedRes.data as { value: unknown }).value
        if (Array.isArray(saved)) setPinnedThreads(new Set(saved as string[]))
      }
    })()
  }, [])

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
    if (!res.ok) {
      toast.error('Failed to load thread')
      return
    }
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

  const deleteThread = useCallback(
    async (threadId: string) => {
      const res = await window.auralith.invoke('assistant.deleteSession', { sessionId: threadId })
      if (res.ok) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId))
        if (activeThreadId === threadId) {
          startNewThread()
        }
        setDeletingThreadId(null)
        toast.success('Thread deleted')
      } else {
        toast.error('Failed to delete thread')
        setDeletingThreadId(null)
      }
    },
    [activeThreadId, startNewThread],
  )

  const deleteSelectedThreads = useCallback(async () => {
    const ids = Array.from(selectedThreadIds)
    await Promise.all(
      ids.map((id) => window.auralith.invoke('assistant.deleteSession', { sessionId: id })),
    )
    setThreads((prev) => prev.filter((t) => !selectedThreadIds.has(t.id)))
    if (activeThreadId && selectedThreadIds.has(activeThreadId)) startNewThread()
    setSelectedThreadIds(new Set())
    setIsSelectMode(false)
    toast.success(`${ids.length} thread${ids.length === 1 ? '' : 's'} deleted`)
  }, [selectedThreadIds, activeThreadId, startNewThread])

  const deleteAllThreads = useCallback(async () => {
    const res = await window.auralith.invoke('assistant.deleteAllSessions', {})
    if (res.ok) {
      setThreads([])
      startNewThread()
      setPinnedThreads(new Set())
      setBookmarkedThreads(new Set())
      void window.auralith.invoke('settings.set', { key: 'assistant.pinnedThreads', value: [] })
      void window.auralith.invoke('settings.set', { key: 'assistant.bookmarkedThreads', value: [] })
      setShowDeleteAllConfirm(false)
      toast.success('All threads cleared')
    } else {
      toast.error('Failed to clear threads')
    }
  }, [startNewThread])

  const togglePin = useCallback((threadId: string) => {
    setPinnedThreads((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) {
        next.delete(threadId)
        toast('Thread unpinned')
      } else {
        next.add(threadId)
        toast('Thread pinned')
      }
      void window.auralith.invoke('settings.set', {
        key: 'assistant.pinnedThreads',
        value: Array.from(next),
      })
      return next
    })
  }, [])

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
    const isCurrentlyStreaming = messages.some((m) => m.streaming)
    if (isCurrentlyStreaming && scrollContainerRef.current) {
      const el = scrollContainerRef.current
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      if (isNearBottom) el.scrollTop = el.scrollHeight
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [input])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || activeMessageId) return
    setInput('')

    const attachments =
      pendingAttachmentsRef.current.length > 0 ? [...pendingAttachmentsRef.current] : undefined
    pendingAttachmentsRef.current = []

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      ...(attachments ? { attachments } : {}),
    }
    const assistantMsgId = `a-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setActiveMessageId(assistantMsgId)

    await window.auralith.invoke('settings.set', {
      key: 'assistant.selectedModel',
      value: selectedModel,
    })

    const res = await window.auralith.invoke('assistant.send', {
      message: text,
      messageId: assistantMsgId,
      ...(selectedModel ? { model: selectedModel } : {}),
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
  }, [activeMessageId, activeThreadId, input, loadThreads, selectedModel])

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
    setTimeout(() => setSelectedCitation(null), 260)
  }

  function handleCopy(message: Message) {
    const text = cleanAssistantContent(message.content)
    void navigator.clipboard.writeText(text)
    setCopiedId(message.id)
    toast.success('Copied')
    setTimeout(() => setCopiedId(null), 1500)
  }

  function handleRegenerate(message: Message) {
    // Find the user message before this assistant message
    const idx = messages.findIndex((m) => m.id === message.id)
    const userMsg = messages
      .slice(0, idx)
      .reverse()
      .find((m) => m.role === 'user')
    if (!userMsg || activeMessageId) return
    setInput(userMsg.content)
    textareaRef.current?.focus()
  }

  function renderContent(content: string, citations?: Citation[]): ReactElement {
    if (!citations?.length) return <div className="prose-auralith">{renderMarkdown(content)}</div>
    const parts = content.split(/(\[\^\d+\])/g)
    return (
      <div className="prose-auralith">
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
                  background: 'rgba(139,92,246,0.18)',
                  border: '1px solid rgba(139,92,246,0.28)',
                  borderRadius: 5,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-accent-mid)',
                  transition: 'background 100ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(139,92,246,0.32)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(139,92,246,0.18)'
                }}
                title={cite?.docTitle}
              >
                {n}
              </button>
            )
          }
          return <span key={i}>{renderMarkdown(part)}</span>
        })}
      </div>
    )
  }

  // Active thread for display
  const activeThread = threads.find((t) => t.id === activeThreadId)

  return (
    <div className="flex h-full">
      {/* ── Thread sidebar ──────────────────────────────────────────────── */}
      <aside
        className="flex w-[272px] shrink-0 flex-col"
        style={{
          borderRight: '1px solid var(--color-border-hairline)',
          background: 'rgba(10,10,16,0.82)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
        onClick={() => setOpenContextMenuId(null)}
      >
        {/* Header */}
        <div
          className="px-4 pt-5 pb-3"
          style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                color: 'var(--color-text-primary)',
              }}
            >
              Threads
            </h1>
            {/* Header action buttons */}
            <div className="flex items-center gap-1">
              {/* Select mode toggle */}
              <button
                onClick={() => {
                  setIsSelectMode((v) => {
                    if (v) setSelectedThreadIds(new Set())
                    return !v
                  })
                }}
                title={isSelectMode ? 'Cancel selection' : 'Select threads'}
                className="flex h-7 w-7 items-center justify-center rounded-lg transition"
                style={{
                  background: isSelectMode ? 'rgba(139,92,246,0.15)' : 'transparent',
                  color: isSelectMode ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
                  border: isSelectMode
                    ? '1px solid var(--color-border-accent)'
                    : '1px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isSelectMode) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelectMode) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--color-text-tertiary)'
                  }
                }}
              >
                <CheckSquare size={13} />
              </button>
              {/* Delete all */}
              {threads.length > 0 && !isSelectMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDeleteAllConfirm(true)
                  }}
                  title="Delete all threads"
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition"
                  style={{
                    background: 'transparent',
                    color: 'var(--color-text-tertiary)',
                    border: '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(248,113,113,0.10)'
                    e.currentTarget.style.color = 'var(--color-state-danger)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--color-text-tertiary)'
                  }}
                >
                  <Trash size={13} />
                </button>
              )}
            </div>
          </div>

          {/* New thread button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={startNewThread}
            disabled={activeMessageId !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition disabled:opacity-40"
            style={{
              background: 'var(--color-accent-gradient)',
              color: '#fff',
              boxShadow: '0 2px 12px rgba(139,92,246,0.35)',
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New thread
          </motion.button>

          {/* Search */}
          <div className="relative mt-2">
            <Search
              size={12}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-text-tertiary)' }}
            />
            <input
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search threads…"
              className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none"
              style={{
                border: '1px solid var(--color-border-hairline)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
              }}
            />
            {threadSearch && (
              <button
                onClick={() => setThreadSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Select mode action bar */}
        <AnimatePresence>
          {isSelectMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="overflow-hidden"
            >
              <div
                className="flex items-center justify-between px-4 py-2"
                style={{
                  borderBottom: '1px solid var(--color-border-hairline)',
                  background: 'rgba(139,92,246,0.06)',
                }}
              >
                <button
                  onClick={() => {
                    const filtered = threads.filter(
                      (t) =>
                        !threadSearch ||
                        (t.title ?? '').toLowerCase().includes(threadSearch.toLowerCase()),
                    )
                    const allSelected = filtered.every((t) => selectedThreadIds.has(t.id))
                    if (allSelected) {
                      setSelectedThreadIds(new Set())
                    } else {
                      setSelectedThreadIds(new Set(filtered.map((t) => t.id)))
                    }
                  }}
                  className="text-[11px] font-medium"
                  style={{ color: 'var(--color-accent-mid)' }}
                >
                  {selectedThreadIds.size > 0 ? `${selectedThreadIds.size} selected` : 'Select all'}
                </button>
                {selectedThreadIds.size > 0 && (
                  <button
                    onClick={() => void deleteSelectedThreads()}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-white transition"
                    style={{ background: 'var(--color-state-danger)' }}
                  >
                    <Trash2 size={11} />
                    Delete ({selectedThreadIds.size})
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete all confirm */}
        <AnimatePresence>
          {showDeleteAllConfirm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="overflow-hidden"
            >
              <div
                className="px-4 py-3"
                style={{
                  background: 'rgba(248,113,113,0.07)',
                  borderBottom: '1px solid rgba(248,113,113,0.15)',
                }}
              >
                <p
                  className="mb-2 text-xs font-medium"
                  style={{ color: 'var(--color-state-danger)' }}
                >
                  Delete all {threads.length} threads? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void deleteAllThreads()}
                    className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: 'var(--color-state-danger)' }}
                  >
                    Delete all
                  </button>
                  <button
                    onClick={() => setShowDeleteAllConfirm(false)}
                    className="flex-1 rounded-lg py-1.5 text-xs transition-colors"
                    style={{
                      border: '1px solid var(--color-border-hairline)',
                      background: 'transparent',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {threadsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-16 skeleton rounded-xl" />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed px-4 py-6 text-center"
              style={{ borderColor: 'var(--color-border-hairline)' }}
            >
              <MessageSquare
                className="mx-auto mb-2 h-5 w-5"
                style={{ color: 'var(--color-text-tertiary)' }}
              />
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                No saved threads yet
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Your first message will create one automatically.
              </p>
            </div>
          ) : (
            (() => {
              const filtered = threads.filter(
                (t) =>
                  !threadSearch ||
                  (t.title ?? '').toLowerCase().includes(threadSearch.toLowerCase()),
              )
              const pinnedList = filtered.filter((t) => pinnedThreads.has(t.id))
              const unpinnedList = filtered.filter((t) => !pinnedThreads.has(t.id))

              function renderThread(thread: Thread) {
                const active = activeThreadId === thread.id
                const isDeleting = deletingThreadId === thread.id
                const isSelected = selectedThreadIds.has(thread.id)
                const isPinned = pinnedThreads.has(thread.id)
                const menuOpen = openContextMenuId === thread.id

                return (
                  <motion.div
                    key={thread.id}
                    variants={{
                      hidden: { opacity: 0, y: 4 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.16 } },
                    }}
                    className="group relative rounded-xl transition-all"
                    style={{
                      border: active
                        ? '1px solid var(--color-border-accent)'
                        : isSelected
                          ? '1px solid rgba(139,92,246,0.4)'
                          : '1px solid var(--color-border-hairline)',
                      background: isDeleting
                        ? 'rgba(248,113,113,0.07)'
                        : isSelected
                          ? 'rgba(139,92,246,0.08)'
                          : active
                            ? 'rgba(139,92,246,0.10)'
                            : 'rgba(255,255,255,0.025)',
                      opacity: activeMessageId && !active ? 0.6 : 1,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenContextMenuId(null)
                    }}
                  >
                    {isDeleting ? (
                      <div className="px-3 py-3">
                        <p
                          className="text-xs font-medium mb-2.5"
                          style={{ color: 'var(--color-state-danger)' }}
                        >
                          Delete this thread?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => void deleteThread(thread.id)}
                            className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                            style={{ background: 'var(--color-state-danger)' }}
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeletingThreadId(null)}
                            className="flex-1 rounded-lg py-1.5 text-xs transition-colors"
                            style={{
                              border: '1px solid var(--color-border-hairline)',
                              background: 'transparent',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Main row */}
                        <div className="flex items-start px-3 py-2.5">
                          {/* Checkbox in select mode */}
                          {isSelectMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedThreadIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(thread.id)) next.delete(thread.id)
                                  else next.add(thread.id)
                                  return next
                                })
                              }}
                              className="mr-2 mt-0.5 shrink-0"
                              style={{
                                color: isSelected
                                  ? 'var(--color-accent-mid)'
                                  : 'var(--color-text-tertiary)',
                              }}
                            >
                              {isSelected ? <CheckSquare size={14} /> : <SquareIcon size={14} />}
                            </button>
                          )}

                          {/* Pin indicator */}
                          {isPinned && !isSelectMode && (
                            <Pin
                              size={10}
                              className="mr-1.5 mt-1 shrink-0"
                              style={{ color: 'var(--color-accent-mid)', opacity: 0.7 }}
                            />
                          )}

                          {/* Thread content button */}
                          <button
                            onClick={() => {
                              if (isSelectMode) {
                                setSelectedThreadIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(thread.id)) next.delete(thread.id)
                                  else next.add(thread.id)
                                  return next
                                })
                              } else if (!activeMessageId) {
                                void loadThread(thread.id)
                              }
                            }}
                            className="min-w-0 flex-1 text-left"
                            style={{
                              cursor: !isSelectMode && activeMessageId ? 'not-allowed' : 'default',
                            }}
                          >
                            <p
                              className="truncate text-[13px] font-medium"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              {thread.title?.trim() || 'Untitled thread'}
                            </p>
                            <p
                              className="mt-0.5 text-[11px]"
                              style={{ color: 'var(--color-text-tertiary)' }}
                            >
                              {thread.messageCount ?? 0} msg{thread.messageCount === 1 ? '' : 's'}
                              {' · '}
                              {formatThreadLabel(thread)}
                            </p>
                          </button>

                          {/* Action buttons — visible on hover or when menu open */}
                          {!isSelectMode && !activeMessageId && (
                            <div
                              className={`flex items-center gap-0.5 ml-1 shrink-0 transition-opacity ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            >
                              {/* Context menu trigger */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenContextMenuId(menuOpen ? null : thread.id)
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md transition"
                                style={{ color: 'var(--color-text-tertiary)' }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent'
                                  e.currentTarget.style.color = 'var(--color-text-tertiary)'
                                }}
                                aria-label="Thread options"
                              >
                                <MoreHorizontal size={13} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Context menu */}
                        <AnimatePresence>
                          {menuOpen && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.94, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.94, y: -4 }}
                              transition={{ duration: 0.12 }}
                              className="absolute right-2 top-9 z-50 rounded-xl overflow-hidden"
                              style={{
                                border: '1px solid var(--color-border-subtle)',
                                background: 'rgba(18,18,26,0.97)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                minWidth: 160,
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Pin / Unpin */}
                              <button
                                onClick={() => {
                                  togglePin(thread.id)
                                  setOpenContextMenuId(null)
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition"
                                style={{ color: 'var(--color-text-secondary)' }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent'
                                }}
                              >
                                {isPinned ? (
                                  <PinOff
                                    size={13}
                                    style={{ color: 'var(--color-text-tertiary)' }}
                                  />
                                ) : (
                                  <Pin size={13} style={{ color: 'var(--color-text-tertiary)' }} />
                                )}
                                {isPinned ? 'Unpin thread' : 'Pin thread'}
                              </button>

                              {/* Bookmark */}
                              <button
                                onClick={() => {
                                  setBookmarkedThreads((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(thread.id)) {
                                      next.delete(thread.id)
                                      toast('Bookmark removed')
                                    } else {
                                      next.add(thread.id)
                                      toast('Thread bookmarked')
                                    }
                                    void window.auralith.invoke('settings.set', {
                                      key: 'assistant.bookmarkedThreads',
                                      value: Array.from(next),
                                    })
                                    return next
                                  })
                                  setOpenContextMenuId(null)
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition"
                                style={{ color: 'var(--color-text-secondary)' }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent'
                                }}
                              >
                                {bookmarkedThreads.has(thread.id) ? (
                                  <BookmarkCheck
                                    size={13}
                                    style={{ color: 'var(--color-accent-mid)' }}
                                  />
                                ) : (
                                  <Bookmark
                                    size={13}
                                    style={{ color: 'var(--color-text-tertiary)' }}
                                  />
                                )}
                                {bookmarkedThreads.has(thread.id) ? 'Remove bookmark' : 'Bookmark'}
                              </button>

                              <div
                                style={{
                                  height: 1,
                                  background: 'var(--color-border-hairline)',
                                  margin: '2px 0',
                                }}
                              />

                              {/* Delete */}
                              <button
                                onClick={() => {
                                  setDeletingThreadId(thread.id)
                                  setOpenContextMenuId(null)
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition"
                                style={{ color: 'var(--color-state-danger)' }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(248,113,113,0.08)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent'
                                }}
                              >
                                <Trash2 size={13} />
                                Delete thread
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </motion.div>
                )
              }

              return (
                <div className="flex flex-col gap-3">
                  {/* Pinned section */}
                  {pinnedList.length > 0 && (
                    <div>
                      <p
                        className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest"
                        style={{
                          color: 'var(--color-text-tertiary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        Pinned
                      </p>
                      <motion.div
                        className="flex flex-col gap-1"
                        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
                        initial="hidden"
                        animate="visible"
                      >
                        {pinnedList.map(renderThread)}
                      </motion.div>
                    </div>
                  )}

                  {/* Recent section */}
                  {unpinnedList.length > 0 && (
                    <div>
                      {pinnedList.length > 0 && (
                        <p
                          className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest"
                          style={{
                            color: 'var(--color-text-tertiary)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          Recent
                        </p>
                      )}
                      <motion.div
                        className="flex flex-col gap-1"
                        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
                        initial="hidden"
                        animate="visible"
                      >
                        {unpinnedList.map(renderThread)}
                      </motion.div>
                    </div>
                  )}

                  {filtered.length === 0 && threadSearch && (
                    <div className="py-6 text-center">
                      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        No threads match "{threadSearch}"
                      </p>
                    </div>
                  )}
                </div>
              )
            })()
          )}
        </div>
      </aside>

      {/* ── Chat area ───────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1">
        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence>
            {ollamaStatus === 'offline' && <OllamaBanner onRetry={retryOllama} />}
          </AnimatePresence>

          {/* Conversation header */}
          {activeThread && messages.length > 0 && (
            <div
              className="flex shrink-0 items-center justify-between px-8 py-3"
              style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                    fontWeight: 500,
                    letterSpacing: '-0.01em',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {activeThread.title?.trim() || 'Untitled thread'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  {activeThread.messageCount ?? messages.length} messages
                  {activeThread.lastMessageAt
                    ? ` · ${new Date(activeThread.lastMessageAt).toLocaleDateString()}`
                    : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setShowModelPicker((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition"
                  style={{
                    border: `1px solid ${showModelPicker ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                    background: showModelPicker ? 'rgba(139,92,246,0.10)' : 'transparent',
                    color: showModelPicker
                      ? 'var(--color-accent-mid)'
                      : 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                  onMouseEnter={(e) => {
                    if (!showModelPicker) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      e.currentTarget.style.color = 'var(--color-text-secondary)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!showModelPicker) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--color-text-tertiary)'
                    }
                  }}
                >
                  <Cpu className="h-3 w-3" />
                  {selectedModel.split(':')[0].replace(/^[^/]*\//, '')}
                </button>
                <button
                  onClick={() => {
                    if (!activeThreadId) return
                    setBookmarkedThreads((prev) => {
                      const next = new Set(prev)
                      if (next.has(activeThreadId)) {
                        next.delete(activeThreadId)
                        toast('Bookmark removed')
                      } else {
                        next.add(activeThreadId)
                        toast('Thread bookmarked')
                      }
                      void window.auralith.invoke('settings.set', {
                        key: 'assistant.bookmarkedThreads',
                        value: Array.from(next),
                      })
                      return next
                    })
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition"
                  style={{
                    border: `1px solid ${activeThreadId && bookmarkedThreads.has(activeThreadId) ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                    background:
                      activeThreadId && bookmarkedThreads.has(activeThreadId)
                        ? 'rgba(139,92,246,0.12)'
                        : 'transparent',
                    color:
                      activeThreadId && bookmarkedThreads.has(activeThreadId)
                        ? 'var(--color-accent-mid)'
                        : 'var(--color-text-tertiary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!(activeThreadId && bookmarkedThreads.has(activeThreadId))) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      e.currentTarget.style.color = 'var(--color-accent-mid)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(activeThreadId && bookmarkedThreads.has(activeThreadId))) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--color-text-tertiary)'
                    }
                  }}
                  aria-label="Bookmark thread"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Model picker dropdown */}
          <AnimatePresence>
            {showModelPicker && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="shrink-0 border-b px-6 py-3"
                style={{
                  borderColor: 'var(--color-border-hairline)',
                  background: 'rgba(14,14,20,0.8)',
                }}
              >
                <p
                  className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}
                >
                  Select model
                </p>
                <div className="flex flex-wrap gap-2">
                  {(availableModels.length ? availableModels : [selectedModel]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setSelectedModel(m)
                        setShowModelPicker(false)
                        void window.auralith.invoke('settings.set', {
                          key: 'assistant.selectedModel',
                          value: m,
                        })
                      }}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 8,
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        border: `1px solid ${selectedModel === m ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                        background:
                          selectedModel === m ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
                        color:
                          selectedModel === m
                            ? 'var(--color-accent-mid)'
                            : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 140ms ease',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-8 py-8">
            {messages.length === 0 ? (
              <motion.div
                className="flex h-full items-center justify-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className="text-center">
                  <motion.div
                    className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
                    style={{
                      background: 'var(--color-accent-gradient)',
                      boxShadow: '0 8px 32px rgba(139,92,246,0.4)',
                    }}
                    animate={{
                      boxShadow: [
                        '0 8px 32px rgba(139,92,246,0.4)',
                        '0 8px 40px rgba(139,92,246,0.6)',
                        '0 8px 32px rgba(139,92,246,0.4)',
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Sparkles size={22} className="text-white" />
                  </motion.div>
                  <p
                    className="text-xl font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    Ask anything
                  </p>
                  <p className="mt-1.5 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    Answers are grounded in your Knowledge spaces and saved by thread.
                  </p>
                  <motion.div
                    className="mt-6 flex flex-wrap justify-center gap-2"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      visible: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
                    }}
                  >
                    {SUGGESTIONS.map((s) => (
                      <motion.button
                        key={s.label}
                        variants={{
                          hidden: { opacity: 0, y: 8, scale: 0.94 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] },
                          },
                        }}
                        whileHover={{ scale: 1.03, y: -1 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setInput(s.label)
                          textareaRef.current?.focus()
                        }}
                        className="flex items-center gap-1.5 text-xs transition-all"
                        style={{
                          padding: '7px 14px',
                          borderRadius: 20,
                          border: '1px solid var(--color-border-subtle)',
                          background: 'rgba(255,255,255,0.03)',
                          color: 'var(--color-text-secondary)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(139,92,246,0.10)'
                          e.currentTarget.style.borderColor = 'var(--color-border-accent)'
                          e.currentTarget.style.color = 'var(--color-text-primary)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                          e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                          e.currentTarget.style.color = 'var(--color-text-secondary)'
                        }}
                      >
                        <span>{s.icon}</span>
                        {s.label}
                      </motion.button>
                    ))}
                  </motion.div>
                </div>
              </motion.div>
            ) : (
              <div className="mx-auto flex max-w-[720px] flex-col gap-5">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                      className={
                        message.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                      }
                    >
                      {message.role === 'user' ? (
                        <div className="flex max-w-[72%] flex-col items-end gap-1.5">
                          {/* Inline image attachments */}
                          {message.attachments?.map((att, ai) =>
                            att.type === 'image' ? (
                              <img
                                key={ai}
                                src={att.dataUrl}
                                alt={att.name}
                                title={att.name}
                                className="rounded-xl"
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: 320,
                                  objectFit: 'contain',
                                  border: '1px solid rgba(139,92,246,0.25)',
                                  display: 'block',
                                }}
                              />
                            ) : null,
                          )}
                          <div
                            data-testid="user-message"
                            className="text-[13px] leading-relaxed"
                            style={{
                              padding: '10px 16px',
                              borderRadius: '16px 16px 4px 16px',
                              background: 'rgba(139,92,246,0.18)',
                              border: '1px solid rgba(139,92,246,0.22)',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            {message.content}
                          </div>
                        </div>
                      ) : (
                        <div data-testid="assistant-message" className="max-w-[88%]">
                          {/* Avatar row */}
                          <div className="mb-2 flex items-center gap-2">
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                background: 'var(--color-accent-gradient)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
                              }}
                            >
                              <Sparkles size={12} className="text-white" />
                            </div>
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              Auralith
                            </span>
                          </div>

                          <div
                            className="text-[13px] leading-[1.65]"
                            style={{
                              padding: '14px 18px',
                              borderRadius: '4px 16px 16px 16px',
                              background: 'rgba(255,255,255,0.035)',
                              border: '1px solid var(--color-border-hairline)',
                              color: 'var(--color-text-primary)',
                            }}
                          >
                            {message.streaming ? (
                              message.content === '' ? (
                                <ThinkingDots />
                              ) : (
                                <StreamingMessage
                                  content={cleanAssistantContent(message.content)}
                                />
                              )
                            ) : (
                              renderContent(
                                cleanAssistantContent(message.content),
                                message.citations,
                              )
                            )}
                          </div>

                          {/* Citations */}
                          <AnimatePresence>
                            {message.citations &&
                              message.citations.length > 0 &&
                              !message.streaming && (
                                <motion.div
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                                  className="mt-2 flex flex-wrap gap-1.5 pt-2"
                                  style={{ borderTop: '1px solid var(--color-border-hairline)' }}
                                >
                                  {message.citations.map((citation, citIdx) => (
                                    <motion.button
                                      key={citation.chunkId}
                                      initial={{ opacity: 0, scale: 0.9 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      transition={{ duration: 0.15, delay: citIdx * 0.05 }}
                                      whileHover={{ scale: 1.04, y: -1 }}
                                      whileTap={{ scale: 0.97 }}
                                      onClick={() => openCitation(citation)}
                                      className="flex items-center gap-1.5 text-[11px]"
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: 8,
                                        border: '1px solid var(--color-border-subtle)',
                                        background: 'rgba(255,255,255,0.03)',
                                        color: 'var(--color-text-secondary)',
                                        transition: 'all 120ms',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(139,92,246,0.10)'
                                        e.currentTarget.style.borderColor =
                                          'var(--color-border-accent)'
                                        e.currentTarget.style.color = 'var(--color-text-primary)'
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                        e.currentTarget.style.borderColor =
                                          'var(--color-border-subtle)'
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
                                    </motion.button>
                                  ))}
                                </motion.div>
                              )}
                          </AnimatePresence>

                          {/* Per-message actions */}
                          {!message.streaming && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.15 }}
                              className="mt-1.5 flex gap-1"
                            >
                              <MsgBtn
                                icon={<RotateCcw className="h-3 w-3" />}
                                label="Regenerate"
                                onClick={() => handleRegenerate(message)}
                              />
                              <MsgBtn
                                icon={<Clipboard className="h-3 w-3" />}
                                label={copiedId === message.id ? 'Copied!' : 'Copy'}
                                onClick={() => handleCopy(message)}
                              />
                              <MsgBtn
                                icon={<Bookmark className="h-3 w-3" />}
                                label="Save"
                                onClick={() => {
                                  void window.auralith
                                    .invoke('brain.ingestText', {
                                      text: message.content,
                                      title: `Saved response — ${new Date().toLocaleString()}`,
                                      spaceId: undefined,
                                    })
                                    .then((res) => {
                                      if (res.ok) toast.success('Saved to Knowledge')
                                      else toast.error('Could not save to Knowledge')
                                    })
                                }}
                              />
                            </motion.div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}

                  {/* Inline tool call display — shown when streaming */}
                  {activeMessageId && (
                    <motion.div
                      key="tool-call"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      style={{
                        marginLeft: 38,
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px dashed var(--color-border-subtle)',
                        fontSize: 11,
                        color: 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          background: 'rgba(251,191,36,0.12)',
                          border: '1px solid rgba(251,191,36,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Wand2 className="h-3.5 w-3.5" style={{ color: '#fbbf24' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            marginBottom: 2,
                          }}
                        >
                          Searching knowledge base…
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          knowledge.search
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* ── Composer ─────────────────────────────────────────────────── */}
          <div
            className="relative z-20 px-8 py-4"
            style={{
              borderTop: '1px solid var(--color-border-hairline)',
              background: 'rgba(7,7,11,0.72)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <div className="mx-auto max-w-[720px]">
              <motion.div
                className="rounded-2xl transition-all"
                animate={
                  inputFocused
                    ? {
                        boxShadow: '0 0 0 3px rgba(139,92,246,0.15)',
                      }
                    : {
                        boxShadow: '0 0 0 0px rgba(139,92,246,0)',
                      }
                }
                style={{
                  border: inputFocused
                    ? '1px solid rgba(139,92,246,0.40)'
                    : '1px solid rgba(255,255,255,0.09)',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 16,
                  padding: '10px 14px',
                }}
              >
                {/* Context chip row */}
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('auralith:navigate', { detail: { section: 'knowledge' } }),
                      )
                    }
                    title="Browse knowledge spaces"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 10px 3px 3px',
                      borderRadius: 8,
                      background: 'rgba(139,92,246,0.10)',
                      border: '1px solid rgba(139,92,246,0.18)',
                      fontSize: 11,
                      color: 'var(--color-accent-mid)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: 'var(--color-accent-gradient)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <BookOpen size={10} className="text-white" />
                    </div>
                    All spaces
                  </button>
                </div>

                {/* Textarea */}
                <textarea
                  data-testid="assistant-input"
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder={
                    ollamaStatus === 'offline'
                      ? 'Local model offline…'
                      : 'Ask something, or say what to do next…'
                  }
                  disabled={ollamaStatus === 'offline'}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-40 w-full"
                  style={{
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-sans)',
                    lineHeight: 1.55,
                    maxHeight: 140,
                    caretColor: 'var(--color-accent-mid)',
                    overflowY: 'hidden',
                    marginBottom: 6,
                  }}
                />

                {/* Hidden file input for attachment */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,.pdf,.png,.jpg,.jpeg,.webp,.gif"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const isImage = file.type.startsWith('image/')
                    if (isImage) {
                      const reader = new FileReader()
                      reader.onload = () => {
                        const dataUrl = reader.result as string
                        pendingAttachmentsRef.current = [
                          ...pendingAttachmentsRef.current,
                          { type: 'image', name: file.name, dataUrl },
                        ]
                        setInput((prev) =>
                          prev ? `${prev}\n\n[Image: ${file.name}]` : `[Image: ${file.name}]`,
                        )
                        toast.success(`Image "${file.name}" attached`)
                      }
                      reader.readAsDataURL(file)
                    } else {
                      setInput((prev) =>
                        prev
                          ? `${prev}\n\nPlease help me with the file I attached: ${file.name}`
                          : `Please help me with the file: ${file.name}`,
                      )
                      toast.success(`File "${file.name}" attached`)
                    }
                    e.target.value = ''
                    textareaRef.current?.focus()
                  }}
                />

                {/* Composer toolbar */}
                <div
                  className="flex items-center gap-1"
                  style={{ borderTop: '1px solid var(--color-border-hairline)', paddingTop: 8 }}
                >
                  {[
                    {
                      icon: <Paperclip className="h-3.5 w-3.5" />,
                      label: 'Attach file',
                      onClick: () => {
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = '.md,.txt,.pdf'
                          fileInputRef.current.click()
                        }
                      },
                    },
                    {
                      icon: <Image className="h-3.5 w-3.5" />,
                      label: 'Attach image',
                      onClick: () => {
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = '.png,.jpg,.jpeg,.webp,.gif'
                          fileInputRef.current.click()
                        }
                      },
                    },
                    {
                      icon: <Mic className="h-3.5 w-3.5" />,
                      label: 'Voice input',
                      onClick: () => window.dispatchEvent(new CustomEvent('auralith:voice-open')),
                    },
                  ].map(({ icon, label, onClick }) => (
                    <button
                      key={label}
                      title={label}
                      aria-label={label}
                      onClick={onClick}
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                        e.currentTarget.style.color = 'var(--color-text-secondary)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--color-text-tertiary)'
                      }}
                    >
                      {icon}
                    </button>
                  ))}

                  <div style={{ flex: 1 }} />

                  {/* Model selector */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowFooterPicker((v) => !v)}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition"
                      style={{
                        border: `1px solid ${showFooterPicker ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                        background: showFooterPicker ? 'rgba(139,92,246,0.10)' : 'transparent',
                        color: showFooterPicker
                          ? 'var(--color-accent-mid)'
                          : 'var(--color-text-tertiary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                      onMouseEnter={(e) => {
                        if (!showFooterPicker) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                          e.currentTarget.style.color = 'var(--color-text-secondary)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showFooterPicker) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--color-text-tertiary)'
                        }
                      }}
                    >
                      <Cpu className="h-3 w-3" />
                      {selectedModel
                        .split(':')[0]
                        .replace(/^[^/]*\//, '')
                        .slice(0, 20)}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </button>
                    <AnimatePresence>
                      {showFooterPicker && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.15 }}
                          style={{
                            position: 'absolute',
                            bottom: 'calc(100% + 8px)',
                            right: 0,
                            minWidth: 180,
                            borderRadius: 10,
                            border: '1px solid var(--color-border-hairline)',
                            background: 'rgba(14,14,20,0.95)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            padding: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            zIndex: 50,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                          }}
                        >
                          <p
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase',
                              color: 'var(--color-text-tertiary)',
                              fontFamily: 'var(--font-mono)',
                              marginBottom: 4,
                              paddingLeft: 4,
                            }}
                          >
                            Model
                          </p>
                          {(availableModels.length ? availableModels : [selectedModel]).map((m) => (
                            <button
                              key={m}
                              onClick={() => {
                                setSelectedModel(m)
                                setShowFooterPicker(false)
                                void window.auralith.invoke('settings.set', {
                                  key: 'assistant.selectedModel',
                                  value: m,
                                })
                              }}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 7,
                                fontSize: 11,
                                fontFamily: 'var(--font-mono)',
                                textAlign: 'left',
                                border: `1px solid ${selectedModel === m ? 'var(--color-border-accent)' : 'transparent'}`,
                                background:
                                  selectedModel === m ? 'rgba(139,92,246,0.12)' : 'transparent',
                                color:
                                  selectedModel === m
                                    ? 'var(--color-accent-mid)'
                                    : 'var(--color-text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 120ms ease',
                              }}
                              onMouseEnter={(e) => {
                                if (selectedModel !== m)
                                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                              }}
                              onMouseLeave={(e) => {
                                if (selectedModel !== m)
                                  e.currentTarget.style.background = 'transparent'
                              }}
                            >
                              {m}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Send / Stop */}
                  {activeMessageId ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => void abort()}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors"
                      style={{ background: 'rgba(248,113,113,0.85)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#ef4444'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(248,113,113,0.85)'
                      }}
                      aria-label="Stop"
                    >
                      <Square className="h-3.5 w-3.5 fill-white text-white" />
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={input.trim() && ollamaStatus !== 'offline' ? { scale: 1.05 } : {}}
                      whileTap={input.trim() && ollamaStatus !== 'offline' ? { scale: 0.95 } : {}}
                      onClick={() => void send()}
                      disabled={!input.trim() || ollamaStatus === 'offline'}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-40"
                      style={{
                        background:
                          input.trim() && ollamaStatus !== 'offline'
                            ? 'var(--color-accent-gradient)'
                            : 'rgba(255,255,255,0.07)',
                        boxShadow:
                          input.trim() && ollamaStatus !== 'offline'
                            ? '0 2px 10px rgba(139,92,246,0.4)'
                            : 'none',
                      }}
                      aria-label="Send"
                    >
                      <Send className="h-3.5 w-3.5 text-white" />
                    </motion.button>
                  )}
                </div>
              </motion.div>
              <p
                className="mt-2 text-center text-[10px]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Shift+Enter for new line · Enter to send
              </p>
            </div>
          </div>
        </div>

        {/* ── Citation panel ───────────────────────────────────────────── */}
        <motion.div
          className="relative z-10 shrink-0 overflow-hidden"
          animate={{ width: citationOpen ? 320 : 0 }}
          transition={{ duration: 0.26, ease: [0, 0, 0.2, 1] }}
          style={{
            borderLeft: '1px solid var(--color-border-hairline)',
            background: 'rgba(12,12,18,0.90)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <AnimatePresence>
            {selectedCitation && citationOpen && (
              <motion.div
                key={selectedCitation.chunkId}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                className="h-full overflow-y-auto"
                style={{ width: 320, padding: 20 }}
              >
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className="mb-1.5 text-[10px] font-bold uppercase"
                      style={{ color: 'var(--color-accent-mid)', letterSpacing: '0.08em' }}
                    >
                      [^{selectedCitation.n}] Source
                    </p>
                    <p
                      className="text-[13px] font-semibold"
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
                    style={{ color: 'var(--color-text-tertiary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
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
                  className="mb-4 text-xs leading-[1.65]"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgba(139,92,246,0.06)',
                    border: '1px solid rgba(139,92,246,0.14)',
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
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
