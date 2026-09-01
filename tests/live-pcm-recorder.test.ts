import { describe, expect, it, vi } from 'vitest'

import {
  LivePcmRecorder,
  type AudioFrameLike,
  type TrackProcessorLike,
  type TrackReaderLike,
} from '../src/audio/live-pcm-recorder'

describe('LivePcmRecorder', () => {
  it('keeps a short sample call in one default inference window for coherent phrases', async () => {
    const close = vi.fn()
    const frame: AudioFrameLike = {
      numberOfFrames: 13 * 16000,
      numberOfChannels: 1,
      sampleRate: 16000,
      copyTo: (destination) => destination.fill(0.1),
      close,
    }
    const reads = [
      { done: false as const, value: frame },
      { done: true as const, value: undefined },
    ]
    const reader: TrackReaderLike = {
      read: vi.fn(async () => reads.shift() ?? { done: true as const, value: undefined }),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    }
    const emitted = vi.fn()
    const recorder = new LivePcmRecorder(() => ({ readable: { getReader: () => reader } }))

    await recorder.start(
      { kind: 'audio', readyState: 'live' } as MediaStreamTrack,
      emitted,
    )
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(emitted).not.toHaveBeenCalled()

    expect(await recorder.finish()).toBe(true)
    expect(emitted).toHaveBeenCalledOnce()
    expect(emitted.mock.calls[0]?.[0]).toHaveLength(13 * 16000)
  })

  it('reads real frames from MediaStreamTrackProcessor and emits 16 kHz PCM windows', async () => {
    const copyTo = vi.fn((destination: Float32Array) => destination.fill(0.2))
    const close = vi.fn()
    const frame: AudioFrameLike = {
      numberOfFrames: 48000,
      numberOfChannels: 1,
      sampleRate: 48000,
      copyTo,
      close,
    }
    const reads = [
      { done: false as const, value: frame },
      { done: true as const, value: undefined },
    ]
    const reader: TrackReaderLike = {
      read: vi.fn(async () => reads.shift() ?? { done: true as const, value: undefined }),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    }
    const processor: TrackProcessorLike = {
      readable: { getReader: () => reader },
    }
    const createProcessor = vi.fn(() => processor)
    const emitted = vi.fn()
    const recorder = new LivePcmRecorder(createProcessor)
    const track = { kind: 'audio', readyState: 'live' } as MediaStreamTrack

    await recorder.start(track, emitted, { windowSeconds: 1 })
    await vi.waitFor(() => expect(emitted).toHaveBeenCalledOnce())

    expect(createProcessor).toHaveBeenCalledWith(track)
    expect(copyTo).toHaveBeenCalledWith(expect.any(Float32Array), {
      planeIndex: 0,
      format: 'f32-planar',
    })
    expect(emitted.mock.calls[0]?.[0]).toHaveLength(16000)
    expect(close).toHaveBeenCalledOnce()

    await recorder.stop()
    expect(reader.cancel).toHaveBeenCalledOnce()
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })

  it('flushes captured remainder only after the reader is cancelled and drained', async () => {
    let resolveRead: ((result: { done: true; value: undefined }) => void) | undefined
    const reader: TrackReaderLike = {
      read: vi.fn(
        () =>
          new Promise<{ done: true; value: undefined }>((resolve) => {
            resolveRead = resolve
          }),
      ),
      cancel: vi.fn(async () => resolveRead?.({ done: true, value: undefined })),
      releaseLock: vi.fn(),
    }
    const recorder = new LivePcmRecorder(() => ({ readable: { getReader: () => reader } }))
    const emitted = vi.fn()

    await recorder.start(
      { kind: 'audio', readyState: 'live' } as MediaStreamTrack,
      emitted,
      { windowSeconds: 4 },
    )
    const flushed = await recorder.finish()

    expect(flushed).toBe(false)
    expect(reader.cancel).toHaveBeenCalledOnce()
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })
})
