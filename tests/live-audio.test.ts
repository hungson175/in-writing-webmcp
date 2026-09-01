import { describe, expect, it, vi } from 'vitest'

import { LiveAudioTrack } from '../src/audio/live-audio'

type CaptureAudioElement = HTMLAudioElement & { captureStream(): MediaStream }

describe('LiveAudioTrack', () => {
  it('captures the element audio track in a closure and stops it on teardown', () => {
    const stop = vi.fn()
    const track = { kind: 'audio', readyState: 'live', stop } as unknown as MediaStreamTrack
    const element = {
      captureStream: () => ({ getAudioTracks: () => [track] }) as unknown as MediaStream,
    } as CaptureAudioElement

    const live = LiveAudioTrack.fromElement(element)

    expect(live.active).toBe(true)
    expect(live.track).toBe(track)
    live.stop()
    expect(stop).toHaveBeenCalledOnce()
    expect(live.active).toBe(false)
  })

  it('fails closed when captureStream yields no live audio track', () => {
    const element = {
      captureStream: () => ({ getAudioTracks: () => [] }) as unknown as MediaStream,
    } as CaptureAudioElement

    expect(() => LiveAudioTrack.fromElement(element)).toThrow('No live audio track')
  })

  it('rejects non-user-gesture acquisition', () => {
    const track = { kind: 'audio', readyState: 'live', stop: vi.fn() } as unknown as MediaStreamTrack
    const element = {
      captureStream: () => ({ getAudioTracks: () => [track] }) as unknown as MediaStream,
    } as CaptureAudioElement

    expect(() => LiveAudioTrack.fromElement(element, { userGesture: false })).toThrow(
      'User gesture required',
    )
  })
})
