import { describe, expect, it } from 'vitest'
import { AiQueue } from './ai-queue'

// ── Queue priority behavior ────────────────────────────────────────────────────

describe('AiQueue', () => {
  it('runs a foreground task and resolves its promise', async () => {
    const queue = new AiQueue()
    const result = await queue.enqueueForegroundAiTask(async () => 42)
    expect(result).toBe(42)
  })

  it('runs a background task when no foreground is active', async () => {
    const queue = new AiQueue()
    const result = await queue.enqueueBackgroundAiTask(async () => 'bg-result')
    expect(result).toBe('bg-result')
  })

  it('holds background tasks while a foreground task is in progress', async () => {
    const queue = new AiQueue()
    const order: string[] = []

    // Mark foreground active manually (simulates a chat session starting)
    queue.beginForegroundAiTask()

    // Enqueue a background task — should NOT run yet
    const bgDone = queue.enqueueBackgroundAiTask(async () => {
      order.push('background')
    })

    // Yield to microtask queue — background should still be waiting
    await Promise.resolve()
    expect(order).toEqual([])

    // End foreground — should unblock background
    queue.endForegroundAiTask()
    await bgDone
    expect(order).toEqual(['background'])
  })

  it('foreground tasks run before queued background tasks', async () => {
    const queue = new AiQueue()
    const order: string[] = []

    // Fill the one foreground slot with a long-running task
    let resolveFg!: () => void
    const fgPending = new Promise<void>((res) => {
      resolveFg = res
    })
    const fgDone = queue.enqueueForegroundAiTask(async () => {
      await fgPending
      order.push('foreground')
    })

    // While fg is running, enqueue background — should wait
    const bgDone = queue.enqueueBackgroundAiTask(async () => {
      order.push('background')
    })

    // Release fg
    resolveFg()
    await fgDone
    await bgDone

    expect(order[0]).toBe('foreground')
    expect(order[1]).toBe('background')
  })

  it('propagates errors from failed tasks', async () => {
    const queue = new AiQueue()
    await expect(
      queue.enqueueForegroundAiTask(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })

  it('getStats reflects queue state', async () => {
    const queue = new AiQueue()
    queue.beginForegroundAiTask()
    const stats = queue.getStats()
    expect(stats.foregroundActive).toBe(true)
    queue.endForegroundAiTask()
    expect(queue.getStats().foregroundActive).toBe(false)
  })

  it('endForegroundAiTask drains background queue', async () => {
    const queue = new AiQueue()
    const results: number[] = []

    queue.beginForegroundAiTask()
    const p1 = queue.enqueueBackgroundAiTask(async () => {
      results.push(1)
    })
    const p2 = queue.enqueueBackgroundAiTask(async () => {
      results.push(2)
    })

    queue.endForegroundAiTask()
    await Promise.all([p1, p2])
    expect(results).toEqual([1, 2])
  })
})
