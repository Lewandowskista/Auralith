// ── News response grounding validator ─────────────────────────────────────────
//
// Ensures that every AI-generated news response actually references real article
// titles from the loaded context. Prevents vague generic summaries.
//
// Called by the assistant handler after receiving a news-role response. On first
// failure a single retry is issued with a stricter system message; on second
// failure a hard fallback string is returned so the UI always has something safe
// to display.

export type NewsValidationContext = {
  /** Exact titles available from news_items / news_articles in the context. */
  titles: string[]
}

export type NewsValidationResult = { ok: true } | { ok: false; reason: string }

// Phrases that indicate the model is fabricating or being vague instead of
// citing real data. Checked case-insensitively.
const BANNED_PHRASES = [
  'an article',
  'some news',
  'one article discusses',
  'might be about',
  'appears to',
  'there are some articles',
  'several stories',
  'a story about',
  'some articles',
]

export const NEWS_FALLBACK_RESPONSE = "I don't have enough detailed news data loaded right now."

export const NEWS_RETRY_SYSTEM_INJECTION =
  'Your previous response was rejected for lack of specificity. You MUST include exact article titles from the news_items context. Do not use vague phrases like "an article" or "some news".'

/**
 * Validate that a news response is properly grounded in the provided context.
 *
 * A response is valid when:
 *   1. It contains at least one exact title from the context (case-insensitive substring match)
 *   2. It does not contain any banned vague phrases
 */
export function validateNewsResponse(
  output: string,
  context: NewsValidationContext,
): NewsValidationResult {
  if (context.titles.length === 0) {
    // No titles available — cannot validate grounding; let it pass so we don't
    // always fall back when the news pipeline hasn't run yet.
    return { ok: true }
  }

  const lower = output.toLowerCase()

  // Check banned phrases
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      return { ok: false, reason: `Response contains banned vague phrase: "${phrase}"` }
    }
  }

  // Check that at least one real title appears verbatim
  const hasTitle = context.titles.some((title) => lower.includes(title.toLowerCase()))

  if (!hasTitle) {
    return {
      ok: false,
      reason: 'Response does not cite any exact article title from the loaded news context.',
    }
  }

  return { ok: true }
}

/**
 * Extract article titles from the news context prompt text.
 *
 * Parses the TOON-formatted news_articles / news_items table that the
 * NewsContextProvider injects into the system prompt. Falls back to an empty
 * array when no articles are present so the validator degrades gracefully.
 */
export function extractTitlesFromContext(promptText: string): string[] {
  const titles: string[] = []

  // TOON rows look like:  | id | cluster | source | published | <title> | summary |
  // The title column is always preceded by the published column value.
  // We match lines that are part of a news_articles or news_items TOON block.
  // Strategy: find every line that contains a pipe-delimited row with 5+ cells
  // and extract the 5th cell (index 4) which is the title column.
  const lines = promptText.split('\n')
  let inNewsBlock = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('=== news_articles') || trimmed.startsWith('=== news_items')) {
      inNewsBlock = true
      continue
    }
    if (inNewsBlock && trimmed.startsWith('===') && !trimmed.startsWith('=== news_')) {
      inNewsBlock = false
    }
    if (!inNewsBlock) continue

    // Skip header and separator rows
    if (!trimmed.startsWith('|') || trimmed.startsWith('| id') || trimmed.startsWith('|---')) {
      continue
    }

    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)

    // news_articles columns: id | cluster | source | published | title | summary
    // news_items columns:    id | cluster | source | published | title | summary
    // title is at index 4 (0-based after removing empty first/last from split)
    if (cells.length >= 5) {
      const title = cells[4]
      if (title && title.length > 3) {
        titles.push(title)
      }
    }
  }

  return titles
}
