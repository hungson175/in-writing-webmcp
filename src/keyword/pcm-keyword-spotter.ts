export interface DecodedPcm {
  sampleRate: number
  pcm: Float32Array
}

export interface KeywordTemplate {
  id: string
  label: string
  pcm: Float32Array
}

export interface KeywordMatch {
  id: string
  label: string
  score: number
  heardAtSeconds: number
}

interface FeatureFrame {
  energy: number
  crossings: number
  flux: number
}

interface PreparedTemplate extends Omit<KeywordTemplate, 'pcm'> {
  features: FeatureFrame[]
}

export interface KeywordSpotterOptions {
  sampleRate: number
  threshold?: number
  frameMilliseconds?: number
  searchMilliseconds?: number
}

function readAscii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, index) =>
    String.fromCharCode(view.getUint8(offset + index)),
  ).join('')
}

export function decodePcm16Wav(buffer: ArrayBuffer): DecodedPcm {
  const view = new DataView(buffer)
  if (view.byteLength < 44 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Invalid WAV container')
  }

  let offset = 12
  let audioFormat = 0
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let dataOffset = -1
  let dataLength = 0
  while (offset + 8 <= view.byteLength) {
    const type = readAscii(view, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (body + size > view.byteLength) throw new Error('Truncated WAV chunk')
    if (type === 'fmt ') {
      audioFormat = view.getUint16(body, true)
      channels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bitsPerSample = view.getUint16(body + 14, true)
    } else if (type === 'data') {
      dataOffset = body
      dataLength = size
      break
    }
    offset = body + size + (size % 2)
  }

  if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16 || dataOffset < 0) {
    throw new Error('Keyword templates must be mono 16-bit PCM WAV')
  }
  const pcm = new Float32Array(Math.floor(dataLength / 2))
  for (let index = 0; index < pcm.length; index += 1) {
    pcm[index] = view.getInt16(dataOffset + index * 2, true) / 32768
  }
  return { sampleRate, pcm }
}

function extractFrame(pcm: Float32Array): FeatureFrame {
  let energy = 0
  let crossings = 0
  let flux = 0
  let previous = pcm[0] ?? 0
  for (let index = 0; index < pcm.length; index += 1) {
    const value = pcm[index] ?? 0
    energy += value * value
    if (index > 0) {
      if ((value >= 0) !== (previous >= 0)) crossings += 1
      const delta = value - previous
      flux += delta * delta
    }
    previous = value
  }
  return {
    energy: Math.log10(1e-7 + Math.sqrt(energy / Math.max(1, pcm.length))),
    crossings: crossings / Math.max(1, pcm.length - 1),
    flux: Math.log10(1e-7 + Math.sqrt(flux / Math.max(1, pcm.length - 1))),
  }
}

function toFeatures(pcm: Float32Array, frameSamples: number): FeatureFrame[] {
  const frames: FeatureFrame[] = []
  for (let offset = 0; offset + frameSamples <= pcm.length; offset += frameSamples) {
    frames.push(extractFrame(pcm.subarray(offset, offset + frameSamples)))
  }
  return frames
}

function correlation(
  left: FeatureFrame[],
  right: FeatureFrame[],
  key: keyof FeatureFrame,
): number | null {
  let leftMean = 0
  let rightMean = 0
  for (let index = 0; index < left.length; index += 1) {
    leftMean += left[index]?.[key] ?? 0
    rightMean += right[index]?.[key] ?? 0
  }
  leftMean /= left.length
  rightMean /= right.length

  let numerator = 0
  let leftEnergy = 0
  let rightEnergy = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = (left[index]?.[key] ?? 0) - leftMean
    const rightValue = (right[index]?.[key] ?? 0) - rightMean
    numerator += leftValue * rightValue
    leftEnergy += leftValue * leftValue
    rightEnergy += rightValue * rightValue
  }
  const denominator = Math.sqrt(leftEnergy * rightEnergy)
  return denominator < 1e-9 ? null : numerator / denominator
}

function featureScore(left: FeatureFrame[], right: FeatureFrame[]): number {
  const values = (
    ['energy', 'crossings', 'flux'] as const
  ).map((key) => correlation(left, right, key)).filter((value): value is number => value !== null)
  if (values.length < 2) return -1
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export class PcmKeywordSpotter {
  private readonly sampleRate: number
  private readonly threshold: number
  private readonly frameSamples: number
  private readonly searchFrames: number
  private readonly templates: PreparedTemplate[]
  private readonly emitted = new Set<string>()
  private remainder = new Float32Array()
  private features: FeatureFrame[] = []
  private featureStartFrame = 0

  constructor(templates: KeywordTemplate[], options: KeywordSpotterOptions) {
    if (templates.length === 0) throw new Error('At least one keyword template is required')
    if (options.sampleRate <= 0) throw new Error('Sample rate must be positive')
    this.sampleRate = options.sampleRate
    this.threshold = options.threshold ?? 0.86
    this.frameSamples = Math.round(
      (this.sampleRate * (options.frameMilliseconds ?? 10)) / 1000,
    )
    this.searchFrames = Math.max(
      1,
      Math.round((options.searchMilliseconds ?? 500) / (options.frameMilliseconds ?? 10)),
    )
    this.templates = templates.map(({ id, label, pcm }) => {
      const features = toFeatures(pcm, this.frameSamples)
      if (features.length < 10) throw new Error(`Keyword template ${id} is too short`)
      return { id, label, features }
    })
  }

  push(chunk: Float32Array): KeywordMatch[] {
    if (chunk.length === 0) return []
    const combined = new Float32Array(this.remainder.length + chunk.length)
    combined.set(this.remainder)
    combined.set(chunk, this.remainder.length)
    const completeSamples = combined.length - (combined.length % this.frameSamples)
    this.features.push(...toFeatures(combined.subarray(0, completeSamples), this.frameSamples))
    this.remainder = combined.slice(completeSamples)

    const matches: KeywordMatch[] = []
    for (const template of this.templates) {
      if (this.emitted.has(template.id) || this.features.length < template.features.length) continue
      const lastStart = this.features.length - template.features.length
      const firstStart = Math.max(0, lastStart - this.searchFrames)
      let best = -1
      let bestStart = lastStart
      for (let start = firstStart; start <= lastStart; start += 1) {
        const score = featureScore(
          template.features,
          this.features.slice(start, start + template.features.length),
        )
        if (score > best) {
          best = score
          bestStart = start
        }
      }
      if (best >= this.threshold) {
        this.emitted.add(template.id)
        matches.push({
          id: template.id,
          label: template.label,
          score: best,
          heardAtSeconds: (
            this.featureStartFrame + bestStart + template.features.length
          ) * this.frameSamples / this.sampleRate,
        })
      }
    }

    const longest = Math.max(...this.templates.map((template) => template.features.length))
    const keep = longest + this.searchFrames
    if (this.features.length > keep) {
      const removed = this.features.length - keep
      this.features = this.features.slice(-keep)
      this.featureStartFrame += removed
    }
    return matches
  }

  reset(): void {
    this.emitted.clear()
    this.remainder = new Float32Array()
    this.features = []
    this.featureStartFrame = 0
  }
}
