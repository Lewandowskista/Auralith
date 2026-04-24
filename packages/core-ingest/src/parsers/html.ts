import { readFileSync } from 'fs'
import { basename, extname } from 'path'

export function parseHtml(filePath: string): { text: string; title: string } {
  const raw = readFileSync(filePath, 'utf8')

  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const rawTitle = titleMatch?.[1]
    ? rawTitle2txt(titleMatch[1])
    : basename(filePath, extname(filePath))

  const text = htmlToText(raw)
  return { text, title: rawTitle }
}

function rawTitle2txt(s: string): string {
  return s
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}
