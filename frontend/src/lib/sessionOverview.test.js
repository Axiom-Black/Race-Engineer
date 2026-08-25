// The figures a driver reads FIRST. A wrong number here is worse than a wrong
// number three tabs deep, because it is the one they will quote.
//
// Channel values are the real fixture's: Ground Speed 0–245.98 km/h,
// Fuel Level 79.92–93.0 l (golden_master_ld.json, 25 Aug 2026).
import { describe, it, expect } from 'vitest'
import {
  channel,
  statFrom,
  fmtLapTime,
  headlineStats,
  sessionSubtitle,
  STAT,
} from './sessionOverview.js'

const CHANNELS = [
  { name: 'Ground Speed', unit: 'km/h', min: 0, max: 245.98, allZero: false, reliable: true },
  { name: 'Fuel Level', unit: 'l', min: 79.92, max: 93.0, allZero: false, reliable: true },
  { name: 'Tyre Load FL', unit: 'N', min: 0, max: 0, allZero: true, reliable: true },
  { name: 'Grip Fract FL', unit: '', min: 0, max: 0, allZero: false, reliable: false },
]

const SESSION = { lap_count: 3, fastest_lap_no: 2, fastest_lap_s: 135.475 }
const LAPS = [
  { lap_no: 0, lap_time_s: null, valid: false, summary: { kind: 'out' } },
  { lap_no: 1, lap_time_s: 138.78, valid: true, summary: { kind: 'timed' } },
  { lap_no: 2, lap_time_s: 135.5, valid: true, summary: { kind: 'timed' } },
  { lap_no: 3, lap_time_s: 136.2, valid: true, summary: { kind: 'timed' } },
]

describe('channel lookup', () => {
  it('finds by exact name', () => {
    expect(channel(CHANNELS, 'Fuel Level').unit).toBe('l')
  })
  it('returns null rather than throwing on absent or malformed input', () => {
    expect(channel(CHANNELS, 'Nope')).toBeNull()
    expect(channel(null, 'Ground Speed')).toBeNull()
    expect(channel(undefined, 'Ground Speed')).toBeNull()
  })
})

describe('statFrom — the flagging bar', () => {
  it('reads a peak from a healthy channel', () => {
    expect(statFrom(CHANNELS, 'Ground Speed', 'max')).toEqual({
      status: STAT.OK, value: 245.98, unit: 'km/h', name: 'Ground Speed',
    })
  })

  it('reads a range as max - min, which is what "used" means', () => {
    const s = statFrom(CHANNELS, 'Fuel Level', 'range')
    expect(s.status).toBe(STAT.OK)
    expect(s.value).toBeCloseTo(13.08, 5)
  })

  it('refuses to report an all-zero channel as a number', () => {
    // The bug this closes: "0.0 L used" reads as "I used no fuel", not as
    // "we don't know". Known-empty GTE channels must stay visible AND flagged.
    const s = statFrom(CHANNELS, 'Tyre Load FL', 'max')
    expect(s.status).toBe(STAT.EMPTY)
    expect(s.value).toBeNull()
  })

  it('refuses to report an unreliable channel as a number', () => {
    expect(statFrom(CHANNELS, 'Grip Fract FL', 'max').status).toBe(STAT.UNRELIABLE)
  })

  it('reports an absent channel as absent, not as zero', () => {
    expect(statFrom(CHANNELS, 'Not A Channel', 'max')).toEqual({
      status: STAT.ABSENT, value: null, unit: null, name: 'Not A Channel',
    })
  })

  it('treats a non-finite extent as absent rather than rendering NaN', () => {
    const bad = [{ name: 'X', unit: 'u', min: null, max: undefined, allZero: false, reliable: true }]
    expect(statFrom(bad, 'X', 'max').status).toBe(STAT.ABSENT)
  })
})

describe('fmtLapTime', () => {
  it('formats as m:ss.mmm with a zero-padded second', () => {
    expect(fmtLapTime(135.475)).toBe('2:15.475')
    expect(fmtLapTime(65.5)).toBe('1:05.500')
  })
  it('returns null for absent, zero, negative or non-numeric input', () => {
    for (const v of [null, undefined, 0, -1, 'x', NaN]) expect(fmtLapTime(v)).toBeNull()
  })
})

describe('headlineStats', () => {
  it('leads with the four figures in reading order', () => {
    expect(headlineStats(SESSION, LAPS, CHANNELS).map((s) => s.key))
      .toEqual(['laps', 'fastest', 'top', 'fuel'])
  })

  it('counts only timed laps — not the out-lap', () => {
    expect(headlineStats(SESSION, LAPS, CHANNELS)[0].text).toBe('3')
  })

  it('shows the .ldx fastest time, matching the rest of the app', () => {
    // 135.475 (.ldx) rather than 135.5 (.ld trace) — the same precedence
    // lapReconciliation applies everywhere else, so the overview cannot
    // contradict the report one click away.
    expect(headlineStats(SESSION, LAPS, CHANNELS)[1].text).toBe('2:15.475')
  })

  it('does NOT headline a fastest lap the telemetry cannot support', () => {
    // The pre-P0 demo shape: summary claims lap 2, trace holds one partial.
    const laps = [{ lap_no: 0, lap_time_s: null, valid: false, summary: { kind: 'partial' } }]
    const [lapsStat, fastest] = headlineStats(SESSION, laps, CHANNELS)
    expect(lapsStat.text).toBe('0')
    expect(fastest.text).toBe('—')
    expect(fastest.status).toBe(STAT.ABSENT)
    // Caught by the isolation harness, not by logic tests: the generic
    // channel wording ("not in this export") is nonsense for a lap time.
    expect(fastest.why).toBe('no timed lap')
  })

  it('carries the flag status through to the card, not a fake zero', () => {
    const noFuel = CHANNELS.filter((c) => c.name !== 'Fuel Level')
    const fuel = headlineStats(SESSION, LAPS, noFuel).find((s) => s.key === 'fuel')
    expect(fuel.text).toBe('—')
    expect(fuel.status).toBe(STAT.ABSENT)
  })

  it('survives null inputs without throwing', () => {
    expect(() => headlineStats(null, null, null)).not.toThrow()
    expect(headlineStats(null, null, null)).toHaveLength(4)
  })
})

describe('sessionSubtitle', () => {
  it('joins what is known, in order', () => {
    expect(sessionSubtitle({
      car: 'Ferrari 488 GTE', car_class: 'GTE', session_type: 'practice', driver: 'DRIVER',
    })).toBe('Ferrari 488 GTE · GTE · practice · DRIVER')
  })
  it('omits missing and blank parts rather than leaving empty separators', () => {
    expect(sessionSubtitle({ car: 'Ferrari 488 GTE', car_class: null, driver: '  ' }))
      .toBe('Ferrari 488 GTE')
  })
  it('returns null when nothing is known', () => {
    expect(sessionSubtitle({})).toBeNull()
    expect(sessionSubtitle(null)).toBeNull()
  })
})
