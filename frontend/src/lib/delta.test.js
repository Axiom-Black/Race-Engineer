// S8 acceptance — lap-vs-lap delta time. Pure-function tests, no fixtures
// needed: the properties being asserted are mathematical, and constructing
// laps by hand lets each case pin one behaviour exactly.
import { describe, it, expect } from 'vitest'
import { cumulativeLapTime, sampleAtDistance, deltaTrace, fmtDelta, MIN_SPEED_KMH } from './delta.js'

/** Build a lap of n evenly-distance-spaced points at a constant speed. */
function lap(n, speed, time) {
  return {
    time,
    pts: Array.from({ length: n }, (_, i) => ({ d: i / (n - 1), s: speed })),
  }
}

describe('cumulativeLapTime', () => {
  it('starts at zero and totals exactly the recorded lap time', () => {
    const t = cumulativeLapTime(lap(50, 180, 95.5).pts, 95.5)
    expect(t[0]).toBe(0)
    expect(t[t.length - 1]).toBeCloseTo(95.5, 9)
  })

  it('is monotonically non-decreasing', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ d: i / 39, s: 60 + 120 * Math.sin(i / 5) ** 2 }))
    const t = cumulativeLapTime(pts, 100)
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1])
  })

  it('is linear in distance when speed is constant', () => {
    const t = cumulativeLapTime(lap(11, 200, 100).pts, 100)
    // constant speed -> equal time per equal distance step
    t.forEach((v, i) => expect(v).toBeCloseTo((100 * i) / 10, 6))
  })

  it('spends more time in the slow half than the fast half', () => {
    // first half at 50 km/h, second half at 200 km/h
    const pts = Array.from({ length: 101 }, (_, i) => ({ d: i / 100, s: i < 50 ? 50 : 200 }))
    const t = cumulativeLapTime(pts, 60)
    const half = t[50]
    expect(half).toBeGreaterThan(60 - half) // slow half consumed the majority
  })

  it('returns null for an untimed (in-progress) lap rather than inventing one', () => {
    expect(cumulativeLapTime(lap(10, 100, null).pts, null)).toBeNull()
    expect(cumulativeLapTime(lap(10, 100, 0).pts, 0)).toBeNull()
  })

  it('returns null for a degenerate trace', () => {
    expect(cumulativeLapTime([], 90)).toBeNull()
    expect(cumulativeLapTime([{ d: 0, s: 100 }], 90)).toBeNull()
    expect(cumulativeLapTime(null, 90)).toBeNull()
  })

  it('survives zero/null speed without Infinity or NaN', () => {
    const pts = [
      { d: 0, s: 0 },
      { d: 0.5, s: null },
      { d: 1, s: 120 },
    ]
    const t = cumulativeLapTime(pts, 30)
    expect(t.every((v) => Number.isFinite(v))).toBe(true)
    expect(t[t.length - 1]).toBeCloseTo(30, 9)
    expect(MIN_SPEED_KMH).toBeGreaterThan(0)
  })
})

describe('sampleAtDistance', () => {
  const ds = [0, 0.25, 0.5, 0.75, 1]
  const vs = [0, 10, 20, 30, 40]

  it('interpolates between grid points', () => {
    expect(sampleAtDistance(ds, vs, 0.375)).toBeCloseTo(15, 9)
  })
  it('returns exact values on grid points', () => {
    expect(sampleAtDistance(ds, vs, 0.5)).toBe(20)
  })
  it('clamps outside the range', () => {
    expect(sampleAtDistance(ds, vs, -1)).toBe(0)
    expect(sampleAtDistance(ds, vs, 2)).toBe(40)
  })
})

describe('deltaTrace', () => {
  it('is all zeros for a lap compared against itself', () => {
    const a = lap(60, 150, 88)
    const d = deltaTrace(a, a)
    expect(d).not.toBeNull()
    d.forEach((v) => expect(v).toBeCloseTo(0, 9))
  })

  it('ends at exactly the lap-time difference', () => {
    const a = lap(60, 150, 90.25) // slower lap
    const b = lap(60, 150, 88.00) // reference
    const d = deltaTrace(a, b)
    expect(d[d.length - 1]).toBeCloseTo(2.25, 6)
  })

  it('is negative throughout when the selected lap is faster everywhere', () => {
    const a = lap(60, 150, 85)
    const b = lap(60, 150, 90)
    const d = deltaTrace(a, b)
    expect(d[0]).toBeCloseTo(0, 9)
    d.slice(1).forEach((v) => expect(v).toBeLessThan(0))
  })

  it('aligns laps by distance even when point counts differ', () => {
    const a = lap(60, 150, 90)
    const b = lap(37, 150, 90) // different resolution, same lap time
    const d = deltaTrace(a, b)
    expect(d).toHaveLength(60)
    d.forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-6))
  })

  it('returns null when either lap is untimed', () => {
    expect(deltaTrace(lap(10, 150, 90), lap(10, 150, null))).toBeNull()
    expect(deltaTrace(lap(10, 150, null), lap(10, 150, 90))).toBeNull()
  })
})

describe('fmtDelta', () => {
  it('signs a losing delta and leaves a gaining one negative', () => {
    expect(fmtDelta(0.421)).toBe('+0.421')
    expect(fmtDelta(-0.421)).toBe('-0.421')
    expect(fmtDelta(null)).toBe('—')
  })
})
