import type { ReactElement, ReactNode } from 'react'

// ── Inline parsing ────────────────────────────────��───────────────────────────

type Segment =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string }

function parseInline(raw: string): ReactElement[] {
  const segments: Segment[] = []
  let rest = raw

  while (rest.length > 0) {
    const boldMatch = rest.match(/^(.*?)\*\*(.+?)\*\*/)
    const italicMatch = rest.match(/^(.*?)(?:\*([^*]+?)\*|_([^_]+?)_)/)
    const codeMatch = rest.match(/^(.*?)`([^`]+?)`/)
    const linkMatch = rest.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)/)

    const candidates: Array<{
      index: number
      match: RegExpMatchArray
      kind: 'bold' | 'italic' | 'code' | 'link'
    }> = []

    if (boldMatch?.[1] !== undefined)
      candidates.push({ index: boldMatch[1].length, match: boldMatch, kind: 'bold' })
    if (italicMatch?.[1] !== undefined)
      candidates.push({ index: italicMatch[1].length, match: italicMatch, kind: 'italic' })
    if (codeMatch?.[1] !== undefined)
      candidates.push({ index: codeMatch[1].length, match: codeMatch, kind: 'code' })
    if (linkMatch?.[1] !== undefined)
      candidates.push({ index: linkMatch[1].length, match: linkMatch, kind: 'link' })

    if (candidates.length === 0) {
      segments.push({ type: 'text', text: rest })
      break
    }

    candidates.sort((a, b) => a.index - b.index)
    const first = candidates[0]
    if (!first) break

    if (first.index > 0) {
      segments.push({ type: 'text', text: first.match[1] ?? '' })
    }

    if (first.kind === 'bold') {
      segments.push({ type: 'bold', text: first.match[2] ?? '' })
    } else if (first.kind === 'italic') {
      segments.push({ type: 'italic', text: first.match[2] ?? first.match[3] ?? '' })
    } else if (first.kind === 'code') {
      segments.push({ type: 'code', text: first.match[2] ?? '' })
    } else {
      segments.push({ type: 'link', text: first.match[2] ?? '', href: first.match[3] ?? '' })
    }

    rest = rest.slice(first.match[0].length)
  }

  return segments.map((seg, i) => {
    if (seg.type === 'bold')
      return (
        <strong key={i} className="font-semibold text-[var(--color-text-primary)]">
          {seg.text}
        </strong>
      )
    if (seg.type === 'italic')
      return (
        <em key={i} className="italic">
          {seg.text}
        </em>
      )
    if (seg.type === 'code')
      return (
        <code
          key={i}
          className="rounded px-1 py-0.5 font-mono text-[0.8em] text-[var(--color-accent-mid)]"
          style={{ background: 'rgba(139,92,246,0.12)' }}
        >
          {seg.text}
        </code>
      )
    if (seg.type === 'link')
      return (
        <a
          key={i}
          className="underline text-[var(--color-accent-mid)] cursor-pointer hover:opacity-80"
          onClick={(e) => {
            e.preventDefault()
            window.open(seg.href, '_blank')
          }}
        >
          {seg.text}
        </a>
      )
    return <span key={i}>{seg.text}</span>
  })
}

// ── Block parsing ─────────────────────────────���───────────────────────────��───

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'bullet'; text: string; indent: number }
  | { type: 'ordered'; text: string; n: number }
  | { type: 'blockquote'; text: string }
  | { type: 'code_block'; lang: string; lines: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string }
  | { type: 'blank' }

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    // Fenced code block
    if (line.match(/^```/)) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? '').match(/^```/)) {
        codeLines.push(lines[i] ?? '')
        i++
      }
      i++ // consume closing ```
      blocks.push({ type: 'code_block', lang, lines: codeLines })
      continue
    }

    // Horizontal rule
    if (line.match(/^(?:---+|\*\*\*+|___+)$/)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // Table: requires current line and next line to contain |
    if (line.includes('|') && (lines[i + 1] ?? '').match(/^[\s|:-]+$/)) {
      const headers = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      i += 2 // skip header + separator
      const rows: string[][] = []
      while (i < lines.length && (lines[i] ?? '').includes('|')) {
        rows.push(
          (lines[i] ?? '')
            .split('|')
            .map((c) => c.trim())
            .filter(Boolean),
        )
        i++
      }
      if (headers.length >= 2) {
        blocks.push({ type: 'table', headers, rows })
        continue
      }
      // Not a real table — fall through by re-processing the current block index
    }

    // Blank line
    if (line.trim() === '') {
      blocks.push({ type: 'blank' })
      i++
      continue
    }

    // Headings
    const h3 = line.match(/^### (.+)/)
    if (h3) {
      blocks.push({ type: 'heading', level: 3, text: h3[1] ?? '' })
      i++
      continue
    }
    const h2 = line.match(/^## (.+)/)
    if (h2) {
      blocks.push({ type: 'heading', level: 2, text: h2[1] ?? '' })
      i++
      continue
    }
    const h1 = line.match(/^# (.+)/)
    if (h1) {
      blocks.push({ type: 'heading', level: 1, text: h1[1] ?? '' })
      i++
      continue
    }

    // Blockquote
    const bq = line.match(/^> (.+)/)
    if (bq) {
      blocks.push({ type: 'blockquote', text: bq[1] ?? '' })
      i++
      continue
    }

    // Ordered list
    const ol = line.match(/^(\d+)\. (.+)/)
    if (ol) {
      blocks.push({ type: 'ordered', n: parseInt(ol[1] ?? '1', 10), text: ol[2] ?? '' })
      i++
      continue
    }

    // Bullet list (supports indent)
    const bulletMatch = line.match(/^(\s*)[-*•] (.+)/)
    if (bulletMatch) {
      const indent = Math.floor((bulletMatch[1] ?? '').length / 2)
      blocks.push({ type: 'bullet', indent, text: bulletMatch[2] ?? '' })
      i++
      continue
    }

    blocks.push({ type: 'paragraph', text: line })
    i++
  }

  return blocks
}

// ── Code syntax highlight (pure CSS, no deps) ───────────────��─────────────────

function highlightLine(line: string, _lang: string): ReactElement[] {
  // Simple pattern: strings → green, keywords → purple, numbers → amber, comments → muted
  const parts: ReactElement[] = []
  let rest = line
  let key = 0

  const KEYWORDS =
    /^(const|let|var|function|return|if|else|for|while|do|class|import|export|from|default|type|interface|async|await|new|null|undefined|true|false|void|break|continue|throw|try|catch|finally|switch|case|of|in)\b/
  const STRING = /^(['"`])(?:(?!\1)[^\\]|\\.)*\1/
  const COMMENT = /^\/\/.*/
  const NUMBER = /^\b\d+\.?\d*\b/

  while (rest.length > 0) {
    const commentMatch = rest.match(COMMENT)
    if (commentMatch) {
      parts.push(
        <span key={key++} style={{ color: 'rgba(255,255,255,0.35)' }}>
          {commentMatch[0]}
        </span>,
      )
      rest = rest.slice(commentMatch[0].length)
      continue
    }
    const strMatch = rest.match(STRING)
    if (strMatch) {
      parts.push(
        <span key={key++} style={{ color: '#86efac' }}>
          {strMatch[0]}
        </span>,
      )
      rest = rest.slice(strMatch[0].length)
      continue
    }
    const kwMatch = rest.match(KEYWORDS)
    if (kwMatch) {
      parts.push(
        <span key={key++} style={{ color: '#c084fc' }}>
          {kwMatch[0]}
        </span>,
      )
      rest = rest.slice(kwMatch[0].length)
      continue
    }
    const numMatch = rest.match(NUMBER)
    if (numMatch) {
      parts.push(
        <span key={key++} style={{ color: '#fbbf24' }}>
          {numMatch[0]}
        </span>,
      )
      rest = rest.slice(numMatch[0].length)
      continue
    }
    parts.push(<span key={key++}>{rest[0]}</span>)
    rest = rest.slice(1)
  }
  return parts
}

// ── Block rendering ───────────────────────��──────────────────────────────────

function renderBlock(block: Block, i: number, blocks: Block[]): ReactNode {
  if (block.type === 'blank') {
    const prev = blocks[i - 1]
    const next = blocks[i + 1]
    if (prev && prev.type !== 'blank' && next && next.type !== 'blank') {
      return <div key={i} className="h-2" />
    }
    return null
  }

  if (block.type === 'hr') {
    return (
      <hr
        key={i}
        className="my-3 border-0 border-t"
        style={{ borderColor: 'var(--color-border-hairline)' }}
      />
    )
  }

  if (block.type === 'heading') {
    const cls =
      block.level === 1
        ? 'text-sm font-semibold text-[var(--color-text-primary)] mt-3 mb-1'
        : block.level === 2
          ? 'text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mt-3 mb-1'
          : 'text-xs font-medium text-[var(--color-text-secondary)] mt-2 mb-0.5'
    return (
      <p key={i} className={cls}>
        {parseInline(block.text)}
      </p>
    )
  }

  if (block.type === 'blockquote') {
    return (
      <div
        key={i}
        className="pl-3 py-0.5 my-1"
        style={{ borderLeft: '2px solid var(--color-accent-mid)' }}
      >
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] italic">
          {parseInline(block.text)}
        </p>
      </div>
    )
  }

  if (block.type === 'bullet') {
    return (
      <div key={i} className="flex items-start gap-1.5" style={{ marginLeft: block.indent * 16 }}>
        <span
          className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
          style={{ background: 'var(--color-accent-mid)', opacity: block.indent > 0 ? 0.6 : 1 }}
        />
        <span className="text-sm leading-relaxed text-[var(--color-text-primary)]">
          {parseInline(block.text)}
        </span>
      </div>
    )
  }

  if (block.type === 'ordered') {
    return (
      <div key={i} className="flex items-start gap-2">
        <span
          className="shrink-0 text-xs font-semibold mt-0.5"
          style={{ color: 'var(--color-accent-mid)', minWidth: 16, textAlign: 'right' }}
        >
          {block.n}.
        </span>
        <span className="text-sm leading-relaxed text-[var(--color-text-primary)]">
          {parseInline(block.text)}
        </span>
      </div>
    )
  }

  if (block.type === 'code_block') {
    return (
      <div
        key={i}
        className="my-2 rounded-xl overflow-hidden"
        style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {block.lang && (
          <div
            className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider"
            style={{
              color: 'var(--color-text-tertiary)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {block.lang}
          </div>
        )}
        <div className="overflow-x-auto p-3">
          {block.lines.map((line, li) => (
            <div
              key={li}
              className="font-mono text-[11px] leading-5 whitespace-pre"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              {highlightLine(line, block.lang)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (block.type === 'table') {
    return (
      <div key={i} className="my-2 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {block.headers.map((h, hi) => (
                <th
                  key={hi}
                  className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    color: 'var(--color-text-tertiary)',
                    borderBottom: '1px solid var(--color-border-hairline)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr
                key={ri}
                style={{
                  background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5 text-[var(--color-text-primary)]"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    {parseInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // paragraph
  return (
    <p key={i} className="text-sm leading-relaxed text-[var(--color-text-primary)]">
      {parseInline(block.text)}
    </p>
  )
}

export function renderMarkdown(markdown: string): ReactElement {
  const blocks = parseBlocks(markdown)
  return <div className="space-y-1">{blocks.map((block, i) => renderBlock(block, i, blocks))}</div>
}
