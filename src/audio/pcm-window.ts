export function resamplePcm(
  input: Float32Array,
  sourceRate: number,
  targetRate = 16000,
): Float32Array {
  if (sourceRate <= 0 || targetRate <= 0) throw new Error('Sample rates must be positive')
  if (sourceRate === targetRate) return input.slice()
  const outputLength = Math.max(1, Math.round((input.length * targetRate) / sourceRate))
  const output = new Float32Array(outputLength)
  const ratio = sourceRate / targetRate
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(input.length - 1, left + 1)
    const fraction = position - left
    output[index] = (input[left] ?? 0) * (1 - fraction) + (input[right] ?? 0) * fraction
  }
  return output
}

export class PcmWindowBuffer {
  private readonly sampleRate: number
  private readonly windowSamples: number
  private readonly onWindow: (pcm: Float32Array) => void
  private chunks: Float32Array[] = []
  private sampleCount = 0

  constructor(sampleRate: number, seconds: number, onWindow: (pcm: Float32Array) => void) {
    if (sampleRate <= 0 || seconds <= 0) throw new Error('Window dimensions must be positive')
    this.sampleRate = sampleRate
    this.windowSamples = Math.round(sampleRate * seconds)
    this.onWindow = onWindow
  }

  get pendingSamples(): number {
    return this.sampleCount
  }

  push(pcm: Float32Array): void {
    if (pcm.length === 0) return
    this.chunks.push(pcm.slice())
    this.sampleCount += pcm.length
    while (this.sampleCount >= this.windowSamples) {
      this.onWindow(this.take(this.windowSamples))
    }
  }

  flush(): boolean {
    if (this.sampleCount < this.sampleRate) return false
    this.onWindow(this.take(this.sampleCount))
    return true
  }

  private take(length: number): Float32Array {
    const output = new Float32Array(length)
    let offset = 0
    while (offset < length) {
      const head = this.chunks[0]
      if (!head) throw new Error('PCM buffer underflow')
      const count = Math.min(head.length, length - offset)
      output.set(head.subarray(0, count), offset)
      offset += count
      if (count === head.length) this.chunks.shift()
      else this.chunks[0] = head.slice(count)
      this.sampleCount -= count
    }
    return output
  }
}
