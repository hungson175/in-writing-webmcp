type CaptureAudioElement = HTMLAudioElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

export class LiveAudioTrack {
  private currentTrack: MediaStreamTrack | null

  private constructor(track: MediaStreamTrack) {
    this.currentTrack = track
  }

  static fromElement(
    element: CaptureAudioElement,
    options: { userGesture?: boolean } = {},
  ): LiveAudioTrack {
    if (options.userGesture === false) throw new Error('User gesture required')
    const capture = element.captureStream ?? element.mozCaptureStream
    if (!capture) throw new Error('Audio element captureStream is unavailable')
    const track = capture.call(element).getAudioTracks().find((candidate) => candidate.readyState === 'live')
    if (!track) throw new Error('No live audio track')
    return new LiveAudioTrack(track)
  }

  get track(): MediaStreamTrack | null {
    return this.currentTrack
  }

  get active(): boolean {
    return this.currentTrack !== null
  }

  stop(): void {
    this.currentTrack?.stop()
    this.currentTrack = null
  }
}
