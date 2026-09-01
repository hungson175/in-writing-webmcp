import { describe, expect, it } from 'vitest'

import {
  PcmKeywordSpotter,
  decodePcm16Wav,
} from '../src/keyword/pcm-keyword-spotter'

const SAMPLE_RATE = 16000

function phrase(seconds = 1.2): Float32Array {
  return Float32Array.from(
    { length: Math.round(SAMPLE_RATE * seconds) },
    (_, index) => {
      const time = index / SAMPLE_RATE
      const sweep = 150 + 520 * (time / seconds)
      const syllable = 0.3 + 0.7 * Math.abs(Math.sin(2 * Math.PI * 2.7 * time))
      return 0.35 * syllable * Math.sin(2 * Math.PI * sweep * time)
    },
  )
}

function pcm16Wav(pcm: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, pcm.length * 2, true)
  pcm.forEach((sample, index) => {
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true)
  })
  return buffer
}

describe('decodePcm16Wav', () => {
  it('decodes a mono 16 kHz PCM template without a browser audio graph', () => {
    const expected = Float32Array.from([0, 0.25, -0.5, 0.75])
    const decoded = decodePcm16Wav(pcm16Wav(expected))

    expect(decoded.sampleRate).toBe(SAMPLE_RATE)
    expect(decoded.pcm).toHaveLength(expected.length)
    expected.forEach((value, index) => expect(decoded.pcm[index]).toBeCloseTo(value, 3))
  })

  it('rejects stereo or compressed templates rather than guessing', () => {
    const buffer = pcm16Wav(phrase())
    new DataView(buffer).setUint16(22, 2, true)
    expect(() => decodePcm16Wav(buffer)).toThrow('mono 16-bit PCM')
  })
})

describe('PcmKeywordSpotter', () => {
  it('spots an amplitude-shifted closed-vocabulary acoustic template across chunks', () => {
    const template = phrase()
    const spotter = new PcmKeywordSpotter(
      [{ id: 'good-faith-payment', label: 'good-faith payment', pcm: template }],
      { sampleRate: SAMPLE_RATE, threshold: 0.82 },
    )
    const lead = new Float32Array(SAMPLE_RATE / 2)
    const heard = Float32Array.from(template, (value, index) =>
      value * 0.57 + 0.002 * Math.sin(index * 0.73),
    )
    const stream = new Float32Array(lead.length + heard.length)
    stream.set(lead)
    stream.set(heard, lead.length)

    const matches = []
    for (let offset = 0; offset < stream.length; offset += 1337) {
      matches.push(...spotter.push(stream.subarray(offset, offset + 1337)))
    }

    expect(matches).toHaveLength(1)
    expect(matches[0]?.id).toBe('good-faith-payment')
    expect(matches[0]?.score).toBeGreaterThan(0.9)
  })

  it('rejects silence, unrelated order, and duplicate emission', () => {
    const template = phrase()
    const spotter = new PcmKeywordSpotter(
      [{ id: 'danger', label: 'danger phrase', pcm: template }],
      { sampleRate: SAMPLE_RATE, threshold: 0.82 },
    )

    expect(spotter.push(new Float32Array(template.length))).toEqual([])
    expect(spotter.push(template.slice().reverse())).toEqual([])
    expect(spotter.push(template)).toHaveLength(1)
    expect(spotter.push(template)).toEqual([])

    spotter.reset()
    expect(spotter.push(template)).toHaveLength(1)
  })

  it('reports call-relative time after its rolling feature buffer has truncated', () => {
    const template = phrase()
    const spotter = new PcmKeywordSpotter(
      [{ id: 'danger', label: 'danger phrase', pcm: template }],
      { sampleRate: SAMPLE_RATE, threshold: 0.82, searchMilliseconds: 500 },
    )
    spotter.push(new Float32Array(SAMPLE_RATE * 6))

    const [match] = spotter.push(template)

    expect(match?.heardAtSeconds).toBeCloseTo(7.2, 1)
  })
})
