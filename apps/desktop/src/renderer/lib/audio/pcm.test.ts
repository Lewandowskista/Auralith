import { describe, expect, test } from 'vitest'
import { floatToPcm16, pcm16ToBase64 } from './pcm'

describe('PCM audio conversion', () => {
  test('clamps float samples into signed 16-bit PCM', () => {
    const pcm = floatToPcm16(new Float32Array([-2, -1, 0, 0.5, 1, 2]))

    expect(Array.from(pcm)).toEqual([-32768, -32768, 0, 16383, 32767, 32767])
  })

  test('encodes PCM16 samples as little-endian base64', () => {
    const base64 = pcm16ToBase64(new Int16Array([1, -2]))

    expect(base64).toBe('AQD+/w==')
  })
})
