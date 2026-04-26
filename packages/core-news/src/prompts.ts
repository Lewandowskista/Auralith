import { z } from 'zod'
import type { PromptContract } from '@auralith/core-ai'
import { formatXmlBlock, formatToon } from '@auralith/core-ai'

// ── Single-article summarization ───────────────────────────────────────────────
//
// Input format: XML-style block around the article body.
// Untrusted external content is clearly delimited to prevent prompt injection.
// Output: strict JSON (always — regardless of input format strategy).

export const SUMMARIZE_ITEM_PROMPT: PromptContract<{ summary: string }> = {
  id: 'news.summarize.v1',
  role: 'summarize',
  system:
    'You are a news summarizer. Write a concise 2-3 sentence neutral summary of the article. Output only JSON.',
  // The userTemplate receives pre-formatted XML from buildSingleArticleContext
  // when called via the pipeline. The template itself is kept as a simple passthrough.
  userTemplate: (ctx) => `${ctx['articleBlock'] ?? ''}\n\nJSON: {"summary":"..."}`,
  outputSchema: z.object({ summary: z.string().min(1) }),
  maxTokens: 120,
  temperature: 0,
  cacheTtlMs: 30 * 60 * 1000, // 30 min — same article text always yields same summary
}

/**
 * Build the user-context block for a single article summarization call.
 *
 * Uses XML-style block to clearly delimit the untrusted article body from
 * prompt instructions. This is important for local small models that can be
 * confused by inline text that looks like instructions.
 */
export function buildSingleArticleContext(opts: {
  title: string
  text: string
  source?: string
  published?: string
  id?: string
}): string {
  const { title, text, source, published, id } = opts
  return formatXmlBlock(
    'article',
    // Truncate at 2000 chars — keeps well within context window on small models
    text.slice(0, 2000),
    {
      ...(id ? { id } : {}),
      ...(source ? { source } : {}),
      ...(published ? { published } : {}),
    },
    { title },
  )
}

// ── Single-article analysis ────────────────────────────────────────────────────

export const ANALYZE_ITEM_PROMPT: PromptContract<{ analysis: string }> = {
  id: 'news.analyze.v1',
  role: 'extract',
  system: [
    'You are a news analyst. Provide a brief AI take (2-3 sentences) on the significance or implications of this story.',
    'Label it clearly as an AI perspective, not established fact.',
    'Output only JSON.',
  ].join(' '),
  userTemplate: (ctx) =>
    `Title: ${ctx['title'] ?? ''}\n\nSummary: ${ctx['summary'] ?? ''}\n\nJSON:`,
  outputSchema: z.object({ analysis: z.string().min(1) }),
  maxTokens: 120,
  temperature: 0.3,
}

// ── Cluster label ──────────────────────────────────────────────────────────────

export const CLUSTER_LABEL_PROMPT: PromptContract<{ label: string }> = {
  id: 'news.cluster-label.v1',
  role: 'classifier',
  system:
    'You label clusters of related news headlines with a short descriptive phrase (5-8 words). Output only JSON.',
  userTemplate: (ctx) => `Headlines:\n${ctx['headlines'] ?? ''}\n\nJSON:`,
  outputSchema: z.object({ label: z.string().min(1) }),
  maxTokens: 40,
  temperature: 0,
  cacheTtlMs: 60 * 60 * 1000, // 1 hour — same headline set always gets same label
}

// ── Multi-article digest ───────────────────────────────────────────────────────
//
// Schema for structured digest output. Strict JSON — never TOON.

export const DigestOutputSchema = z.object({
  headline: z.string().min(1),
  briefing: z.string().min(1),
  key_points: z.array(z.string()).min(1),
  source_ids_used: z.array(z.string()),
  uncertainties: z.array(z.string()),
  importance: z.enum(['low', 'medium', 'high']),
})

export type DigestOutput = z.infer<typeof DigestOutputSchema>

export type DigestArticle = {
  id: string
  source: string
  title: string
  date: string
  summary: string
}

/**
 * Build the user-context block for a multi-article digest call.
 *
 * Uses TOON-like compact records for article metadata + summaries.
 * This is significantly more token-efficient than repeating
 * "Article N — Source: X, Title: Y, Summary: Z" for each item.
 *
 * Output must remain strict JSON — TOON is only used for this input context.
 */
export function buildDigestContext(articles: DigestArticle[]): string {
  return formatToon(
    articles.map((a) => ({
      id: a.id,
      source: a.source,
      title: a.title,
      date: a.date,
      summary: a.summary,
    })),
    ['id', 'source', 'title', 'date', 'summary'],
    'articles',
  )
}

export const DIGEST_PROMPT: PromptContract<DigestOutput> = {
  id: 'news.digest.v1',
  role: 'summarize',
  system: [
    'You are a news digest editor. Given a set of articles, produce a concise daily briefing.',
    'Output ONLY valid JSON — no prose, no markdown fences.',
    'Use only the provided articles — do not invent facts.',
    'source_ids_used must contain only the id values from the input articles.',
  ].join(' '),
  // userTemplate receives pre-formatted TOON table from buildDigestContext
  userTemplate: (ctx) =>
    `${ctx['articlesBlock'] ?? ''}\n\nProduce the digest JSON now:\n{"headline":"...","briefing":"...","key_points":[...],"source_ids_used":[...],"uncertainties":[...],"importance":"low|medium|high"}`,
  outputSchema: DigestOutputSchema,
  maxTokens: 512,
  temperature: 0.1,
}
