import { describe, expect, it, vi } from 'vitest'

import { PcmWindowBuffer, resamplePcm } from '../src/audio/pcm-window'

describe('resamplePcm', () => {
  it('downsamples 48 kHz mono to 16 kHz without changing duration', () => {
    const input = Float32Array.from({ length: 48000 }, (_, index) => Math.sin(index / 20))
    const output = resamplePcm(input, 48000, 16000)

    expect(output).toHaveLength(16000)
    expect(output.every(Number.isFinite)).toBe(true)
  })
})

describe('PcmWindowBuffer', () => {
  it('emits fixed four-second 16 kHz windows and retains the remainder', () => {
    const emit = vi.fn()
    const buffer = new PcmWindowBuffer(16000, 4, emit)

    buffer.push(new Float32Array(50000).fill(0.1))
    expect(emit).not.toHaveBeenCalled()
    buffer.push(new Float32Array(20000).fill(0.2))

    expect(emit).toHaveBeenCalledOnce()
    expect(emit.mock.calls[0]?.[0]).toHaveLength(64000)
    expect(buffer.pendingSamples).toBe(6000)
  })

  it('flushes a final partial window only when it has at least one second', () => {
    const emit = vi.fn()
    const buffer = new PcmWindowBuffer(16000, 4, emit)
    buffer.push(new Float32Array(15999))
    expect(buffer.flush()).toBe(false)
    buffer.push(new Float32Array(2))
    expect(buffer.flush()).toBe(true)
    expect(emit.mock.calls[0]?.[0]).toHaveLength(16001)
  })
})
