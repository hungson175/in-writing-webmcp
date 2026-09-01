import { PcmWindowBuffer, resamplePcm } from './pcm-window'

export interface AudioFrameLike {
  numberOfFrames: number
  numberOfChannels: number
  sampleRate: number
  copyTo(
    destination: Float32Array,
    options: { planeIndex: number; format: 'f32-planar' },
  ): void
  close(): void
}

export interface TrackReaderLike {
  read(): Promise<
    | { done: false; value: AudioFrameLike }
    | { done: true; value: undefined }
  >
  cancel(): Promise<void>
  releaseLock(): void
}

export interface TrackProcessorLike {
  readable: { getReader(): TrackReaderLike }
}

type TrackProcessorConstructor = new (options: {
  track: MediaStreamTrack
}) => TrackProcessorLike

function defaultProcessor(track: MediaStreamTrack): TrackProcessorLike {
  const Processor = (
    globalThis as typeof globalThis & {
      MediaStreamTrackProcessor?: TrackProcessorConstructor
    }
  ).MediaStreamTrackProcessor
  if (!Processor) throw new Error('MediaStreamTrackProcessor is unavailable')
  return new Processor({ track })
}

export class LivePcmRecorder {
  private readonly createProcessor: (track: MediaStreamTrack) => TrackProcessorLike
  private reader: TrackReaderLike | null = null
  private reading: Promise<void> | null = null
  private windows: PcmWindowBuffer | null = null

  constructor(
    createProcessor: (track: MediaStreamTrack) => TrackProcessorLike = defaultProcessor,
  ) {
    this.createProcessor = createProcessor
  }

  async start(
    track: MediaStreamTrack,
    onWindow: (pcm: Float32Array) => void,
    options: { windowSeconds?: number } = {},
  ): Promise<void> {
    if (this.reader) throw new Error('PCM recorder already active')
    if (track.kind !== 'audio' || track.readyState !== 'live') {
      throw new Error('Live audio track required')
    }

    this.windows = new PcmWindowBuffer(16000, options.windowSeconds ?? 15, onWindow)
    this.reader = this.createProcessor(track).readable.getReader()
    this.reading = this.readFrames(this.reader, this.windows)
  }

  async finish(): Promise<boolean> {
    const windows = this.windows
    await this.haltReader()
    const flushed = windows?.flush() ?? false
    this.windows = null
    return flushed
  }

  async stop(): Promise<void> {
    await this.haltReader()
    this.windows = null
  }

  private async readFrames(
    reader: TrackReaderLike,
    windows: PcmWindowBuffer,
  ): Promise<void> {
    for (;;) {
      const next = await reader.read()
      if (next.done) return
      const frame = next.value
      try {
        if (frame.numberOfChannels < 1 || frame.numberOfFrames < 1) continue
        const mono = new Float32Array(frame.numberOfFrames)
        frame.copyTo(mono, { planeIndex: 0, format: 'f32-planar' })
        windows.push(resamplePcm(mono, frame.sampleRate, 16000))
      } finally {
        frame.close()
      }
    }
  }

  private async haltReader(): Promise<void> {
    const reader = this.reader
    const reading = this.reading
    if (!reader) return
    this.reader = null
    this.reading = null
    await reader.cancel()
    await reading
    reader.releaseLock()
  }
}
