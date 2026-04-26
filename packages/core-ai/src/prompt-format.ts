/**
 * prompt-format.ts
 *
 * Hybrid prompt-format utilities for Auralith's local-first AI pipeline.
 *
 * Strategy:
 *   - TOON-like compact records  → repeated flat structures (news, tools, RAG chunks, memories)
 *   - XML-style blocks           → long untrusted content (article bodies, documents, web pages)
 *   - Markdown / plain text      → system instructions, simple context, user messages
 *   - Strict JSON                → ALL structured model outputs (never changed by this module)
 *   - Plain text                 → embedding inputs (never add prompt instructions here)
 *
 * TOON is used ONLY for model input context, NOT for parse-critical output.
 * All structured output from the model must remain strict JSON validated by Zod.
 */

// ── Configuration ──────────────────────────────────────────────────────────────

export type PromptFormatMode = 'auto' | 'plain' | 'toon' | 'markdown' | 'xml'

export type PromptFormatConfig = {
  /** Default: "auto". Set to "plain" or "markdown" to disable TOON globally. */
  mode: PromptFormatMode
  /** When true, emit diagnostic metadata to console (no prompt content). Default: false. */
  diagnostics: boolean
}

let _config: PromptFormatConfig = { mode: 'auto', diagnostics: false }

export function setPromptFormatConfig(config: Partial<PromptFormatConfig>): void {
  _config = { ..._config, ...config }
}

export function getPromptFormatConfig(): Readonly<PromptFormatConfig> {
  return _config
}

// ── Diagnostic logging ─────────────────────────────────────────────────────────

export type FormatDiagnostic = {
  role: string
  formatter: string
  approximateChars: number
  approximateTokens: number
  recordCount?: number
}

/**
 * Emit a diagnostic log entry. Logs only metadata — never prompt content.
 * Call site controls whether logging is active via config.diagnostics.
 */
export function logFormatDiagnostic(diag: FormatDiagnostic): void {
  if (!_config.diagnostics) return
  console.warn('[prompt-format]', JSON.stringify(diag))
}

function estimateTokens(chars: number): number {
  // Rough estimate: ~4 chars per token for English prose, ~3 for structured records.
  return Math.ceil(chars / 3.5)
}

// ── TOON-like serializer for repeated flat records ─────────────────────────────
//
// Output shape:
//   records[3]{id,source,title,date,summary}:
//     r1,Reuters,"Title here",2026-04-25,"Summary here"
//     r2,BBC,"Another title",2026-04-25,"Another summary"
//
// Rules:
//   - Fields are comma-separated; string values containing commas/quotes/newlines are quoted.
//   - Nested objects or arrays are JSON-stringified compactly for that field.
//   - Empty / null / undefined values are represented as empty string between commas.

function toonEscapeField(value: unknown): string {
  if (value === null || value === undefined) return ''

  let str: string
  if (typeof value === 'object') {
    // Nested object or array: compact JSON
    str = JSON.stringify(value)
  } else {
    str = String(value)
  }

  // Must quote if field contains comma, double-quote, newline, pipe, or leading/trailing space
  const needsQuotes = /[",\n\r|]/.test(str) || str !== str.trim()
  if (!needsQuotes) return str

  // Escape interior double-quotes by doubling them (CSV-style)
  return '"' + str.replace(/"/g, '""') + '"'
}

export type ToonRecord = Record<string, unknown>

/**
 * Serialize an array of flat objects into a compact TOON-like format.
 * Use for: news article lists, RAG chunk metadata, tool catalogs, memory records.
 *
 * @param records   Array of objects with mostly stable field sets.
 * @param fields    Ordered field names to include. Defaults to keys of first record.
 * @param label     Optional label prefix (e.g. "articles", "chunks"). Default "records".
 */
export function formatToon(records: ToonRecord[], fields?: string[], label = 'records'): string {
  if (records.length === 0) return `${label}[0]{}:\n  (none)`

  const keys = fields ?? Object.keys(records[0] ?? {})
  if (keys.length === 0) return `${label}[0]{}:\n  (none)`

  const header = `${label}[${records.length}]{${keys.join(',')}}:`
  const rows = records.map((rec, i) => {
    const cells = keys.map((k) => toonEscapeField(rec[k]))
    return `  r${i + 1},${cells.join(',')}`
  })

  return [header, ...rows].join('\n')
}

// ── XML-style block formatter for long untrusted content ──────────────────────
//
// Use for: article bodies, web pages, documents, external snippets.
// Escapes XML-sensitive characters to prevent prompt injection via content.

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type XmlBlockAttrs = Record<string, string | number | undefined>

/**
 * Wrap a long untrusted text body in an XML-style block with attributes.
 * The tag name and attribute values are also escaped.
 *
 * @param tag        Element tag (e.g. "article", "document", "chunk")
 * @param body       Untrusted body text — will be XML-escaped.
 * @param attrs      Optional key-value attributes on the opening tag.
 * @param subTags    Optional named sub-tags to render before body (e.g. title).
 */
export function formatXmlBlock(
  tag: string,
  body: string,
  attrs: XmlBlockAttrs = {},
  subTags: Record<string, string> = {},
): string {
  const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_')

  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${xmlEscape(k)}="${xmlEscape(String(v))}"`)
    .join('')

  const subTagStr = Object.entries(subTags)
    .map(([k, v]) => `  <${xmlEscape(k)}>${xmlEscape(v)}</${xmlEscape(k)}>`)
    .join('\n')

  const escapedBody = xmlEscape(body)

  if (subTagStr) {
    return `<${safeTag}${attrStr}>\n${subTagStr}\n  <body>\n${escapedBody}\n  </body>\n</${safeTag}>`
  }
  return `<${safeTag}${attrStr}>\n${escapedBody}\n</${safeTag}>`
}

// ── Markdown section formatter ─────────────────────────────────────────────────

/**
 * Wrap content in a Markdown section with a heading.
 * Use for: system instruction blocks, named context sections.
 */
export function formatMarkdownSection(heading: string, content: string, level = 2): string {
  const hashes = '#'.repeat(Math.max(1, Math.min(level, 6)))
  return `${hashes} ${heading}\n\n${content.trim()}`
}

/**
 * Render an array of objects as a Markdown table.
 * Use for: compact tool lists, settings tables, feature matrices.
 *
 * @param rows    Array of objects with the same keys.
 * @param columns Column definitions with header label and field key.
 */
export function formatMarkdownTable(
  rows: Record<string, unknown>[],
  columns: Array<{ header: string; key: string }>,
): string {
  if (rows.length === 0 || columns.length === 0) return '(empty table)'

  const header = '| ' + columns.map((c) => c.header).join(' | ') + ' |'
  const divider = '| ' + columns.map(() => '---').join(' | ') + ' |'
  const dataRows = rows.map(
    (row) => '| ' + columns.map((c) => String(row[c.key] ?? '')).join(' | ') + ' |',
  )

  return [header, divider, ...dataRows].join('\n')
}

// ── Plain text passthrough ─────────────────────────────────────────────────────

/**
 * Normalize plain text for use as embedding input.
 * Strips leading/trailing whitespace and collapses internal runs of whitespace.
 * IMPORTANT: Do not add prompt instructions to embedding inputs.
 */
export function normalizeEmbeddingText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// ── Auto-selector ──────────────────────────────────────────────────────────────

export type AutoFormatInput =
  | { type: 'records'; records: ToonRecord[]; fields?: string[]; label?: string }
  | {
      type: 'article'
      body: string
      attrs?: XmlBlockAttrs
      subTags?: Record<string, string>
      tag?: string
    }
  | { type: 'section'; heading: string; content: string; level?: number }
  | {
      type: 'table'
      rows: Record<string, unknown>[]
      columns: Array<{ header: string; key: string }>
    }
  | { type: 'embedding'; text: string }
  | { type: 'plain'; text: string }

/**
 * Auto-select the appropriate formatter based on content type and global config.
 *
 * In "auto" mode:
 *   - repeated flat records  → TOON-like (formatToon)
 *   - long untrusted text    → XML-style block (formatXmlBlock)
 *   - heading + content      → Markdown section
 *   - tabular data           → Markdown table
 *   - embedding inputs       → plain text normalization
 *   - plain text             → passthrough
 *
 * When config.mode is "plain" or "markdown", TOON is replaced with Markdown table
 * and XML blocks are replaced with plain wrapped text.
 */
export function formatPromptContext(input: AutoFormatInput, role = 'unknown'): string {
  const mode = _config.mode

  let result: string
  let formatter: string

  switch (input.type) {
    case 'records': {
      if (mode === 'plain' || mode === 'markdown') {
        // Fall back to Markdown table when TOON is disabled
        const cols = (input.fields ?? Object.keys(input.records[0] ?? {})).map((k) => ({
          header: k,
          key: k,
        }))
        result = formatMarkdownTable(input.records, cols)
        formatter = 'markdown-table'
      } else {
        result = formatToon(input.records, input.fields, input.label)
        formatter = 'toon'
      }
      break
    }

    case 'article': {
      if (mode === 'plain') {
        result = input.body
        formatter = 'plain'
      } else {
        result = formatXmlBlock(input.tag ?? 'article', input.body, input.attrs, input.subTags)
        formatter = 'xml'
      }
      break
    }

    case 'section': {
      result = formatMarkdownSection(input.heading, input.content, input.level)
      formatter = 'markdown-section'
      break
    }

    case 'table': {
      result = formatMarkdownTable(input.rows, input.columns)
      formatter = 'markdown-table'
      break
    }

    case 'embedding': {
      result = normalizeEmbeddingText(input.text)
      formatter = 'plain-embedding'
      break
    }

    case 'plain':
    default: {
      result = input.text
      formatter = 'plain'
      break
    }
  }

  logFormatDiagnostic({
    role,
    formatter,
    approximateChars: result.length,
    approximateTokens: estimateTokens(result.length),
    ...(input.type === 'records' ? { recordCount: input.records.length } : {}),
  })

  return result
}
