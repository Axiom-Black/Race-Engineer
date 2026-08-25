import { describe, it, expect } from 'vitest'
import { personalBest, thermalPeaks, tyreCompound, circuitHistory } from './sessionSummary.js'

const S = (id, over = {}) => ({
  id, venue: 'COTA', car: 'Ferrari 488 GTE', is_demo: false,
  fastest_lap_s: 140, recorded_at: '2026-06-01T00:00:00Z', session_type: 'practice', ...over,
})
const CUR = S('cur', { fastest_lap_s: 135.475, recorded_at: '2026-06-30T00:00:00Z' })

describe('personalBest', () => {
  it('INCLUDES the current session — today can be the best', () => {
    // A personal best that excluded the session you are looking at would read
    // as wrong every time you set one.
    const pb = personalBest([CUR, S('a', { fastest_lap_s: 140 })], CUR)
    expect(pb.timeS).toBe(135.475)
    expect(pb.isCurrent).toBe(true)
  })

  it('finds an older, faster lap and marks it as not current', () => {
    const pb = personalBest([CUR, S('old', { fastest_lap_s: 133.1 })], CUR)
    expect(pb.timeS).toBe(133.1)
    expect(pb.isCurrent).toBe(false)
  })

  it('excludes the seeded demo — no borrowed personal best', () => {
    const pb = personalBest([CUR, S('demo', { is_demo: true, fastest_lap_s: 100 })], CUR)
    expect(pb.timeS).toBe(135.475)
  })

  it('ignores other circuits and other cars', () => {
    const pool = [
      CUR,
      S('seb', { venue: 'Sebring', fastest_lap_s: 90 }),
      S('other', { car: 'Porsche 911 RSR', fastest_lap_s: 91 }),
    ]
    expect(personalBest(pool, CUR).timeS).toBe(135.475)
  })

  it('ignores absent, zero and non-numeric times rather than treating them as fast', () => {
    const pool = [CUR, S('a', { fastest_lap_s: null }), S('b', { fastest_lap_s: 0 })]
    expect(personalBest(pool, CUR).timeS).toBe(135.475)
  })

  it('handles a numeric string, which is how Postgres sends numerics', () => {
    const pool = [CUR, S('a', { fastest_lap_s: '130.5' })]
    expect(personalBest(pool, CUR).timeS).toBe(130.5)
  })

  it('returns null when nothing has a time', () => {
    expect(personalBest([], null)).toBeNull()
    expect(personalBest([], S('x', { fastest_lap_s: null }))).toBeNull()
  })
})

describe('thermalPeaks', () => {
  const ch = (name, max, over = {}) => ({ name, unit: 'C', max, min: 0, allZero: false, reliable: true, ...over })

  it('takes the HOTTEST corner, not a nominated one', () => {
    // Picking FL by convention would hide a right-front problem entirely.
    const peaks = thermalPeaks([
      ch('Brake Temp FL', 400), ch('Brake Temp FR', 806.9),
      ch('Brake Temp RL', 380), ch('Brake Temp RR', 390),
    ])
    expect(peaks.find((p) => p.key === 'brake').value).toBe(806.9)
  })

  it('reads water and oil', () => {
    const peaks = thermalPeaks([ch('Eng Water Temp', 89.32), ch('Eng Oil Temp', 92.86)])
    expect(peaks.find((p) => p.key === 'water').value).toBe(89.32)
    expect(peaks.find((p) => p.key === 'oil').value).toBe(92.86)
  })

  it('returns null values rather than zeros for empty or unreliable channels', () => {
    const peaks = thermalPeaks([
      ch('Brake Temp FL', 0, { allZero: true }),
      ch('Eng Water Temp', 88, { reliable: false }),
    ])
    expect(peaks.find((p) => p.key === 'brake').value).toBeNull()
    expect(peaks.find((p) => p.key === 'water').value).toBeNull()
  })

  it('always returns all three rows, so a missing reading is visible', () => {
    expect(thermalPeaks([]).map((p) => p.key)).toEqual(['brake', 'water', 'oil'])
    expect(thermalPeaks(null).every((p) => p.value === null)).toBe(true)
  })
})

describe('tyreCompound', () => {
  const four = (v) => ({ ldx: { FLCompound: v, FRCompound: v, RLCompound: v, RRCompound: v } })

  it('reports the compound when all four corners agree', () => {
    expect(tyreCompound(four('Soft'))).toEqual({ compound: 'Soft', uniform: true })
  })

  it('says Mixed rather than naming one of them', () => {
    // Reporting "Soft" when only three corners are soft is a quiet lie.
    const setup = { ldx: { FLCompound: 'Soft', FRCompound: 'Soft', RLCompound: 'Medium', RRCompound: 'Medium' } }
    expect(tyreCompound(setup)).toEqual({ compound: 'Mixed', uniform: false })
  })

  it('works from a partial setup', () => {
    expect(tyreCompound({ ldx: { FLCompound: 'Hard' } })).toEqual({ compound: 'Hard', uniform: true })
  })

  it('returns null when the setup carries no compound at all', () => {
    expect(tyreCompound({ ldx: { FLCamber: '-2.3 deg' } })).toBeNull()
    expect(tyreCompound({})).toBeNull()
    expect(tyreCompound(null)).toBeNull()
  })
})

describe('circuitHistory', () => {
  it('orders oldest first, so improvement reads left to right', () => {
    const pool = [
      CUR,
      S('a', { recorded_at: '2026-06-10T00:00:00Z', fastest_lap_s: 138 }),
      S('b', { recorded_at: '2026-06-20T00:00:00Z', fastest_lap_s: 136 }),
    ]
    expect(circuitHistory(pool, CUR).map((r) => r.id)).toEqual(['a', 'b', 'cur'])
  })

  it('marks the session being viewed', () => {
    const rows = circuitHistory([CUR, S('a')], CUR)
    expect(rows.filter((r) => r.isCurrent).map((r) => r.id)).toEqual(['cur'])
  })

  it('never drops the current session when trimming to the limit', () => {
    // A history strip that omits the session you are looking at is
    // disorienting — the oldest kept row is sacrificed instead.
    const old = Array.from({ length: 8 }, (_, i) =>
      S(`s${i}`, { recorded_at: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
    )
    const current = S('cur', { recorded_at: '2026-01-01T00:00:00Z' }) // oldest of all
    const rows = circuitHistory([current, ...old], current, 3)
    expect(rows).toHaveLength(3)
    expect(rows.some((r) => r.isCurrent)).toBe(true)
  })

  it('excludes demos and other circuits', () => {
    const pool = [CUR, S('demo', { is_demo: true }), S('seb', { venue: 'Sebring' })]
    expect(circuitHistory(pool, CUR).map((r) => r.id)).toEqual(['cur'])
  })

  it('returns an empty list rather than throwing without a session', () => {
    expect(circuitHistory([], null)).toEqual([])
  })
})
