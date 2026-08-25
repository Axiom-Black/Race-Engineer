// The definition under test is the owner's, and it is the whole point:
// a run is a STINT — consecutive timed laps — not a rolling window. These
// tests exist mostly to prove the difference, because the two agree on easy
// data and diverge exactly where it matters: across a pit stop.
import { describe, it, expect } from 'vitest'
import { stintsOf, bestRun, runAverages, stintSummary, lapTime, RUN_SIZES } from './runs.js'

const timed = (no, t) => ({ lap_no: no, lap_time_s: t, valid: true, summary: { kind: 'timed' } })
const out = (no) => ({ lap_no: no, lap_time_s: null, valid: false, summary: { kind: 'out' } })
const partial = (no) => ({ lap_no: no, lap_time_s: null, valid: false, summary: { kind: 'partial' } })

// The real pilot session: out-lap, three timed laps, trailing partial.
const REAL = [out(0), timed(1, 138.78), timed(2, 135.5), timed(3, 136.2), partial(4)]

describe('lapTime', () => {
  it('accepts a numeric string, as Postgres sends it', () => {
    expect(lapTime({ lap_time_s: '135.475' })).toBe(135.475)
  })
  it('rejects null, zero and negatives rather than treating them as fast laps', () => {
    for (const v of [null, undefined, 0, -1, '']) expect(lapTime({ lap_time_s: v })).toBeNull()
  })
})

describe('stintsOf', () => {
  it('finds one stint of three in the real session, excluding out and partial', () => {
    const s = stintsOf(REAL)
    expect(s).toHaveLength(1)
    expect(s[0].map((l) => l.lap_no)).toEqual([1, 2, 3])
  })

  it('SPLITS on an in-lap — this is the case a rolling window gets wrong', () => {
    // Laps 1-2, pit, laps 4-5. A rolling "last 4" would average across the
    // stop and the tyre change; two stints is the truth.
    const laps = [timed(1, 138), timed(2, 137), out(3), timed(4, 136), timed(5, 135)]
    expect(stintsOf(laps).map((st) => st.map((l) => l.lap_no))).toEqual([[1, 2], [4, 5]])
  })

  it('splits on a GAP in lap numbering even when both laps are timed', () => {
    // A missing lap number is a pit stop or a paused export. The two laps are
    // individually fine and are still not consecutive.
    const laps = [timed(1, 138), timed(2, 137), timed(9, 136), timed(10, 135)]
    expect(stintsOf(laps).map((st) => st.map((l) => l.lap_no))).toEqual([[1, 2], [9, 10]])
  })

  it('sorts before splitting — persisted order is not guaranteed', () => {
    // Built from an unsorted list, a stint would be consecutive by accident.
    const laps = [timed(3, 136), timed(1, 138), timed(2, 137)]
    expect(stintsOf(laps)).toHaveLength(1)
    expect(stintsOf(laps)[0].map((l) => l.lap_no)).toEqual([1, 2, 3])
  })

  it('excludes a timed lap with no time — it cannot be part of an average', () => {
    const laps = [timed(1, 138), { ...timed(2, null) }, timed(3, 136)]
    expect(stintsOf(laps).map((st) => st.map((l) => l.lap_no))).toEqual([[1], [3]])
  })

  it('returns nothing for an empty, all-out or absent lap list', () => {
    expect(stintsOf([])).toEqual([])
    expect(stintsOf([out(0), partial(1)])).toEqual([])
    expect(stintsOf(null)).toEqual([])
  })
})

describe('bestRun', () => {
  it('finds the FASTEST window, not the first', () => {
    // 1-3 avg 139, 2-4 avg 136 — the later window is better.
    const laps = [timed(1, 145), timed(2, 140), timed(3, 132), timed(4, 136)]
    const r = bestRun(laps, 3)
    expect(r.avgS).toBeCloseTo(136, 6)
    expect([r.startLapNo, r.endLapNo]).toEqual([2, 4])
  })

  it('refuses to span two stints', () => {
    // Four timed laps exist, but never four in a row.
    const laps = [timed(1, 138), timed(2, 137), out(3), timed(4, 136), timed(5, 135)]
    expect(bestRun(laps, 4)).toBeNull()
    expect(bestRun(laps, 2)).not.toBeNull()
  })

  it('computes the real session 3-lap average', () => {
    // (138.78 + 135.5 + 136.2) / 3
    expect(bestRun(REAL, 3).avgS).toBeCloseTo(136.826666, 5)
  })

  it('returns null when no stint is long enough', () => {
    expect(bestRun(REAL, 5)).toBeNull()
  })

  it('rejects a nonsensical size rather than returning something', () => {
    expect(bestRun(REAL, 0)).toBeNull()
    expect(bestRun(REAL, null)).toBeNull()
  })
})

describe('runAverages', () => {
  it('reports 3/5/7/10 by default', () => {
    expect(runAverages(REAL).map((r) => r.size)).toEqual(RUN_SIZES)
  })

  it('returns a row for every size, marking the unavailable ones', () => {
    // Dropping them would leave a driver unsure whether the figure is
    // unavailable or simply not offered.
    const rows = runAverages(REAL)
    expect(rows.find((r) => r.size === 3).available).toBe(true)
    for (const size of [5, 7, 10]) {
      const row = rows.find((r) => r.size === size)
      expect(row.available).toBe(false)
      expect(row.avgS).toBeNull()
    }
  })

  it('carries the longest stint so the absence can be explained concretely', () => {
    // "needs 5 consecutive laps, longest stint was 3" beats a bare dash.
    expect(runAverages(REAL).every((r) => r.longestStint === 3)).toBe(true)
  })

  it('never falls back to a shorter run to fill a longer slot', () => {
    // Answering "best 10-lap average" with a 3-lap number silently answers a
    // different question.
    const ten = runAverages(REAL).find((r) => r.size === 10)
    expect(ten.avgS).toBeNull()
  })

  it('fills every size once the stint is long enough', () => {
    const laps = Array.from({ length: 12 }, (_, i) => timed(i + 1, 140 - i * 0.1))
    expect(runAverages(laps).every((r) => r.available)).toBe(true)
  })
})

describe('stintSummary', () => {
  it('describes each stint with its span, average and best lap', () => {
    const laps = [timed(1, 138), timed(2, 136), out(3), timed(4, 135), timed(5, 137)]
    const s = stintSummary(laps)
    expect(s).toHaveLength(2)
    expect(s[0]).toMatchObject({ index: 1, lapCount: 2, startLapNo: 1, endLapNo: 2, bestS: 136 })
    expect(s[0].avgS).toBeCloseTo(137, 6)
    expect(s[1]).toMatchObject({ index: 2, lapCount: 2, startLapNo: 4, endLapNo: 5, bestS: 135 })
  })

  it('is empty when there are no timed laps', () => {
    expect(stintSummary([out(0), partial(1)])).toEqual([])
  })
})
