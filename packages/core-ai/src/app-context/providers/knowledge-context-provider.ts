import type { AppContextProvider, AppContextRequest, AppContextProviderResult } from '../types'
import { formatXmlBlock } from '../../prompt-format'

// ── Types mirrored from core-retrieval ────────────────────────────────────────

type SearchHit = {
  chunkId: string
  docId: string
  docPath: string
  docTitle?: string
  headingPath?: string
  charStart: number
  charEnd: number
  page?: number
  text: string
  score: number
}

type KnowledgeSpace = {
  id: string
  name: string
  slug: string
}

// ── Provider deps ─────────────────────────────────────────────────────────────

export type KnowledgeContextDeps = {
  search: (opts: { query: string; spaceId?: string; topK: number }) => Promise<SearchHit[]>
  listSpaces: () => Promise<KnowledgeSpace[]>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CHUNKS = 5
const MAX_CHUNK_CHARS = 400
const SHORT_CHUNK_THRESHOLD = 200

// ── Provider ──────────────────────────────────────────────────────────────────

export function createKnowledgeContextProvider(deps: KnowledgeContextDeps): AppContextProvider {
  return {
    capability: 'knowledge',

    canHandle(req: AppContextRequest): boolean {
      return req.requestedCapabilities.includes('knowledge') && req.userInput.trim().length > 0
    },

    async getContext(req: AppContextRequest): Promise<AppContextProviderResult> {
      if (req.isCloudModel) {
        return {
          capability: 'knowledge',
          promptText: '',
          charCount: 0,
          freshness: 'missing',
          warnings: ['Knowledge context excluded — cloud model restriction (high privacy).'],
          source: 'core-retrieval',
        }
      }

      const warnings: string[] = []
      let hits: SearchHit[] = []
      let spaces: KnowledgeSpace[] = []

      try {
        ;[hits, spaces] = await Promise.all([
          deps.search({ query: req.userInput, topK: MAX_CHUNKS }),
          deps.listSpaces(),
        ])
      } catch (err) {
        warnings.push(`Knowledge search failed: ${err instanceof Error ? err.message : 'error'}`)
      }

      if (hits.length === 0) {
        const spaceNames = spaces.map((s) => s.name).join(', ')
        return {
          capability: 'knowledge',
          promptText:
            spaces.length > 0
              ? `### Knowledge\nNo matching documents found. Available spaces: ${spaceNames}.`
              : '',
          charCount: 0,
          freshness: spaces.length > 0 ? 'fresh' : 'missing',
          warnings: [
            ...warnings,
            spaces.length === 0
              ? 'No knowledge spaces indexed yet.'
              : 'No relevant chunks found for this query.',
          ],
          source: 'core-retrieval',
        }
      }

      // Document content is untrusted — use XML blocks for chunks
      // Short chunks: TOON-style inline, long chunks: XML blocks (same strategy as rag-answer.ts)
      const chunkParts = hits.slice(0, MAX_CHUNKS).map((hit, i) => {
        const truncated =
          hit.text.length > MAX_CHUNK_CHARS ? hit.text.slice(0, MAX_CHUNK_CHARS) + '…' : hit.text
        const label = hit.docTitle ?? hit.docPath.split('/').at(-1) ?? hit.docId
        const attrs: Record<string, string> = {
          n: String(i + 1),
          id: hit.chunkId,
          source: label,
          score: hit.score.toFixed(3),
        }
        if (hit.headingPath) attrs['section'] = hit.headingPath
        if (hit.page !== undefined) attrs['page'] = String(hit.page)

        if (truncated.length < SHORT_CHUNK_THRESHOLD) {
          return `[^${i + 1}] (${label}) ${truncated}`
        }
        return formatXmlBlock('chunk', truncated, attrs)
      })

      const spaceNames = spaces.map((s) => s.name).join(', ')

      const promptText = [
        '### Knowledge',
        `source: core-retrieval | spaces: ${spaceNames} | chunks: ${hits.length}`,
        'Use [^n] citation numbers when referencing these chunks in your answer.',
        ...chunkParts,
      ].join('\n')

      return {
        capability: 'knowledge',
        promptText,
        charCount: promptText.length,
        freshness: 'fresh',
        warnings,
        source: 'core-retrieval',
      }
    },
  }
}
