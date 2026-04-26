import { describe, it, expect, beforeEach } from 'vitest'
import {
  formatToon,
  formatXmlBlock,
  formatMarkdownTable,
  formatMarkdownSection,
  normalizeEmbeddingText,
  formatPromptContext,
  setPromptFormatConfig,
  getPromptFormatConfig,
} from './prompt-format'

// ── TOON-like serializer ───────────────────────────────────────────────────────

describe('formatToon', () => {
  it('renders header and rows correctly', () => {
    const result = formatToon(
      [
        {
          id: 'n1',
          source: 'Reuters',
          title: 'Test Title',
          date: '2026-04-25',
          summary: 'A summary',
        },
        { id: 'n2', source: 'BBC', title: 'Other Title', date: '2026-04-25', summary: 'Another' },
      ],
      ['id', 'source', 'title', 'date', 'summary'],
      'articles',
    )
    expect(result).toContain('articles[2]{id,source,title,date,summary}:')
    expect(result).toContain('r1,n1,Reuters,Test Title,2026-04-25,A summary')
    expect(result).toContain('r2,n2,BBC,Other Title,2026-04-25,Another')
  })

  it('quotes fields containing commas', () => {
    const result = formatToon([{ title: 'Hello, World' }], ['title'])
    expect(result).toContain('"Hello, World"')
  })

  it('quotes fields containing double-quotes and escapes them', () => {
    const result = formatToon([{ title: 'He said "hi"' }], ['title'])
    expect(result).toContain('"He said ""hi"""')
  })

  it('quotes fields containing newlines', () => {
    const result = formatToon([{ text: 'line1\nline2' }], ['text'])
    expect(result).toContain('"line1\nline2"')
  })

  it('quotes fields containing pipes', () => {
    const result = formatToon([{ text: 'a|b' }], ['text'])
    expect(result).toContain('"a|b"')
  })

  it('handles null and undefined fields as empty string', () => {
    const result = formatToon([{ id: 'x', val: null as unknown as string }], ['id', 'val'])
    expect(result).toContain('r1,x,')
  })

  it('handles undefined fields as empty string', () => {
    const result = formatToon([{ id: 'x' } as Record<string, unknown>], ['id', 'missing'])
    expect(result).toContain('r1,x,')
  })

  it('JSON-stringifies nested objects compactly and quotes the field', () => {
    // The compact JSON contains commas and quotes, so the TOON field is CSV-quoted.
    // Interior quotes are doubled: {"a":1,"b":2} → "{""a"":1,""b"":2}"
    const result = formatToon([{ meta: { a: 1, b: 2 } }], ['meta'])
    expect(result).toContain('"{""a"":1,""b"":2}"')
  })

  it('JSON-stringifies nested arrays compactly and quotes the field', () => {
    // ["a","b"] contains commas and quotes → CSV-quoted with doubled interior quotes.
    const result = formatToon([{ tags: ['a', 'b'] }], ['tags'])
    expect(result).toContain('"[""a"",""b""]"')
  })

  it('returns empty marker for empty records array', () => {
    const result = formatToon([], ['id'], 'items')
    expect(result).toBe('items[0]{}:\n  (none)')
  })

  it('uses default label "records" when none provided', () => {
    const result = formatToon([{ id: '1' }])
    expect(result).toContain('records[1]')
  })

  it('infers fields from first record when not provided', () => {
    const result = formatToon([{ foo: 'x', bar: 'y' }])
    expect(result).toContain('{foo,bar}')
  })

  it('renders multiple records with sequential r-labels', () => {
    const records = Array.from({ length: 5 }, (_, i) => ({ id: `n${i + 1}` }))
    const result = formatToon(records, ['id'])
    expect(result).toContain('r1,n1')
    expect(result).toContain('r5,n5')
  })
})

// ── XML-style block formatter ──────────────────────────────────────────────────

describe('formatXmlBlock', () => {
  it('wraps content in XML tags', () => {
    const result = formatXmlBlock('article', 'Some body text')
    expect(result).toContain('<article>')
    expect(result).toContain('Some body text')
    expect(result).toContain('</article>')
  })

  it('includes attributes on opening tag', () => {
    const result = formatXmlBlock('article', 'body', {
      id: 'n1',
      source: 'Reuters',
      published: '2026-04-25',
    })
    expect(result).toContain('id="n1"')
    expect(result).toContain('source="Reuters"')
    expect(result).toContain('published="2026-04-25"')
  })

  it('escapes & in body text', () => {
    const result = formatXmlBlock('doc', 'cats & dogs')
    expect(result).toContain('cats &amp; dogs')
  })

  it('escapes < in body text', () => {
    const result = formatXmlBlock('doc', '<script>alert(1)</script>')
    expect(result).toContain('&lt;script&gt;')
    expect(result).not.toContain('<script>')
  })

  it('escapes > in body text', () => {
    const result = formatXmlBlock('doc', 'a > b')
    expect(result).toContain('a &gt; b')
  })

  it('escapes " in body text', () => {
    const result = formatXmlBlock('doc', 'He said "hello"')
    expect(result).toContain('He said &quot;hello&quot;')
  })

  it("escapes ' in body text", () => {
    const result = formatXmlBlock('doc', "it's fine")
    expect(result).toContain('it&#39;s fine')
  })

  it('escapes attribute values', () => {
    const result = formatXmlBlock('doc', 'body', { src: '<malicious>' })
    expect(result).toContain('&lt;malicious&gt;')
    expect(result).not.toContain('<malicious>')
  })

  it('renders sub-tags before body when provided', () => {
    const result = formatXmlBlock('article', 'The body', {}, { title: 'My Title' })
    expect(result).toContain('<title>My Title</title>')
    expect(result).toContain('<body>')
    expect(result).toContain('The body')
  })

  it('sanitizes invalid characters from tag name', () => {
    const result = formatXmlBlock('my tag!', 'body')
    expect(result).toContain('<my_tag_>')
  })

  it('skips undefined attributes', () => {
    const result = formatXmlBlock('doc', 'body', { id: 'x', missing: undefined })
    expect(result).not.toContain('missing')
    expect(result).toContain('id="x"')
  })
})

// ── Markdown formatters ────────────────────────────────────────────────────────

describe('formatMarkdownSection', () => {
  it('uses ## by default', () => {
    const result = formatMarkdownSection('Context', 'Some text')
    expect(result.startsWith('## Context')).toBe(true)
  })

  it('respects custom heading level', () => {
    const result = formatMarkdownSection('Tools', 'content', 3)
    expect(result.startsWith('### Tools')).toBe(true)
  })

  it('clamps heading level between 1 and 6', () => {
    expect(formatMarkdownSection('X', 'y', 0)).toMatch(/^# X/)
    expect(formatMarkdownSection('X', 'y', 7)).toMatch(/^#{6} X/)
  })

  it('trims content', () => {
    const result = formatMarkdownSection('H', '  spaced  ')
    expect(result).toContain('spaced')
    expect(result).not.toContain('  spaced  ')
  })
})

describe('formatMarkdownTable', () => {
  it('renders header, divider and rows', () => {
    const rows = [
      { name: 'weather.get', risk: 'low', description: 'Get weather' },
      { name: 'file.open', risk: 'medium', description: 'Open file' },
    ]
    const cols = [
      { header: 'Name', key: 'name' },
      { header: 'Risk', key: 'risk' },
      { header: 'Description', key: 'description' },
    ]
    const result = formatMarkdownTable(rows, cols)
    expect(result).toContain('| Name | Risk | Description |')
    expect(result).toContain('| --- | --- | --- |')
    expect(result).toContain('| weather.get | low | Get weather |')
    expect(result).toContain('| file.open | medium | Open file |')
  })

  it('returns empty marker when no rows', () => {
    expect(formatMarkdownTable([], [{ header: 'H', key: 'h' }])).toBe('(empty table)')
  })

  it('returns empty marker when no columns', () => {
    expect(formatMarkdownTable([{ a: '1' }], [])).toBe('(empty table)')
  })

  it('renders empty string for missing field values', () => {
    const result = formatMarkdownTable(
      [{ name: 'x' } as Record<string, unknown>],
      [
        { header: 'Name', key: 'name' },
        { header: 'Missing', key: 'missing' },
      ],
    )
    expect(result).toContain('| x |  |')
  })
})

// ── Embedding text normalizer ──────────────────────────────────────────────────

describe('normalizeEmbeddingText', () => {
  it('collapses multiple spaces', () => {
    expect(normalizeEmbeddingText('hello   world')).toBe('hello world')
  })

  it('collapses newlines and tabs', () => {
    expect(normalizeEmbeddingText('line1\n\nline2\t\tmore')).toBe('line1 line2 more')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizeEmbeddingText('  hello world  ')).toBe('hello world')
  })

  it('returns empty string for blank input', () => {
    expect(normalizeEmbeddingText('   \n\t  ')).toBe('')
  })
})

// ── Auto-selector (formatPromptContext) ────────────────────────────────────────

describe('formatPromptContext — auto mode', () => {
  beforeEach(() => setPromptFormatConfig({ mode: 'auto', diagnostics: false }))

  it('uses TOON for records in auto mode', () => {
    const result = formatPromptContext({
      type: 'records',
      records: [{ id: 'n1', title: 'Test' }],
      label: 'items',
    })
    expect(result).toContain('items[1]')
    expect(result).toContain('r1,n1,Test')
  })

  it('uses XML for article in auto mode', () => {
    const result = formatPromptContext({
      type: 'article',
      body: 'Some article content',
      attrs: { id: 'a1' },
      tag: 'article',
    })
    expect(result).toContain('<article')
    expect(result).toContain('id="a1"')
    expect(result).toContain('Some article content')
  })

  it('uses Markdown section for section type', () => {
    const result = formatPromptContext({ type: 'section', heading: 'Context', content: 'text' })
    expect(result).toContain('## Context')
  })

  it('uses Markdown table for table type', () => {
    const result = formatPromptContext({
      type: 'table',
      rows: [{ a: '1' }],
      columns: [{ header: 'A', key: 'a' }],
    })
    expect(result).toContain('| A |')
  })

  it('normalizes embedding text', () => {
    const result = formatPromptContext({ type: 'embedding', text: '  hello   world  ' })
    expect(result).toBe('hello world')
  })

  it('passes through plain text', () => {
    const result = formatPromptContext({ type: 'plain', text: 'raw text' })
    expect(result).toBe('raw text')
  })
})

describe('formatPromptContext — plain mode (TOON disabled)', () => {
  beforeEach(() => setPromptFormatConfig({ mode: 'plain', diagnostics: false }))

  it('falls back to Markdown table for records', () => {
    const result = formatPromptContext({
      type: 'records',
      records: [{ id: 'n1', title: 'Test' }],
    })
    // Should be a Markdown table, not TOON header
    expect(result).not.toContain('records[')
    expect(result).toContain('| id |')
  })

  it('falls back to plain text for articles', () => {
    const result = formatPromptContext({ type: 'article', body: 'The body text' })
    expect(result).toBe('The body text')
    expect(result).not.toContain('<article')
  })
})

describe('formatPromptContext — markdown mode (TOON disabled)', () => {
  beforeEach(() => setPromptFormatConfig({ mode: 'markdown', diagnostics: false }))

  it('falls back to Markdown table for records', () => {
    const result = formatPromptContext({
      type: 'records',
      records: [{ id: 'n1', title: 'Test' }],
    })
    expect(result).not.toContain('records[')
    expect(result).toContain('| id |')
  })

  it('still uses XML blocks for articles (markdown mode keeps XML)', () => {
    const result = formatPromptContext({ type: 'article', body: 'body', tag: 'doc' })
    expect(result).toContain('<doc>')
  })
})

describe('formatPromptContext — toon mode', () => {
  beforeEach(() => setPromptFormatConfig({ mode: 'toon', diagnostics: false }))

  it('uses TOON for records', () => {
    const result = formatPromptContext({
      type: 'records',
      records: [{ id: 'x' }],
      label: 'chunks',
    })
    expect(result).toContain('chunks[1]')
  })
})

// ── Config ─────────────────────────────────────────────────────────────────────

describe('setPromptFormatConfig / getPromptFormatConfig', () => {
  beforeEach(() => setPromptFormatConfig({ mode: 'auto', diagnostics: false }))

  it('reads back the config that was set', () => {
    setPromptFormatConfig({ mode: 'plain' })
    expect(getPromptFormatConfig().mode).toBe('plain')
  })

  it('merges partial updates without losing other fields', () => {
    setPromptFormatConfig({ diagnostics: true })
    const cfg = getPromptFormatConfig()
    expect(cfg.diagnostics).toBe(true)
    expect(cfg.mode).toBe('auto')
  })
})
