import { describe, it, expect } from 'vitest'
import {
  peakOf,
  comparableSessions,
  historicalPeak,
  delta,
  buildComparison,
  COMPARED_METRICS,
  EPSILON,
} from './sessionCompare.js'

const chans = (over = {}) => [
  { name: 'Ground Speed', unit: 'km/h', max: 245.98, min: 0, allZero: false, reliable: true, ...over['Ground Speed'] },
  { name: 'G Force Lat', unit: 'G', max: 2.1, min: -2.1, allZero: false, reliable: true, ...over['G Force Lat'] },
  { name: 'Engine RPM', unit: 'rpm', max: 7996, min: 0, allZero: false, reliable: true },
]

const S = (id, over = {}) => ({
  id, venue: 'COTA', car: 'Ferrari 488 GTE', is_demo: false,
  summary: { channels: chans() }, ...over,
})

const CURRENT = S('cur')

describe('peakOf', () => {
  it('reads the channel max', () => {
    expect(peakOf(CURRENT, 'Ground Speed')).toBe(245.98)
  })

  it('returns null for an absent channel rather than 0', () => {
    expect(peakOf(CURRENT, 'Nope')).toBeNull()
  })

  it('returns null for an all-zero channel — a comparison against a fake zero is worse than none', () => {
    const s = S('x', { summary: { channels: chans({ 'Ground Speed': { allZero: true, max: 0 } }) } })
    expect(peakOf(s, 'Ground Speed')).toBeNull()
  })

  it('returns null for a parser-flagged unreliable channel', () => {
    const s = S('x', { summary: { channels: chans({ 'Ground Speed': { reliable: false } }) } })
    expect(peakOf(s, 'Ground Speed')).toBeNull()
  })

  it('returns null rather than 0 when max is null — Number(null) is 0 and finite', () => {
    const s = S('x', { summary: { channels: chans({ 'Ground Speed': { max: null } }) } })
    expect(peakOf(s, 'Ground Speed')).toBeNull()
  })

  it('survives a session with no summary', () => {
    expect(peakOf({ id: 'x' }, 'Ground Speed')).toBeNull()
    expect(peakOf(null, 'Ground Speed')).toBeNull()
  })
})

describe('comparableSessions — like against like, or not at all', () => {
  const all = [
    CURRENT,
    S('same'),
    S('otherVenue', { venue: 'Sebring' }),
    S('otherCar', { car: 'Porsche 911 RSR' }),
    S('demo', { is_demo: true }),
  ]

  it('keeps only the same venue and the same car', () => {
    expect(comparableSessions(all, CURRENT).map((s) => s.id)).toEqual(['same'])
  })

  it('excludes the session being compared', () => {
    expect(comparableSessions(all, CURRENT).some((s) => s.id === 'cur')).toBe(false)
  })

  it('EXCLUDES the seeded demo', () => {
    // Every account is seeded with the same COTA fixture. Leaving it in would
    // give every driver an identical phantom past session, and measure their
    // first real COTA run against a stranger's lap.
    expect(comparableSessions(all, CURRENT).some((s) => s.is_demo)).toBe(false)
  })

  it('returns empty rather than throwing on bad input', () => {
    expect(comparableSessions(null, CURRENT)).toEqual([])
    expect(comparableSessions(all, null)).toEqual([])
  })
})

describe('historicalPeak', () => {
  it('averages the peaks and reports the sample size', () => {
    const a = S('a', { summary: { channels: chans({ 'Ground Speed': { max: 240 } }) } })
    const b = S('b', { summary: { channels: chans({ 'Ground Speed': { max: 250 } }) } })
    expect(historicalPeak([CURRENT, a, b], CURRENT, 'Ground Speed')).toEqual({ avg: 245, n: 2 })
  })

  it('ignores peers whose channel cannot be trusted, and counts only what it used', () => {
    const a = S('a', { summary: { channels: chans({ 'Ground Speed': { max: 240 } }) } })
    const bad = S('b', { summary: { channels: chans({ 'Ground Speed': { allZero: true } }) } })
    expect(historicalPeak([CURRENT, a, bad], CURRENT, 'Ground Speed')).toEqual({ avg: 240, n: 1 })
  })

  it('returns null when there is no history — the first session at a circuit', () => {
    expect(historicalPeak([CURRENT], CURRENT, 'Ground Speed')).toBeNull()
  })
})

describe('delta', () => {
  it('reports magnitude and direction', () => {
    expect(delta(246, 240, true)).toEqual({ diff: 6, magnitude: 6, direction: 'up', better: true })
  })

  it('separates direction from verdict — down can be better', () => {
    // The arrow always points where the number moved; `better` carries the
    // judgement. A driver reading ▼ never has to work out whether down is good.
    const d = delta(90, 100, false)
    expect(d.direction).toBe('down')
    expect(d.better).toBe(true)
  })

  it('treats a difference below EPSILON as no change, not as an arrow', () => {
    const d = delta(100, 100 + EPSILON / 2, true)
    expect(d).toEqual({ diff: 0, magnitude: 0, direction: 'same', better: null })
  })

  it('returns null rather than NaN when either side is missing', () => {
    expect(delta(null, 5)).toBeNull()
    expect(delta(5, undefined)).toBeNull()
  })
})

describe('buildComparison', () => {
  it('returns a row for every metric, even ones the export lacks', () => {
    // Dropping absent metrics silently shortens the list and leaves a driver
    // wondering whether the metric exists at all.
    const rows = buildComparison(CURRENT, [CURRENT])
    expect(rows).toHaveLength(COMPARED_METRICS.length)
    expect(rows.find((r) => r.key === 'brakePeak').value).toBeNull()
  })

  it('has no vsHistory on the first session at a venue', () => {
    const rows = buildComparison(CURRENT, [CURRENT])
    expect(rows.every((r) => r.vsHistory === null)).toBe(true)
  })

  it('compares against history when there is some', () => {
    const past = S('p', { summary: { channels: chans({ 'Ground Speed': { max: 240 } }) } })
    const row = buildComparison(CURRENT, [CURRENT, past]).find((r) => r.key === 'topSpeed')
    expect(row.history).toEqual({ avg: 240, n: 1 })
    expect(row.vsHistory.direction).toBe('up')
    expect(row.vsHistory.better).toBe(true)
    expect(row.vsHistory.magnitude).toBeCloseTo(5.98, 2)
  })

  it('does not pass a verdict on metrics that have none', () => {
    // A hotter brake is not better or worse without a target window.
    expect(COMPARED_METRICS.find((m) => m.key === 'brakePeak').higherBetter).toBeNull()
    expect(COMPARED_METRICS.find((m) => m.key === 'maxRpm').higherBetter).toBeNull()
  })
})
