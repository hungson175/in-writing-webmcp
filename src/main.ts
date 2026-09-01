import { LiveAudioTrack } from './audio/live-audio'
import { LivePcmRecorder } from './audio/live-pcm-recorder'
import {
  PcmKeywordSpotter,
  decodePcm16Wav,
  type KeywordMatch,
} from './keyword/pcm-keyword-spotter'
import { InWritingEngine } from './case/in-writing-engine'
import {
  DynamicWebMcpRegistry,
  type ModelContextLike,
} from './webmcp/dynamic-registry'
import { publicAssetUrl } from './public-asset-url'

const detectorStatus = document.querySelector<HTMLElement>('#detector-status')!
const playButton = document.querySelector<HTMLButtonElement>('#play-sample')!
const audio = document.querySelector<HTMLAudioElement>('#sample-call')!
const callStatus = document.querySelector<HTMLElement>('#call-status')!
const eventText = document.querySelector<HTMLElement>('#event-text')!
const cursorText = document.querySelector<HTMLElement>('#cursor')!
const factCard = document.querySelector<HTMLElement>('#fact-card')!
const detectedPhrase = document.querySelector<HTMLElement>('[data-testid=detected-phrase]')!
const matchScore = document.querySelector<HTMLElement>('[data-testid=match-score]')!
const webMcpStatus = document.querySelector<HTMLElement>('[data-testid=webmcp-status]')!
const liveToolCount = document.querySelector<HTMLElement>('#live-tool-count')!
const liveTools = document.querySelector<HTMLElement>('#live-tools')!

const recorder = new LivePcmRecorder()
const engine = new InWritingEngine()
const nativeContext = (
  document as Document & { modelContext?: ModelContextLike }
).modelContext ?? null
const registry = new DynamicWebMcpRegistry(engine, nativeContext, (names) => {
  liveToolCount.textContent = String(names.length)
  liveTools.textContent = names.join(' · ') || 'none'
})
let liveAudio: LiveAudioTrack | null = null
let spotter: PcmKeywordSpotter | null = null
let signalCursor = 0

function showMatch(match: KeywordMatch): void {
  engine.recordSignal(match.id, match.heardAtSeconds, match.score)
  signalCursor += 1
  cursorText.textContent = `signal ${signalCursor}`
  eventText.textContent = `At ${match.heardAtSeconds.toFixed(1)}s: possible clock-restart phrase heard.`
  detectedPhrase.textContent = match.label
  matchScore.textContent = `acoustic match ${Math.round(match.score * 100)}%`
  factCard.hidden = false
}

async function registerWebMcp(): Promise<void> {
  if (!nativeContext) {
    webMcpStatus.textContent = 'WebMCP unavailable in this browser · local demo remains available'
    return
  }
  try {
    await registry.start()
    webMcpStatus.textContent = 'Native WebMCP ready · dynamic surface capped at six'
  } catch (error) {
    webMcpStatus.textContent = `WebMCP registration failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function preload(): Promise<void> {
  try {
    const response = await fetch(
      publicAssetUrl('keywords/good-faith-payment.wav', document.baseURI),
    )
    if (!response.ok) throw new Error(`template HTTP ${response.status}`)
    const decoded = decodePcm16Wav(await response.arrayBuffer())
    if (decoded.sampleRate !== 16000) throw new Error('template must be 16 kHz')
    spotter = new PcmKeywordSpotter(
      [
        {
          id: 'good-faith-payment',
          label: 'good-faith payment',
          pcm: decoded.pcm,
        },
      ],
      { sampleRate: 16000, threshold: 0.78 },
    )
    detectorStatus.textContent = 'Closed-vocabulary detector ready'
    callStatus.textContent = 'Ready. Audio stays in this tab; no full transcript is created.'
    playButton.disabled = false
  } catch (error) {
    detectorStatus.textContent = `Detector load failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

playButton.addEventListener('click', async () => {
  if (!spotter) return
  playButton.disabled = true
  signalCursor = 0
  spotter.reset()
  eventText.textContent = 'Listening for a bounded set of payment-risk phrases…'
  cursorText.textContent = 'signal 0'
  detectedPhrase.textContent = 'none'
  matchScore.textContent = 'acoustic match pending'
  factCard.hidden = true
  callStatus.textContent = 'Reading the audio element’s live MediaStreamTrack in this tab.'
  audio.currentTime = 0
  liveAudio = LiveAudioTrack.fromElement(audio, { userGesture: true })
  engine.bindLiveTrack()
  await recorder.start(
    liveAudio.track!,
    (pcm) => {
      for (const match of spotter?.push(pcm) ?? []) showMatch(match)
    },
    { windowSeconds: 0.25 },
  )
  await audio.play()
})

audio.addEventListener('ended', () => {
  void (async () => {
    try {
      await recorder.finish()
      callStatus.textContent = 'Synthetic call ended. No full transcript was created or stored.'
    } catch (error) {
      callStatus.textContent = `Local detector stopped: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      liveAudio?.stop()
      liveAudio = null
      playButton.disabled = false
    }
  })()
})

window.addEventListener('beforeunload', () => {
  void recorder.stop()
  liveAudio?.stop()
  registry.stop()
})

void preload()
void registerWebMcp()
