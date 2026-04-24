import { z } from 'zod'
import type { PromptContract } from '@auralith/core-ai'

export const SUMMARIZE_ITEM_PROMPT: PromptContract<{ summary: string }> = {
  id: 'news.summarize.v1',
  role: 'classifier',
  system:
    'You are a news summarizer. Write a concise 2-3 sentence neutral summary of the article. Output only JSON.',
  userTemplate: (ctx) =>
    `Title: ${ctx['title'] ?? ''}\n\nContent:\n${(ctx['text'] ?? '').slice(0, 2000)}\n\nJSON:`,
  outputSchema: z.object({ summary: z.string().min(1) }),
  maxTokens: 120,
  temperature: 0,
}

export const ANALYZE_ITEM_PROMPT: PromptContract<{ analysis: string }> = {
  id: 'news.analyze.v1',
  role: 'classifier',
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

export const CLUSTER_LABEL_PROMPT: PromptContract<{ label: string }> = {
  id: 'news.cluster-label.v1',
  role: 'classifier',
  system:
    'You label clusters of related news headlines with a short descriptive phrase (5-8 words). Output only JSON.',
  userTemplate: (ctx) => `Headlines:\n${ctx['headlines'] ?? ''}\n\nJSON:`,
  outputSchema: z.object({ label: z.string().min(1) }),
  maxTokens: 40,
  temperature: 0,
}
