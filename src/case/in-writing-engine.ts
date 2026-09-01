export type CallState = 'ready' | 'listening' | 'signal' | 'review' | 'closed'

interface AcousticSignal {
  id: string
  phraseId: string
  heardAtSeconds: number
  score: number
}

const TOOLSETS: Record<CallState, readonly string[]> = {
  ready: ['case_clock', 'case_history', 'recording_boundary', 'start_listening'],
  listening: [
    'case_clock',
    'case_history',
    'get_transcript_since',
    'recording_boundary',
    'stop_listening',
  ],
  signal: [
    'case_clock',
    'check_statement',
    'danger',
    'explain_source',
    'get_transcript_since',
    'stop_listening',
  ],
  review: [
    'case_clock',
    'danger',
    'explain_source',
    'get_transcript_since',
    'prepare_validation_facts',
    'stop_listening',
  ],
  closed: ['case_clock', 'explain_source'],
}

export class InWritingEngine {
  state: CallState = 'ready'
  readonly toolCountHistory = [TOOLSETS.ready.length]
  private readonly signals: AcousticSignal[] = []
  private readonly listeners = new Set<() => void>()
  private liveTrackBound = false

  activeToolNames(): string[] {
    return [...TOOLSETS[this.state]].sort()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  bindLiveTrack(): void {
    this.liveTrackBound = true
    this.signals.length = 0
    this.transition('listening')
  }

  startListening():
    | { ok: true; state: 'listening'; trackHeldInPage: true }
    | { ok: false; reason: 'human-gesture-required'; state: CallState } {
    if (!this.liveTrackBound) {
      return { ok: false, reason: 'human-gesture-required', state: this.state }
    }
    if (this.state !== 'listening') this.transition('listening')
    return { ok: true, state: 'listening', trackHeldInPage: true }
  }

  recordSignal(phraseId: string, heardAtSeconds: number, score: number): AcousticSignal {
    if (this.state !== 'listening' && this.state !== 'signal') {
      throw new Error('Live listening state required')
    }
    const signal = {
      id: `signal-${this.signals.length + 1}`,
      phraseId,
      heardAtSeconds,
      score,
    }
    this.signals.push(signal)
    this.transition('signal')
    return signal
  }

  getSignalSince(cursor: number): {
    newCursor: number
    signals: AcousticSignal[]
    fullTranscriptStoredWords: 0
  } {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.signals.length) {
      throw new Error('cursor must be an integer in the retained signal range')
    }
    return {
      newCursor: this.signals.length,
      signals: this.signals.slice(cursor),
      fullTranscriptStoredWords: 0,
    }
  }

  caseClock(): {
    noticeReceived: string
    asOf: string
    section: string
    statutoryDays: number
    daysElapsed: number
    daysRemaining: number
    demoOnly: true
  } {
    return {
      noticeReceived: '2026-08-12',
      asOf: '2026-09-02',
      section: '15 U.S.C. §1692g',
      statutoryDays: 30,
      daysElapsed: 21,
      daysRemaining: 9,
      demoOnly: true,
    }
  }

  caseHistory(): {
    lastActivity: string
    displayedBalanceUsd: number
    legalStatus: 'not-determined'
    demoOnly: true
  } {
    return {
      lastActivity: '2019-03-03',
      displayedBalanceUsd: 9240,
      legalStatus: 'not-determined',
      demoOnly: true,
    }
  }

  recordingBoundary(): {
    audio: 'synthetic-only'
    trackLocation: 'page-memory'
    fullTranscriptStoredWords: 0
    consentRule: 'varies-by-jurisdiction'
  } {
    return {
      audio: 'synthetic-only',
      trackLocation: 'page-memory',
      fullTranscriptStoredWords: 0,
      consentRule: 'varies-by-jurisdiction',
    }
  }

  checkStatement(signalId: string): {
    signalId: string
    classification: 'payment-request'
    sourceId: 'ftc-time-barred-debt'
    scope: 'some-states'
    legalStatus: 'not-determined'
  } {
    if (!this.signals.some((signal) => signal.id === signalId)) {
      throw new Error('Unknown live signal')
    }
    return {
      signalId,
      classification: 'payment-request',
      sourceId: 'ftc-time-barred-debt',
      scope: 'some-states',
      legalStatus: 'not-determined',
    }
  }

  danger(act: string): {
    act: 'make-good-faith-payment'
    phraseId: 'good-faith-payment'
    displayedBalanceUsd: 9240
    consequence: string
    source: string
    scope: 'some-states'
    legalStatus: 'not-determined'
    externalActionTaken: false
  } {
    if (act !== 'make-good-faith-payment') throw new Error('Unsupported act')
    if (!this.signals.some((signal) => signal.phraseId === 'good-faith-payment')) {
      throw new Error('No matching live signal')
    }
    if (this.state === 'signal') this.transition('review')
    return {
      act: 'make-good-faith-payment',
      phraseId: 'good-faith-payment',
      displayedBalanceUsd: 9240,
      consequence: 'FTC guidance says a payment could restart a limitations period in some states.',
      source: 'FTC consumer guidance on time-barred debt',
      scope: 'some-states',
      legalStatus: 'not-determined',
      externalActionTaken: false,
    }
  }

  explainSource(sourceId: string): {
    sourceId: string
    authority: string
    url: string
    fact: string
  } {
    if (sourceId === 'usc-1692g') {
      return {
        sourceId,
        authority: '15 U.S.C. §1692g',
        url: 'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-section1692g',
        fact: 'The sample clock is computed from receipt of the written notice.',
      }
    }
    if (sourceId !== 'ftc-time-barred-debt') throw new Error('Unknown source')
    return {
      sourceId,
      authority: 'U.S. Federal Trade Commission',
      url: 'https://consumer.ftc.gov/articles/debt-collection-faqs',
      fact: 'FTC guidance says a payment or acknowledgement can restart the limitations period in some states.',
    }
  }

  prepareValidationFacts(): {
    noticeReceived: string
    section: string
    daysRemaining: number
    externalActionTaken: false
    humanActionRequired: true
  } {
    if (this.state !== 'review') throw new Error('Review state required')
    return {
      noticeReceived: '2026-08-12',
      section: '15 U.S.C. §1692g',
      daysRemaining: 9,
      externalActionTaken: false,
      humanActionRequired: true,
    }
  }

  stopListening(): { state: 'closed'; trackReleased: true } {
    this.liveTrackBound = false
    this.transition('closed')
    return { state: 'closed', trackReleased: true }
  }

  private transition(next: CallState): void {
    if (this.state === next) return
    this.state = next
    this.toolCountHistory.push(TOOLSETS[next].length)
    for (const listener of this.listeners) listener()
  }
}
