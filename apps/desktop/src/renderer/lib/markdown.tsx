import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

// ── Inline parsing ────────────────────────────────────────────────────────────

type Segment =
  | { type: 'text'; text: string }
  | { type: 'bold_italic'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'strikethrough'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'image'; alt: string; src: string }

function parseInline(raw: string): ReactElement[] {
  const segments: Segment[] = []
  let rest = raw

  while (rest.length > 0) {
    // Order matters: longest/most-specific patterns first
    const boldItalicMatch = rest.match(/^(.*?)\*\*\*(.+?)\*\*\*/)
    const boldMatch = rest.match(/^(.*?)\*\*(.+?)\*\*/)
    const italicStarMatch = rest.match(/^(.*?)\*([^*\n]+?)\*/)
    const italicUnderMatch = rest.match(/^(.*?)_([^_\n]+?)_/)
    const strikeMatch = rest.match(/^(.*?)~~(.+?)~~/)
    const codeMatch = rest.match(/^(.*?)`([^`\n]+?)`/)
    const imageMatch = rest.match(/^(.*?)!\[([^\]]*)\]\(([^)]+)\)/)
    const linkMatch = rest.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)/)

    const candidates: Array<{
      index: number
      match: RegExpMatchArray
      kind: Segment['type']
    }> = []

    if (boldItalicMatch?.[1] !== undefined)
      candidates.push({
        index: boldItalicMatch[1].length,
        match: boldItalicMatch,
        kind: 'bold_italic',
      })
    if (boldMatch?.[1] !== undefined)
      candidates.push({ index: boldMatch[1].length, match: boldMatch, kind: 'bold' })
    if (italicStarMatch?.[1] !== undefined)
      candidates.push({ index: italicStarMatch[1].length, match: italicStarMatch, kind: 'italic' })
    if (italicUnderMatch?.[1] !== undefined)
      candidates.push({
        index: italicUnderMatch[1].length,
        match: italicUnderMatch,
        kind: 'italic',
      })
    if (strikeMatch?.[1] !== undefined)
      candidates.push({ index: strikeMatch[1].length, match: strikeMatch, kind: 'strikethrough' })
    if (codeMatch?.[1] !== undefined)
      candidates.push({ index: codeMatch[1].length, match: codeMatch, kind: 'code' })
    if (imageMatch?.[1] !== undefined)
      candidates.push({ index: imageMatch[1].length, match: imageMatch, kind: 'image' })
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

    if (first.kind === 'bold_italic') {
      segments.push({ type: 'bold_italic', text: first.match[2] ?? '' })
    } else if (first.kind === 'bold') {
      segments.push({ type: 'bold', text: first.match[2] ?? '' })
    } else if (first.kind === 'italic') {
      segments.push({ type: 'italic', text: first.match[2] ?? '' })
    } else if (first.kind === 'strikethrough') {
      segments.push({ type: 'strikethrough', text: first.match[2] ?? '' })
    } else if (first.kind === 'code') {
      segments.push({ type: 'code', text: first.match[2] ?? '' })
    } else if (first.kind === 'image') {
      segments.push({ type: 'image', alt: first.match[2] ?? '', src: first.match[3] ?? '' })
    } else {
      segments.push({ type: 'link', text: first.match[2] ?? '', href: first.match[3] ?? '' })
    }

    rest = rest.slice(first.match[0].length)
  }

  return segments.map((seg, i) => {
    if (seg.type === 'bold_italic')
      return (
        <strong key={i} className="font-bold italic text-[var(--color-text-primary)]">
          {seg.text}
        </strong>
      )
    if (seg.type === 'bold')
      return (
        <strong key={i} className="font-semibold text-[var(--color-text-primary)]">
          {seg.text}
        </strong>
      )
    if (seg.type === 'italic')
      return (
        <em key={i} className="italic text-[var(--color-text-secondary)]">
          {seg.text}
        </em>
      )
    if (seg.type === 'strikethrough')
      return (
        <span key={i} style={{ textDecoration: 'line-through', opacity: 0.55 }}>
          {seg.text}
        </span>
      )
    if (seg.type === 'code')
      return (
        <code
          key={i}
          className="rounded px-1.5 py-0.5 font-mono text-[0.8em]"
          style={{
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.2)',
            color: 'var(--color-accent-high)',
          }}
        >
          {seg.text}
        </code>
      )
    if (seg.type === 'image')
      return (
        <img
          key={i}
          src={seg.src}
          alt={seg.alt}
          className="inline-block max-w-full rounded-lg"
          style={{ border: '1px solid var(--color-border-hairline)', verticalAlign: 'middle' }}
        />
      )
    if (seg.type === 'link')
      return (
        <a
          key={i}
          className="cursor-pointer"
          style={{
            color: 'var(--color-accent-mid)',
            textDecoration: 'none',
            borderBottom: '1px solid rgba(167,139,250,0.4)',
            transition: 'border-color 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(167,139,250,0.8)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(167,139,250,0.4)'
          }}
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

// ── Block parsing ─────────────────────────────────────────────────────────────

type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'bullet'; text: string; indent: number; checked?: boolean | null }
  | { type: 'ordered'; text: string; n: number; indent: number }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'code_block'; lang: string; lines: string[] }
  | {
      type: 'table'
      headers: string[]
      rows: string[][]
      align: Array<'left' | 'center' | 'right'>
    }
  | { type: 'hr' }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'blank' }
  | { type: 'image_block'; alt: string; src: string; title?: string | undefined }

function parseAlign(sep: string): 'left' | 'center' | 'right' {
  const s = sep.trim()
  if (s.startsWith(':') && s.endsWith(':')) return 'center'
  if (s.endsWith(':')) return 'right'
  return 'left'
}

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
      while (i < lines.length && !(lines[i] ?? '').match(/^```\s*$/)) {
        codeLines.push(lines[i] ?? '')
        i++
      }
      i++ // consume closing ```
      blocks.push({ type: 'code_block', lang, lines: codeLines })
      continue
    }

    // Horizontal rule
    if (line.match(/^(?:---+|\*\*\*+|___+)\s*$/)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // Standalone image: ![alt](src "title")
    const imgBlock = line.match(/^!\[([^\]]*)\]\(([^)"]+)(?:\s+"([^"]*)")?\)\s*$/)
    if (imgBlock) {
      blocks.push({
        type: 'image_block',
        alt: imgBlock[1] ?? '',
        src: imgBlock[2] ?? '',
        ...(imgBlock[3] !== undefined ? { title: imgBlock[3] } : {}),
      })
      i++
      continue
    }

    // Table: header row | separator row
    if (line.includes('|')) {
      const nextLine = lines[i + 1] ?? ''
      if (nextLine.match(/^[\s|:\-]+$/) && nextLine.includes('-')) {
        const rawHeaders = line
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean)
        const separators = nextLine
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean)
        if (rawHeaders.length >= 2) {
          const align = separators.map(parseAlign)
          i += 2
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
          blocks.push({ type: 'table', headers: rawHeaders, rows, align })
          continue
        }
      }
    }

    // Blank line
    if (line.trim() === '') {
      blocks.push({ type: 'blank' })
      i++
      continue
    }

    // Headings
    const h4 = line.match(/^#### (.+)/)
    if (h4) {
      blocks.push({ type: 'heading', level: 4, text: h4[1] ?? '' })
      i++
      continue
    }
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

    // Blockquote — collect consecutive > lines
    if (line.match(/^> ?/)) {
      const bqLines: string[] = []
      while (i < lines.length && (lines[i] ?? '').match(/^> ?/)) {
        bqLines.push((lines[i] ?? '').replace(/^> ?/, ''))
        i++
      }
      blocks.push({ type: 'blockquote', lines: bqLines })
      continue
    }

    // Task list item: - [ ] or - [x]
    const taskMatch = line.match(/^(\s*)[-*] \[([ xX])\] (.+)/)
    if (taskMatch) {
      const indent = Math.floor((taskMatch[1] ?? '').length / 2)
      const checked = (taskMatch[2] ?? ' ').toLowerCase() === 'x'
      blocks.push({ type: 'bullet', indent, checked, text: taskMatch[3] ?? '' })
      i++
      continue
    }

    // Bullet list (supports indent)
    const bulletMatch = line.match(/^(\s*)[-*•] (.+)/)
    if (bulletMatch) {
      const indent = Math.floor((bulletMatch[1] ?? '').length / 2)
      blocks.push({ type: 'bullet', indent, checked: null, text: bulletMatch[2] ?? '' })
      i++
      continue
    }

    // Ordered list (supports indent)
    const ol = line.match(/^(\s*)(\d+)[.)]\s+(.+)/)
    if (ol) {
      const indent = Math.floor((ol[1] ?? '').length / 2)
      blocks.push({ type: 'ordered', n: parseInt(ol[2] ?? '1', 10), indent, text: ol[3] ?? '' })
      i++
      continue
    }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = [line]
    i++
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !(lines[i] ?? '').match(/^(?:#{1,4} |```|>|[-*•] |\d+[.)]\s|---|___|\*\*\*)/) &&
      !(lines[i] ?? '').includes('|')
    ) {
      paraLines.push(lines[i] ?? '')
      i++
    }
    blocks.push({ type: 'paragraph', lines: paraLines })
  }

  return blocks
}

// ── Code syntax highlight ─────────────────────────────────────────────────────

function highlightLine(line: string, _lang: string): ReactElement[] {
  const parts: ReactElement[] = []
  let rest = line
  let key = 0

  const KEYWORDS =
    /^(const|let|var|function|return|if|else|elif|for|while|do|class|import|export|from|default|type|interface|async|await|new|null|undefined|true|false|void|break|continue|throw|try|catch|finally|switch|case|of|in|def|pass|yield|lambda|with|as|not|and|or|is|del|raise|assert|global|nonlocal|self|super|None|True|False|pub|fn|let|mut|use|mod|struct|enum|impl|trait|where|match|Some|None)\b/
  const STRING = /^(['"`])(?:(?!\1)[^\\]|\\.)*\1/
  const TEMPLATE_STRING = /^`(?:[^`\\]|\\.)*`/
  const COMMENT_LINE = /^\/\/.*/
  const COMMENT_HASH = /^#.*/
  const COMMENT_BLOCK = /^\/\*[\s\S]*?\*\//
  const NUMBER = /^\b\d+\.?\d*\b/
  const OPERATOR = /^[=!<>+\-*/%&|^~?:]+/
  const PUNCTUATION = /^[()[\]{},;.]/

  while (rest.length > 0) {
    // Comments
    const commentMatch =
      rest.match(COMMENT_LINE) ?? rest.match(COMMENT_HASH) ?? rest.match(COMMENT_BLOCK)
    if (commentMatch) {
      parts.push(
        <span key={key++} style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
          {commentMatch[0]}
        </span>,
      )
      rest = rest.slice(commentMatch[0].length)
      continue
    }
    // Template strings
    const tmplMatch = rest.match(TEMPLATE_STRING)
    if (tmplMatch) {
      parts.push(
        <span key={key++} style={{ color: '#fdba74' }}>
          {tmplMatch[0]}
        </span>,
      )
      rest = rest.slice(tmplMatch[0].length)
      continue
    }
    // Strings
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
    // Keywords
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
    // Numbers
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
    // Operators
    const opMatch = rest.match(OPERATOR)
    if (opMatch) {
      parts.push(
        <span key={key++} style={{ color: '#67e8f9' }}>
          {opMatch[0]}
        </span>,
      )
      rest = rest.slice(opMatch[0].length)
      continue
    }
    // Punctuation
    const punctMatch = rest.match(PUNCTUATION)
    if (punctMatch) {
      parts.push(
        <span key={key++} style={{ color: 'rgba(255,255,255,0.5)' }}>
          {punctMatch[0]}
        </span>,
      )
      rest = rest.slice(punctMatch[0].length)
      continue
    }
    parts.push(<span key={key++}>{rest[0]}</span>)
    rest = rest.slice(1)
  }
  return parts
}

// ── Copy button for code blocks ───────────────────────────────────────────────

function CopyCodeButton({ code }: { code: string }): ReactElement {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(code).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      style={{
        padding: '2px 8px',
        borderRadius: 5,
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        border: '1px solid rgba(255,255,255,0.1)',
        background: copied ? 'rgba(134,239,172,0.12)' : 'rgba(255,255,255,0.05)',
        color: copied ? '#86efac' : 'rgba(255,255,255,0.45)',
        cursor: 'pointer',
        transition: 'all 150ms',
        letterSpacing: '0.02em',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── Block rendering ───────────────────────────────────────────────────────────

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

  if (block.type === 'image_block') {
    return (
      <div key={i} className="my-2">
        <img
          src={block.src}
          alt={block.alt}
          title={block.title}
          className="max-w-full rounded-xl"
          style={{ border: '1px solid var(--color-border-hairline)', display: 'block' }}
        />
        {block.alt && (
          <p
            className="mt-1 text-[11px] text-center"
            style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}
          >
            {block.alt}
          </p>
        )}
      </div>
    )
  }

  if (block.type === 'heading') {
    const styles: Record<number, string> = {
      1: 'text-[15px] font-semibold text-[var(--color-text-primary)] mt-4 mb-1.5 leading-snug',
      2: 'text-[13px] font-semibold text-[var(--color-text-primary)] mt-3 mb-1 leading-snug',
      3: 'text-[12px] font-semibold text-[var(--color-text-secondary)] mt-2.5 mb-0.5 uppercase tracking-wide',
      4: 'text-[12px] font-medium text-[var(--color-text-secondary)] mt-2 mb-0.5',
    }
    return (
      <p key={i} className={styles[block.level] ?? styles[3]}>
        {parseInline(block.text)}
      </p>
    )
  }

  if (block.type === 'blockquote') {
    // Recursively render nested blockquote content as blocks
    const inner = parseBlocks(block.lines.join('\n'))
    return (
      <div
        key={i}
        className="my-1.5 py-1 pl-3"
        style={{
          borderLeft: '2px solid var(--color-accent-mid)',
          background: 'rgba(139,92,246,0.04)',
          borderRadius: '0 6px 6px 0',
        }}
      >
        {inner.map((b, bi) => renderBlock(b, bi, inner))}
      </div>
    )
  }

  if (block.type === 'bullet') {
    const isTask = block.checked !== null && block.checked !== undefined
    return (
      <div key={i} className="flex items-start gap-2" style={{ marginLeft: block.indent * 18 }}>
        {isTask ? (
          <span
            className="mt-[3px] shrink-0 flex items-center justify-center"
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              border: `1.5px solid ${block.checked ? 'var(--color-accent-mid)' : 'rgba(255,255,255,0.25)'}`,
              background: block.checked ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: 'var(--color-accent-mid)',
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            {block.checked ? '✓' : ''}
          </span>
        ) : (
          <span
            className="shrink-0 rounded-full"
            style={{
              marginTop: 8,
              width: block.indent > 0 ? 4 : 5,
              height: block.indent > 0 ? 4 : 5,
              background: block.indent > 0 ? 'rgba(139,92,246,0.5)' : 'var(--color-accent-mid)',
              flexShrink: 0,
            }}
          />
        )}
        <span
          className="text-sm leading-relaxed"
          style={{
            color:
              isTask && block.checked ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
            textDecoration: isTask && block.checked ? 'line-through' : 'none',
            opacity: isTask && block.checked ? 0.6 : 1,
          }}
        >
          {parseInline(block.text)}
        </span>
      </div>
    )
  }

  if (block.type === 'ordered') {
    return (
      <div key={i} className="flex items-start gap-2" style={{ marginLeft: block.indent * 18 }}>
        <span
          className="shrink-0 text-xs font-semibold tabular-nums"
          style={{
            color: 'var(--color-accent-mid)',
            minWidth: 18,
            paddingTop: 2,
            textAlign: 'right',
            flexShrink: 0,
          }}
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
    const code = block.lines.join('\n')
    return (
      <div
        key={i}
        className="my-2.5 rounded-xl overflow-hidden"
        style={{
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Toolbar row */}
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span
            className="text-[10px] font-mono uppercase tracking-wider"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {block.lang || 'plaintext'}
          </span>
          <CopyCodeButton code={code} />
        </div>
        <div className="overflow-x-auto p-3">
          {block.lines.map((line, li) => (
            <div
              key={li}
              className="font-mono text-[11.5px] leading-[1.6] whitespace-pre"
              style={{ color: 'rgba(255,255,255,0.88)' }}
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
      <div
        key={i}
        className="my-2.5 overflow-x-auto rounded-xl"
        style={{ border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ background: 'rgba(139,92,246,0.06)' }}>
              {block.headers.map((h, hi) => (
                <th
                  key={hi}
                  className="px-3 py-2 text-[11px] font-semibold"
                  style={{
                    color: 'var(--color-text-secondary)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    textAlign: block.align[hi] ?? 'left',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {parseInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr
                key={ri}
                style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5"
                    style={{
                      color: 'var(--color-text-primary)',
                      borderBottom:
                        ri < block.rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      textAlign: block.align[ci] ?? 'left',
                    }}
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

  // paragraph — join soft-wrapped lines with a space; double newline = gap
  return (
    <p key={i} className="text-sm leading-relaxed text-[var(--color-text-primary)]">
      {block.lines.map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          {parseInline(line)}
        </span>
      ))}
    </p>
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

export function renderMarkdown(markdown: string): ReactElement {
  const blocks = parseBlocks(markdown)
  return (
    <div className="space-y-1.5">{blocks.map((block, i) => renderBlock(block, i, blocks))}</div>
  )
}
