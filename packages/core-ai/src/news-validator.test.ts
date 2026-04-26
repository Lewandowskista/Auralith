import { describe, it, expect } from 'vitest'
import {
  validateNewsResponse,
  extractTitlesFromContext,
  NEWS_FALLBACK_RESPONSE,
} from './news-validator'

// ── validateNewsResponse ───────────────────────────────────────────────────────

describe('validateNewsResponse', () => {
  const ctx = {
    titles: [
      'OpenAI announces GPT-5 with reasoning improvements',
      'EU Parliament votes on landmark AI safety regulation',
    ],
  }

  it('passes when response cites at least one exact title', () => {
    const result = validateNewsResponse(
      'According to the article "OpenAI announces GPT-5 with reasoning improvements" (TechCrunch, 2h ago), the new model...',
      ctx,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects response that cites no real title', () => {
    const result = validateNewsResponse(
      'There has been significant activity in the tech sector today with several major announcements.',
      ctx,
    )
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toContain('does not cite any exact article title')
  })

  it('rejects response containing banned vague phrase "an article"', () => {
    const result = validateNewsResponse(
      'An article from a major outlet discusses new AI regulations being considered.',
      ctx,
    )
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toContain('"an article"')
  })

  it('rejects response containing "some news"', () => {
    const result = validateNewsResponse(
      'There is some news about the EU Parliament voting on tech policy.',
      ctx,
    )
    expect(result.ok).toBe(false)
  })

  it('rejects response containing "one article discusses"', () => {
    const result = validateNewsResponse(
      'One article discusses the implications of AI regulation.',
      ctx,
    )
    expect(result.ok).toBe(false)
  })

  it('rejects response containing "might be about"', () => {
    const result = validateNewsResponse(
      'This cluster might be about upcoming legislation changes.',
      ctx,
    )
    expect(result.ok).toBe(false)
  })

  it('is case-insensitive for title matching', () => {
    const result = validateNewsResponse(
      'The story "openai announces gpt-5 with reasoning improvements" was top-rated today.',
      ctx,
    )
    expect(result.ok).toBe(true)
  })

  it('passes when context has no titles (pipeline not yet run)', () => {
    const result = validateNewsResponse('There are no articles loaded yet.', { titles: [] })
    expect(result.ok).toBe(true)
  })

  it('rejects fabricated title not in context', () => {
    const result = validateNewsResponse(
      '"Google reveals quantum breakthrough" — this is a major story.',
      ctx,
    )
    expect(result.ok).toBe(false)
  })
})

// ── NEWS_FALLBACK_RESPONSE ─────────────────────────────────────────────────────

describe('NEWS_FALLBACK_RESPONSE', () => {
  it('is a safe non-empty string', () => {
    expect(NEWS_FALLBACK_RESPONSE.length).toBeGreaterThan(10)
    expect(NEWS_FALLBACK_RESPONSE).not.toContain('undefined')
  })
})

// ── extractTitlesFromContext ───────────────────────────────────────────────────

describe('extractTitlesFromContext', () => {
  it('extracts titles from a TOON news_items block', () => {
    const promptText = [
      '### News',
      'source: core-news | freshness: fresh | topics: Technology',
      '=== news_items ===',
      '| id | cluster | source | published | title | summary |',
      '|---|---|---|---|---|---|',
      '| a1 | c1 | Reuters | 2h ago | OpenAI announces GPT-5 with reasoning improvements | Summary here |',
      '| a2 | c1 | BBC | 4h ago | EU Parliament votes on landmark AI safety regulation | Another summary |',
      '=== end ===',
    ].join('\n')

    const titles = extractTitlesFromContext(promptText)
    expect(titles).toContain('OpenAI announces GPT-5 with reasoning improvements')
    expect(titles).toContain('EU Parliament votes on landmark AI safety regulation')
  })

  it('returns empty array when no news_items block present', () => {
    const promptText = '### News\nsource: core-news | freshness: missing'
    expect(extractTitlesFromContext(promptText)).toEqual([])
  })

  it('returns empty array for completely empty prompt', () => {
    expect(extractTitlesFromContext('')).toEqual([])
  })
})
