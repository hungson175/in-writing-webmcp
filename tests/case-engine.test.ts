import { describe, expect, it } from 'vitest'

import { InWritingEngine } from '../src/case/in-writing-engine'

describe('InWritingEngine', () => {
  it('keeps every state at six or fewer purpose-specific tools', () => {
    const engine = new InWritingEngine()

    expect(engine.state).toBe('ready')
    expect(engine.activeToolNames()).toEqual([
      'case_clock',
      'case_history',
      'recording_boundary',
      'start_listening',
    ])
    engine.bindLiveTrack()
    expect(engine.activeToolNames()).toEqual([
      'case_clock',
      'case_history',
      'get_transcript_since',
      'recording_boundary',
      'stop_listening',
    ])
    engine.recordSignal('good-faith-payment', 8.01, 0.94)
    expect(engine.activeToolNames()).toEqual([
      'case_clock',
      'check_statement',
      'danger',
      'explain_source',
      'get_transcript_since',
      'stop_listening',
    ])
    engine.danger('make-good-faith-payment')
    expect(engine.activeToolNames()).toEqual([
      'case_clock',
      'danger',
      'explain_source',
      'get_transcript_since',
      'prepare_validation_facts',
      'stop_listening',
    ])
    engine.stopListening()
    expect(engine.activeToolNames()).toEqual(['case_clock', 'explain_source'])

    for (const count of engine.toolCountHistory) expect(count).toBeLessThanOrEqual(6)
  })

  it('returns cursor deltas without ever returning a full call transcript', () => {
    const engine = new InWritingEngine()
    engine.bindLiveTrack()
    engine.recordSignal('good-faith-payment', 8.01, 0.94)

    const first = engine.getSignalSince(0)
    const second = engine.getSignalSince(first.newCursor)

    expect(first).toMatchObject({
      newCursor: 1,
      signals: [{ id: 'signal-1', phraseId: 'good-faith-payment' }],
      fullTranscriptStoredWords: 0,
    })
    expect(first).not.toHaveProperty('transcript')
    expect(second).toEqual({
      newCursor: 1,
      signals: [],
      fullTranscriptStoredWords: 0,
    })
  })

  it('refuses unsupported acts and reports dated facts without advice', () => {
    const engine = new InWritingEngine()
    expect(() => engine.danger('make-good-faith-payment')).toThrow('No matching live signal')
    engine.bindLiveTrack()
    engine.recordSignal('good-faith-payment', 8.01, 0.94)

    const result = engine.danger('make-good-faith-payment')
    const text = JSON.stringify(result).toLowerCase()

    expect(result).toMatchObject({
      act: 'make-good-faith-payment',
      displayedBalanceUsd: 9240,
      legalStatus: 'not-determined',
      scope: 'some-states',
      externalActionTaken: false,
    })
    expect(text).not.toMatch(/\b(should|advise|recommend)\b/)
    expect(text).toContain('could restart')
    expect(text).toContain('ftc')
  })

  it('uses receipt date for the §1692g demo clock and keeps the send human-only', () => {
    const engine = new InWritingEngine()
    const clock = engine.caseClock()
    expect(clock).toEqual({
      noticeReceived: '2026-08-12',
      asOf: '2026-09-02',
      section: '15 U.S.C. §1692g',
      statutoryDays: 30,
      daysElapsed: 21,
      daysRemaining: 9,
      demoOnly: true,
    })

    engine.bindLiveTrack()
    engine.recordSignal('good-faith-payment', 8.01, 0.94)
    engine.danger('make-good-faith-payment')
    expect(engine.prepareValidationFacts()).toMatchObject({
      noticeReceived: '2026-08-12',
      daysRemaining: 9,
      externalActionTaken: false,
      humanActionRequired: true,
    })
    expect(engine.activeToolNames()).not.toContain('send_letter')
  })
})
