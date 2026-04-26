/**
 * AiQueue — lightweight priority queue for Ollama calls.
 *
 * RTX 3060 Ti / 8 GB VRAM context:
 *   - Only one large model (qwen3:8b) should be active at a time.
 *   - Foreground tasks (user chat, agent) get immediate slots.
 *   - Background tasks (news summarization, briefing, embeddings) run one at a
 *     time and are paused while a foreground task is active.
 *
 * API surface:
 *   beginForegroundAiTask()      — mark that a user-facing call is starting
 *   endForegroundAiTask()        — release the foreground slot
 *   enqueueForegroundAiTask(fn)  — run fn at foreground priority (awaitable)
 *   enqueueBackgroundAiTask(fn)  — run fn at background priority (awaitable)
 */

export type AiTaskFn<T> = () => Promise<T>

type QueueEntry<T> = {
  fn: AiTaskFn<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export type AiQueueOptions = {
  /** Max concurrent foreground slots. Default: 1 (8 GB VRAM conservative). */
  foregroundConcurrency?: number
  /** Max concurrent background slots. Default: 1 (8 GB VRAM conservative). */
  backgroundConcurrency?: number
}

export class AiQueue {
  private foregroundRunning = 0
  private backgroundRunning = 0
  // Ref-counted: incremented by beginForegroundAiTask, decremented by
  // endForegroundAiTask. Background tasks are blocked while > 0.
  private foregroundRefCount = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private foregroundQueue: QueueEntry<any>[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private backgroundQueue: QueueEntry<any>[] = []

  private readonly fgConcurrency: number
  private readonly bgConcurrency: number

  constructor(opts: AiQueueOptions = {}) {
    // 8 GB VRAM default: one foreground + one background, but background is
    // paused whenever any foreground task is running.
    this.fgConcurrency = opts.foregroundConcurrency ?? 1
    this.bgConcurrency = opts.backgroundConcurrency ?? 1
  }

  private get foregroundActive(): boolean {
    return this.foregroundRefCount > 0 || this.foregroundRunning > 0
  }

  /**
   * Signal that a user-facing AI call is starting.
   * Ref-counted — multiple concurrent foreground tasks are safe.
   * Background jobs pause until all foreground refs are released.
   */
  beginForegroundAiTask(): void {
    this.foregroundRefCount++
  }

  /**
   * Signal that a user-facing AI call has finished.
   * When the ref-count reaches 0, the background queue is drained.
   */
  endForegroundAiTask(): void {
    if (this.foregroundRefCount > 0) this.foregroundRefCount--
    this.drain()
  }

  /** Enqueue a high-priority (user-facing) task. Returns a Promise. */
  enqueueForegroundAiTask<T>(fn: AiTaskFn<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.foregroundQueue.push({ fn, resolve, reject })
      this.drain()
    })
  }

  /**
   * Enqueue a low-priority (background) task.
   * Will not run while a foreground task is in progress.
   */
  enqueueBackgroundAiTask<T>(fn: AiTaskFn<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.backgroundQueue.push({ fn, resolve, reject })
      this.drain()
    })
  }

  /** Current queue depths — useful for diagnostics / logging. */
  getStats(): {
    foregroundQueued: number
    foregroundRunning: number
    foregroundRefCount: number
    backgroundQueued: number
    backgroundRunning: number
    foregroundActive: boolean
  } {
    return {
      foregroundQueued: this.foregroundQueue.length,
      foregroundRunning: this.foregroundRunning,
      foregroundRefCount: this.foregroundRefCount,
      backgroundQueued: this.backgroundQueue.length,
      backgroundRunning: this.backgroundRunning,
      foregroundActive: this.foregroundActive,
    }
  }

  private drain(): void {
    // Drain foreground queue first
    while (this.foregroundRunning < this.fgConcurrency && this.foregroundQueue.length > 0) {
      const entry = this.foregroundQueue.shift()
      if (!entry) break
      this.foregroundRunning++
      void this.run(entry, 'foreground')
    }

    // Only drain background queue when no foreground activity is in flight
    if (this.foregroundActive) return
    while (this.backgroundRunning < this.bgConcurrency && this.backgroundQueue.length > 0) {
      const entry = this.backgroundQueue.shift()
      if (!entry) break
      this.backgroundRunning++
      void this.run(entry, 'background')
    }
  }

  private async run<T>(entry: QueueEntry<T>, lane: 'foreground' | 'background'): Promise<void> {
    try {
      const result = await entry.fn()
      entry.resolve(result)
    } catch (err) {
      entry.reject(err)
    } finally {
      if (lane === 'foreground') {
        this.foregroundRunning--
      } else {
        this.backgroundRunning--
      }
      this.drain()
    }
  }
}

// Singleton shared across the main process
let _queue: AiQueue | null = null

export function initAiQueue(opts?: AiQueueOptions): AiQueue {
  _queue = new AiQueue(opts)
  return _queue
}

export function getAiQueue(): AiQueue {
  if (!_queue) throw new Error('AiQueue not initialized — call initAiQueue() first')
  return _queue
}
