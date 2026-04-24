import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

type GraphNode = {
  id: string
  label: string
  kind: 'space' | 'doc' | 'chunk' | 'event'
  size?: number
  x?: number
  y?: number
  vx?: number
  vy?: number
}

type GraphEdge = {
  source: string
  target: string
  kind: 'space->doc' | 'doc->chunk' | 'chunk->event'
}

type SimNode = GraphNode & Required<Pick<GraphNode, 'x' | 'y' | 'vx' | 'vy'>>

const KIND_COLOR: Record<GraphNode['kind'], string> = {
  space: '#a78bfa',
  doc: '#60a5fa',
  chunk: '#34d399',
  event: '#fb923c',
}

const REPULSION = 3500
const ATTRACTION = 0.04
const DAMPING = 0.82
const ITERATIONS_PER_FRAME = 4

function initPositions(nodes: GraphNode[], w: number, h: number): SimNode[] {
  return nodes.map((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI
    const radius = Math.min(w, h) * 0.3
    return {
      ...n,
      x: w / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
      y: h / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
    }
  })
}

function simulate(nodes: SimNode[], edges: GraphEdge[], w: number, h: number): void {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  for (let iter = 0; iter < ITERATIONS_PER_FRAME; iter++) {
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        if (!a || !b) continue
        const dx = a.x - b.x
        const dy = a.y - b.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = REPULSION / (d * d)
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }

    // Attraction along edges
    for (const e of edges) {
      const a = byId.get(e.source)
      const b = byId.get(e.target)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - 80) * ATTRACTION
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    // Center gravity
    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.001
      n.vy += (h / 2 - n.y) * 0.001
    }

    // Integrate + dampen
    for (const n of nodes) {
      n.vx *= DAMPING
      n.vy *= DAMPING
      n.x += n.vx
      n.y += n.vy
      n.x = Math.max(20, Math.min(w - 20, n.x))
      n.y = Math.max(20, Math.min(h - 20, n.y))
    }
  }
}

export function KnowledgeGraphScreen() {
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SimNode | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<SVGSVGElement>(null)
  const nodesRef = useRef<SimNode[]>([])
  const rafRef = useRef<number | null>(null)
  const [tick, setTick] = useState(0)
  const [dims, setDims] = useState({ w: 900, h: 600 })
  const dragRef = useRef<{ nodeId: string | null; startX: number; startY: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.auralith.invoke('graph.build', { maxDocs: 80, maxChunksPerDoc: 4 })
      if (!('ok' in res) || !res.ok) return
      const data = res.data as { nodes: GraphNode[]; edges: GraphEdge[] }
      const w = dims.w
      const h = dims.h
      const simNodes = initPositions(data.nodes, w, h)
      nodesRef.current = simNodes
      setNodes([...simNodes])
      setEdges(data.edges)
    } finally {
      setLoading(false)
    }
  }, [dims])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let running = true
    function frame() {
      if (!running) return
      if (nodesRef.current.length > 0) {
        simulate(nodesRef.current, edges, dims.w, dims.h)
        setTick((t) => t + 1)
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [edges, dims])

  // Sync ref → state every N ticks to avoid React overhead
  useEffect(() => {
    if (tick % 3 === 0 && nodesRef.current.length > 0) {
      setNodes([...nodesRef.current])
    }
  }, [tick])

  useEffect(() => {
    const el = canvasRef.current?.parentElement
    if (!el) return
    const ob = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setDims({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ob.observe(el)
    return () => ob.disconnect()
  }, [])

  const byId = new Map(nodes.map((n) => [n.id, n]))

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.07] shrink-0">
        <h1 className="text-sm font-semibold text-white/80 flex-1">Knowledge Graph</h1>
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.3, 4))}
          className="p-1.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z / 1.3, 0.2))}
          className="p-1.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={() => {
            setZoom(1)
            setOffset({ x: 0, y: 0 })
          }}
          className="p-1.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white/[0.07] text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 shrink-0">
        {Object.entries(KIND_COLOR).map(([kind, color]) => (
          <div key={kind} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-white/40 capitalize">{kind}</span>
          </div>
        ))}
      </div>

      {/* Graph canvas */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: 'grab' }}
          onMouseMove={(e) => {
            const drag = dragRef.current
            if (!drag?.nodeId) return
            const node = nodesRef.current.find((n) => n.id === drag.nodeId)
            if (!node) return
            node.x += e.movementX / zoom
            node.y += e.movementY / zoom
            node.vx = 0
            node.vy = 0
          }}
          onMouseUp={() => {
            dragRef.current = null
          }}
          onMouseLeave={() => {
            dragRef.current = null
          }}
        >
          <g transform={`translate(${offset.x},${offset.y}) scale(${zoom})`}>
            {/* Edges */}
            {edges.map((e, i) => {
              const s = byId.get(e.source)
              const t = byId.get(e.target)
              if (!s || !t) return null
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={1}
                />
              )
            })}

            {/* Nodes */}
            {nodes.map((n) => {
              const r = (n.size ?? 8) * (selected?.id === n.id ? 1.4 : 1)
              const color = KIND_COLOR[n.kind]
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  style={{ cursor: 'pointer' }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    dragRef.current = { nodeId: n.id, startX: e.clientX, startY: e.clientY }
                  }}
                  onClick={() => setSelected((s) => (s?.id === n.id ? null : n))}
                >
                  <circle
                    r={r}
                    fill={color}
                    opacity={selected && selected.id !== n.id ? 0.4 : 0.85}
                  />
                  {r > 8 && (
                    <text
                      textAnchor="middle"
                      dy={-r - 3}
                      fontSize={9}
                      fill="rgba(255,255,255,0.6)"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {n.label.slice(0, 24)}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        {/* Detail drawer */}
        {selected && (
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="absolute right-4 top-4 w-60 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 p-4 text-xs space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white/80 truncate flex-1">{selected.label}</span>
              <button
                onClick={() => setSelected(null)}
                className="text-white/30 hover:text-white/60 ml-2"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: KIND_COLOR[selected.kind] }}
              />
              <span className="text-white/50 capitalize">{selected.kind}</span>
            </div>
            <p className="text-white/30 font-mono break-all">{selected.id}</p>
          </motion.div>
        )}

        {nodes.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-white/30">
              No documents indexed yet. Add files to a space to see the graph.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
