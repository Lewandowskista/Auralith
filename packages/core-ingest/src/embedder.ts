import type { OllamaClient } from '@auralith/core-ai'
import type { ChunkVecRepo } from '@auralith/core-db'

const BATCH_SIZE = 8
const CONCURRENCY = 2

export type EmbedProgress = {
  docId: string
  total: number
  done: number
}

export async function embedChunks(
  docId: string,
  chunkIds: string[],
  chunkTexts: string[],
  client: OllamaClient,
  model: string,
  vecRepo: ChunkVecRepo,
  onProgress?: (p: EmbedProgress) => void,
): Promise<void> {
  const total = chunkTexts.length
  let done = 0

  // Process in batches with limited concurrency
  const batches: Array<{ ids: string[]; texts: string[] }> = []
  for (let i = 0; i < total; i += BATCH_SIZE) {
    batches.push({
      ids: chunkIds.slice(i, i + BATCH_SIZE),
      texts: chunkTexts.slice(i, i + BATCH_SIZE),
    })
  }

  // Process CONCURRENCY batches at a time
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const window = batches.slice(i, i + CONCURRENCY)
    await Promise.all(
      window.map(async (batch) => {
        const embeddings = await client.embed({ model, input: batch.texts })
        for (let j = 0; j < batch.ids.length; j++) {
          const id = batch.ids[j]
          const vec = embeddings[j]
          if (id && vec) vecRepo.upsert(id, vec)
        }
        done += batch.ids.length
        onProgress?.({ docId, total, done })
      }),
    )
  }
}
