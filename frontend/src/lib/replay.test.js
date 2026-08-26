import { describe, it, expect } from 'vitest'
import { lapTimeAxis, advanceTime, indexAtTime, timeAtIndex } from './replay.js'

// A lap where the car crawls through the first half and flies down the second.
// Under the old index-rate replay this played back at a constant sweep; the
// point of a time axis is that it does not.
const SLOW_THEN_FAST = [
  { d: 0, s: 50 },
  { d: 0.25, s: 50 },
  { d: 0.5, s: 50 },
  { d: 0.75, s: 200 },
  { d: 1, s: 200 },
]

describe('lapTimeAxis', () => {
  it('spends more of the lap time on the slow half, which is where it went', () => {
    const t = lapTimeAxis(SLOW_THEN_FAST, 100)
    expect(t[0]).toBe(0)
    expect(t[t.length - 1]).toBeCloseTo(100, 6)
    // Half the DISTANCE at a quarter of the speed: the slow half must take far
    // more than half the time. An index-rate replay gave it exactly half.
    expect(t[2]).toBeGreaterThan(70)
  })

  it('is null when the lap has no recorded time', () => {
    // An out-lap has no duration; replaying it would mean inventing a pace.
    expect(lapTimeAxis(SLOW_THEN_FAST, null)).toBeNull()
    expect(lapTimeAxis(SLOW_THEN_FAST, 0)).toBeNull()
    expect(lapTimeAxis([], 90)).toBeNull()
  })
})

describe('advanceTime', () => {
  it('advances by real seconds times the rate', () => {
    expect(advanceTime(10, 0.5, 100, 2)).toBeCloseTo(11, 6)
    expect(advanceTime(10, 0.5, 100, 0.5)).toBeCloseTo(10.25, 6)
  })

  it('wraps at the end rather than stopping', () => {
    // A lap is a loop; halting on the last sample forces a re-scrub.
    expect(advanceTime(99.5, 1, 100, 1)).toBeCloseTo(0.5, 6)
  })

  it('lands where the car would be after a long stall, not back at the line', () => {
    // A backgrounded tab hands back one enormous frame. Modulo keeps the
    // replay honest; a reset would teleport it to the start.
    expect(advanceTime(10, 250, 100, 1)).toBeCloseTo(60, 6)
  })

  it('returns 0 when there is no lap to play', () => {
    expect(advanceTime(10, 1, null)).toBe(0)
    expect(advanceTime(10, 1, 0)).toBe(0)
  })

  it('holds position on a nonsense frame time', () => {
    expect(advanceTime(10, NaN, 100)).toBe(10)
  })
})

describe('indexAtTime', () => {
  const times = lapTimeAxis(SLOW_THEN_FAST, 100)

  it('shows the point the car was at, at that moment', () => {
    expect(indexAtTime(times, 0)).toBe(0)
    expect(indexAtTime(times, 100)).toBe(times.length - 1)
  })

  it('spends most of the playback in the slow half — the density fix in one line', () => {
    // At the halfway mark of the LAP TIME the car is still in the slow first
    // half. Index-rate playback would have it three quarters of the way round.
    expect(indexAtTime(times, 50)).toBeLessThan(2)
  })

  it('survives an absent axis', () => {
    expect(indexAtTime(null, 5)).toBe(0)
    expect(indexAtTime([], 5)).toBe(0)
  })
})

describe('timeAtIndex', () => {
  const times = lapTimeAxis(SLOW_THEN_FAST, 100)

  it('round-trips with indexAtTime, so scrubbing resumes where it was dropped', () => {
    for (let i = 0; i < times.length; i++) {
      expect(indexAtTime(times, timeAtIndex(times, i))).toBe(i)
    }
  })

  it('clamps rather than returning undefined', () => {
    expect(timeAtIndex(times, -5)).toBe(0)
    expect(timeAtIndex(times, 999)).toBeCloseTo(100, 6)
    expect(timeAtIndex(null, 2)).toBe(0)
  })
})
