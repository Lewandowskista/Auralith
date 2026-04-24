import { readFileSync } from 'fs'

export type ParsedDoc = {
  text: string
  title: string
}

export function parseMd(filePath: string): ParsedDoc {
  const raw = readFileSync(filePath, 'utf8')
  // Extract first H1 as title, fall back to filename
  const h1 = raw.match(/^#\s+(.+)/m)
  const title = h1?.[1]
    ? h1[1].trim()
    : (filePath
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? 'Untitled')
  return { text: raw, title }
}
