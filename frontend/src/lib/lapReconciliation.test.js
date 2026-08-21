// Fixtures here are the ACTUAL rows from the production Supabase project after
// the 21 Aug 2026 acceptance run — not invented shapes. Both defects this
// module addresses were found in that data, so the regression tests reproduce
// it exactly.
import { describe, it, expect } from 'vitest'
import {
  reconcile,
  isFastestLap,
  displayLapTimeS,
  timedLaps,
  RECONCILE,
  DRIFT_TOLERANCE_S,
} from './lapReconciliation.js'

// Real upload: Ferrari 296 LMGT3, COTA. 5 segments -> 3 timed laps.
// sessions.fastest_lap_s = 135.475 (.ldx) vs laps[2].lap_time_s = 135.5 (.ld).
const REAL_SESSION = {
  lap_count: 3,
  fastest_lap_no: 2,
  fastest_lap_s: 135.475,
}
const REAL_LAPS = [
  { lap_no: 0, lap_time_s: null, valid: false, summary: { kind: 'out' } },
  { lap_no: 1, lap_time_s: 138.78, valid: true, summary: { kind: 'timed' } },
  { lap_no: 2, lap_time_s: 135.5, valid: true, summary: { kind: 'timed' } },
  { lap_no: 3, lap_time_s: 136.2, valid: true, summary: { kind: 'timed' } },
  { lap_no: 4, lap_time_s: null, valid: false, summary: { kind: 'partial' } },
]

// Seeded demo: the committed fixture. Its .ldx claims 3 laps with lap 2
// fastest; its truncated .ld yields ONE partial segment. Every new account
// sees this session.
const DEMO_SESSION = {
  lap_count: 3,
  fastest_lap_no: 2,
  fastest_lap_s: 135.475,
}
const DEMO_LAPS = [{ lap_no: 0, lap_time_s: null, valid: false, summary: { kind: 'partial' } }]

describe('timedLaps', () => {
  it('counts only laps bounded by two crossings', () => {
    expect(timedLaps(REAL_LAPS).map((l) => l.lap_no)).toEqual([1, 2, 3])
  })

  it('excludes out-laps and partials even though they hold real trace data', () => {
    expect(timedLaps(DEMO_LAPS)).toEqual([])
  })

  it('tolerates a missing lap list', () => {
    expect(timedLaps(undefined)).toEqual([])
  })
})

describe('the real production upload', () => {
  it('raises NO flags — the 25 ms gap is sample-grid noise, not a conflict', () => {
    // 135.500 - 135.475 = 25 ms, inside one sample period. Flagging this would
    // fire on essentially every real upload, which is noise rather than
    // information. The display rule below is what removes the discrepancy a
    // driver would actually see.
    const { flags, timedCount } = reconcile(REAL_SESSION, REAL_LAPS)
    expect(timedCount).toBe(3) // matches .ldx "Total Laps 3"
    expect(flags).toEqual([])
  })

  it('spells out both numbers when drift IS large enough to flag', () => {
    const S = { ...REAL_SESSION, fastest_lap_s: 134.0 } // 1.5 s apart
    const [f] = reconcile(S, REAL_LAPS).flags
    expect(f.code).toBe(RECONCILE.FASTEST_TIME_DRIFT)
    expect(f.detail).toContain('134.000')
    expect(f.detail).toContain('135.500')
    expect(f.severity).toBe('low')
  })

  it('resolves the fastest lap to the real lap 2', () => {
    const { fastestLap } = reconcile(REAL_SESSION, REAL_LAPS)
    expect(fastestLap.lap_no).toBe(2)
  })

  it('prefers the .ldx time for the fastest lap, and the trace time elsewhere', () => {
    // This is what removes the visible 135.475-vs-135.500 contradiction.
    expect(displayLapTimeS(REAL_LAPS[2], REAL_SESSION, REAL_LAPS)).toBe(135.475)
    expect(displayLapTimeS(REAL_LAPS[1], REAL_SESSION, REAL_LAPS)).toBe(138.78)
  })

  it('marks only lap 2 as fastest', () => {
    expect(REAL_LAPS.filter((l) => isFastestLap(l, REAL_SESSION, REAL_LAPS)).map((l) => l.lap_no))
      .toEqual([2])
  })
})

describe('the seeded demo session — the summary names a lap that does not exist', () => {
  it('raises the unverified-fastest-lap flag, high severity', () => {
    const { flags } = reconcile(DEMO_SESSION, DEMO_LAPS)
    const codes = flags.map((f) => f.code)
    expect(codes).toContain(RECONCILE.FASTEST_LAP_ABSENT)
    expect(flags[0].severity).toBe('high') // most severe first
  })

  it('also raises the lap-count mismatch: 3 claimed, 0 timed', () => {
    const { flags, timedCount } = reconcile(DEMO_SESSION, DEMO_LAPS)
    expect(timedCount).toBe(0)
    const m = flags.find((f) => f.code === RECONCILE.LAP_COUNT_MISMATCH)
    expect(m.detail).toContain('3 laps')
    expect(m.detail).toContain('0 complete timed laps')
  })

  it('does NOT mark the lone partial lap as fastest', () => {
    // The bug this closes: `lap.lap_no === session.fastest_lap_no` would also
    // fail here, but silently — nothing would ever be marked, with no
    // explanation shown to the driver.
    expect(isFastestLap(DEMO_LAPS[0], DEMO_SESSION, DEMO_LAPS)).toBe(false)
    expect(reconcile(DEMO_SESSION, DEMO_LAPS).fastestLap).toBeNull()
  })

  it('does not claim a time drift it cannot possibly measure', () => {
    const codes = reconcile(DEMO_SESSION, DEMO_LAPS).flags.map((f) => f.code)
    expect(codes).not.toContain(RECONCILE.FASTEST_TIME_DRIFT)
  })
})

describe('a fully self-consistent session', () => {
  const S = { lap_count: 1, fastest_lap_no: 1, fastest_lap_s: 100 }
  const L = [{ lap_no: 1, lap_time_s: 100, valid: true, summary: { kind: 'timed' } }]

  it('raises no flags at all', () => {
    expect(reconcile(S, L).flags).toEqual([])
  })
})

describe('edge cases', () => {
  it('stays silent when the summary carries no fastest lap', () => {
    const S = { lap_count: 0, fastest_lap_no: null, fastest_lap_s: null }
    expect(reconcile(S, []).flags).toEqual([])
  })

  it('treats drift at exactly the tolerance as sample-grid noise, not conflict', () => {
    const S = { lap_count: 1, fastest_lap_no: 1, fastest_lap_s: 100 }
    const L = [
      { lap_no: 1, lap_time_s: 100 + DRIFT_TOLERANCE_S, valid: true, summary: { kind: 'timed' } },
    ]
    expect(reconcile(S, L).flags).toEqual([])
  })

  it('flags drift just beyond the tolerance', () => {
    const S = { lap_count: 1, fastest_lap_no: 1, fastest_lap_s: 100 }
    const L = [{ lap_no: 1, lap_time_s: 100.06, valid: true, summary: { kind: 'timed' } }]
    expect(reconcile(S, L).flags.map((f) => f.code)).toEqual([RECONCILE.FASTEST_TIME_DRIFT])
  })

  it('refuses to treat an out-lap as the fastest lap', () => {
    // A summary pointing at an out-lap is as unsupported as one pointing at
    // nothing at all.
    const S = { lap_count: 1, fastest_lap_no: 0, fastest_lap_s: 174.3 }
    const { flags, fastestLap } = reconcile(S, REAL_LAPS)
    expect(fastestLap).toBeNull()
    expect(flags.map((f) => f.code)).toContain(RECONCILE.FASTEST_LAP_ABSENT)
  })

  it('survives null/empty inputs without throwing', () => {
    expect(() => reconcile(null, null)).not.toThrow()
    expect(reconcile(null, null).flags).toEqual([])
    expect(displayLapTimeS(null, null, null)).toBeNull()
    expect(isFastestLap(null, null, null)).toBe(false)
  })

  it('handles numeric strings, which is how Postgres returns numerics', () => {
    // sessions.fastest_lap_s came back as the string "135.475" over the wire.
    const S = { lap_count: 3, fastest_lap_no: 2, fastest_lap_s: '135.475' }
    expect(displayLapTimeS(REAL_LAPS[2], S, REAL_LAPS)).toBe(135.475)
    expect(reconcile(S, REAL_LAPS).flags).toEqual([])
    // A string must not silently defeat the drift comparison either.
    const drifted = { ...S, fastest_lap_s: '134.0' }
    expect(reconcile(drifted, REAL_LAPS).flags.map((f) => f.code))
      .toEqual([RECONCILE.FASTEST_TIME_DRIFT])
  })
})
