// AudioWorklet capture processor — runs on the dedicated audio thread.
// Accumulates float32 input samples and transfers them to the main thread
// in fixed-size chunks via MessagePort. Replaces ScriptProcessorNode.

const CHUNK_SIZE = 4096

class CaptureProcessor extends AudioWorkletProcessor {
  private accumulator = new Float32Array(CHUNK_SIZE)
  private writePos = 0

  override process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (!channel) return true

    let inputOffset = 0
    while (inputOffset < channel.length) {
      const space = CHUNK_SIZE - this.writePos
      const toCopy = Math.min(space, channel.length - inputOffset)
      this.accumulator.set(channel.subarray(inputOffset, inputOffset + toCopy), this.writePos)
      this.writePos += toCopy
      inputOffset += toCopy

      if (this.writePos >= CHUNK_SIZE) {
        // Transfer ownership to avoid copying — zero allocation on this thread
        const transfer = this.accumulator.buffer
        this.port.postMessage({ type: 'pcm', samples: this.accumulator }, [transfer])
        this.accumulator = new Float32Array(CHUNK_SIZE)
        this.writePos = 0
      }
    }

    return true
  }
}

registerProcessor('capture-processor', CaptureProcessor)
