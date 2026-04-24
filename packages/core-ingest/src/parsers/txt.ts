import { readFileSync } from 'fs'
import type { ParsedDoc } from './md'

export function parseTxt(filePath: string): ParsedDoc {
  const text = readFileSync(filePath, 'utf8')
  const firstLine = text.split('\n').find((l) => l.trim()) ?? ''
  const fromPath =
    filePath
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? 'Untitled'
  const title = firstLine.slice(0, 80).trim() || fromPath
  return { text, title }
}
