const LOOKAHEAD = 2

type SynthResult = { id: string; pcmDone: Promise<void>; playbackDone: Promise<void> }
type SynthFn = (text: string) => SynthResult

type InFlight = SynthResult

/**
 * TtsSynthesisQueue pre-synthesizes up to LOOKAHEAD sentences ahead of playback,
 * eliminating audible gaps between consecutive spoken sentences.
 *
 * Sentences are played in strict order. Synthesis of sentence N+1 begins as soon
 * as sentence N's PCM has been sent to the renderer (pcmDone), not waiting for
 * playback to finish.
 */
export class TtsSynthesisQueue {
  private synthFn: SynthFn
  private inFlight: InFlight[] = []
  private playbackChain: Promise<void> = Promise.resolve()
  private cancelled = false

  constructor(synthFn: SynthFn) {
    this.synthFn = synthFn
  }

  enqueue(text: string): void {
    if (this.cancelled) return
    if (this.inFlight.length >= LOOKAHEAD) {
      // Backpressure: defer until the oldest in-flight entry's playback drains
      const tail = this.inFlight[this.inFlight.length - 1]
      if (tail) {
        void tail.playbackDone.then(() => {
          if (!this.cancelled) this.enqueue(text)
        })
        return
      }
    }

    const entry = this.synthFn(text)
    this.inFlight.push(entry)

    // Remove from in-flight once PCM is done — the slot is now free for lookahead
    void entry.pcmDone.then(() => {
      const idx = this.inFlight.indexOf(entry)
      if (idx !== -1) this.inFlight.splice(idx, 1)
    })

    // Chain playback so sentences play in strict order
    this.playbackChain = this.playbackChain.then(() => {
      if (this.cancelled) return
      return entry.playbackDone
    })
  }

  /** Resolves when all enqueued sentences have finished playing. */
  drain(): Promise<void> {
    return this.playbackChain
  }

  cancel(): void {
    this.cancelled = true
    this.inFlight = []
    this.playbackChain = Promise.resolve()
  }

  reset(): void {
    this.cancelled = false
    this.inFlight = []
    this.playbackChain = Promise.resolve()
  }
}
