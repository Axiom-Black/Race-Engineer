import { describe, it, expect } from 'vitest'
import {
  ALL,
  DEFAULT_TIERS,
  applyFilters,
  closenessPct,
  fmtGap,
  fmtLap,
  groupCombos,
  minMax,
  optionsOf,
  pctOff,
  tierNameFor,
  trendDirection,
} from './progression.js'

// Helper: a persisted session row, only the fields the rollup reads.
function sess(over = {}) {
  return {
    venue: 'COTA',
    car: 'Porsche 963',
    car_class: 'Hypercar',
    session_type: 'Practice',
    fastest_lap_s: 100,
    created_at: '2026-08-01T00:00:00Z',
    is_demo: false,
    ...over,
  }
}

describe('groupCombos', () => {
  it('groups by venue × car × session type', () => {
    const combos = groupCombos([
      sess({ fastest_lap_s: 101 }),
      sess({ fastest_lap_s: 99, created_at: '2026-08-02T00:00:00Z' }),
      sess({ car: 'Ferrari 499P', fastest_lap_s: 98 }),
      sess({ venue: 'Spa', fastest_lap_s: 120 }),
    ])
    expect(combos).toHaveLength(3)
    const cota963 = combos.find((c) => c.venue === 'COTA' && c.car === 'Porsche 963')
    expect(cota963.count).toBe(2)
    expect(cota963.bestEver).toBe(99)
  })

  it('excludes the seeded demo session from real stats', () => {
    // Standing bar: sample data must never contaminate a driver's numbers.
    const combos = groupCombos([sess({ fastest_lap_s: 50, is_demo: true }), sess()])
    expect(combos).toHaveLength(1)
    expect(combos[0].bestEver).toBe(100)
    expect(combos[0].count).toBe(1)
  })

  it('skips sessions with no fastest lap (out-laps only, aborted runs)', () => {
    expect(groupCombos([sess({ fastest_lap_s: null })])).toHaveLength(0)
  })

  it('orders runs chronologically regardless of input order', () => {
    const combos = groupCombos([
      sess({ fastest_lap_s: 97, created_at: '2026-08-03T00:00:00Z' }),
      sess({ fastest_lap_s: 101, created_at: '2026-08-01T00:00:00Z' }),
      sess({ fastest_lap_s: 99, created_at: '2026-08-02T00:00:00Z' }),
    ])
    expect(combos[0].bests).toEqual([101, 99, 97])
  })

  it('measures gap against the driver’s own best, and trend against the previous run', () => {
    const combos = groupCombos([
      sess({ fastest_lap_s: 98, created_at: '2026-08-01T00:00:00Z' }),
      sess({ fastest_lap_s: 100, created_at: '2026-08-02T00:00:00Z' }),
    ])
    expect(combos[0].bestEver).toBe(98)
    expect(combos[0].gap).toBe(2) // latest is 2s off the personal best
    expect(combos[0].trend).toBe(2) // and 2s slower than last time out
  })

  it('reports a zero gap when the latest run IS the best', () => {
    const combos = groupCombos([
      sess({ fastest_lap_s: 100, created_at: '2026-08-01T00:00:00Z' }),
      sess({ fastest_lap_s: 98, created_at: '2026-08-02T00:00:00Z' }),
    ])
    expect(combos[0].gap).toBe(0)
    expect(combos[0].trend).toBe(-2)
    expect(fmtGap(combos[0].gap)).toBe('★ best')
  })

  it('leaves trend null with only one session', () => {
    expect(groupCombos([sess()])[0].trend).toBeNull()
  })

  it('returns nothing for an empty history', () => {
    expect(groupCombos([])).toEqual([])
  })
})

describe('facet filters', () => {
  const combos = groupCombos([
    sess({ car: 'Porsche 963', car_class: 'Hypercar' }),
    sess({ car: 'Ferrari 499P', car_class: 'Hypercar' }),
    sess({ car: 'Porsche 911 RSR', car_class: 'GTE', venue: 'Spa' }),
  ])

  it("lists each facet's distinct values alphabetically", () => {
    expect(optionsOf(combos, 'venue')).toEqual(['COTA', 'Spa'])
    expect(optionsOf(combos, 'carClass')).toEqual(['GTE', 'Hypercar'])
  })

  it('drops blanks rather than offering an empty option', () => {
    expect(optionsOf(groupCombos([sess({ car_class: null })]), 'carClass')).toEqual([])
    expect(optionsOf(null, 'venue')).toEqual([])
  })

  it('passes everything through when nothing is filtered', () => {
    expect(applyFilters(combos, { venue: ALL, carClass: ALL, sessionType: ALL })).toHaveLength(3)
    expect(applyFilters(combos, {})).toHaveLength(3)
  })

  it('narrows on one facet, and on several at once', () => {
    expect(applyFilters(combos, { carClass: 'Hypercar' })).toHaveLength(2)
    expect(applyFilters(combos, { venue: 'Spa' })).toHaveLength(1)
    expect(applyFilters(combos, { carClass: 'Hypercar', venue: 'Spa' })).toHaveLength(0)
  })

  it('yields nothing for a value no combo carries', () => {
    // An empty result is the honest answer; passing everything through would
    // show a driver rows their filter excluded.
    expect(applyFilters(combos, { venue: 'Le Mans' })).toEqual([])
  })
})

describe('gap as a percentage', () => {
  it('measures the gap against the lap, so circuits are comparable', () => {
    // Half a second off at Monaco is a different driver from half a second off
    // at Le Mans; one threshold in seconds cannot mean both.
    expect(pctOff(101, 100)).toBe(1)
    expect(pctOff(100, 100)).toBe(0)
    expect(pctOff(202, 200)).toBe(1)
  })

  it('returns null rather than dividing by a missing or zero best', () => {
    expect(pctOff(100, 0)).toBeNull()
    expect(pctOff(null, 100)).toBeNull()
    expect(pctOff(100, null)).toBeNull()
  })

  it('rides on every combo, alongside the seconds figure', () => {
    const combos = groupCombos([
      sess({ fastest_lap_s: 100, created_at: '2026-08-01T00:00:00Z' }),
      sess({ fastest_lap_s: 101, created_at: '2026-08-02T00:00:00Z' }),
    ])
    expect(combos[0].gap).toBe(1)
    expect(combos[0].gapPct).toBe(1)
    expect(combos[0].series).toEqual([0, 1])
  })
})

describe('trendDirection', () => {
  it('reads a closing gap as improving and a widening one as slipping', () => {
    expect(trendDirection([4, 3, 2, 1])).toBe('improving')
    expect(trendDirection([1, 2, 3, 4])).toBe('slipping')
  })

  it('does not call one bad day a regression', () => {
    // The gap has closed across the window even though the last run was worse.
    // Labelling that a regression tells a driver to change what is working.
    expect(trendDirection([5, 4, 1, 1.2])).toBe('improving')
  })

  it('says holding when nothing has moved', () => {
    expect(trendDirection([2, 2, 2])).toBe('holding')
  })

  it('has no direction until there is history to have one', () => {
    expect(trendDirection([1])).toBeNull()
    expect(trendDirection([])).toBeNull()
    expect(trendDirection(null)).toBeNull()
  })
})

describe('tier assignment', () => {
  it('refuses to rank a combo with only one session', () => {
    // The gap is measured against the driver's own best, so a single session
    // has a gap of exactly 0 — every first upload would otherwise be ELITE.
    expect(tierNameFor(0, DEFAULT_TIERS, 1)).toBe('UNRANKED')
    // ...but the same zero gap IS meaningful once there's something to
    // compare against: the driver matched their personal best.
    expect(tierNameFor(0, DEFAULT_TIERS, 2)).toBe('ELITE')
  })

  it('walks the cascade by gap size', () => {
    expect(tierNameFor(0.2, DEFAULT_TIERS)).toBe('ELITE')
    expect(tierNameFor(1.0, DEFAULT_TIERS)).toBe('COMPETITIVE')
    expect(tierNameFor(2.5, DEFAULT_TIERS)).toBe('DEVELOPING')
    expect(tierNameFor(9.0, DEFAULT_TIERS)).toBe('FOUNDATION')
    expect(tierNameFor(null, DEFAULT_TIERS)).toBe('UNRANKED')
    // A combo whose best lap is unusable yields a non-finite percentage; that
    // is unranked, not FOUNDATION, because nothing was measured.
    expect(tierNameFor(NaN, DEFAULT_TIERS)).toBe('UNRANKED')
  })

  it('treats each threshold as inclusive at its boundary', () => {
    expect(tierNameFor(0.5, DEFAULT_TIERS)).toBe('ELITE')
    expect(tierNameFor(1.5, DEFAULT_TIERS)).toBe('COMPETITIVE')
    expect(tierNameFor(3.0, DEFAULT_TIERS)).toBe('DEVELOPING')
  })

  it('honours custom thresholds', () => {
    expect(tierNameFor(1.0, { elite: 2, competitive: 4, developing: 6 })).toBe('ELITE')
  })
})

describe('closeness bar', () => {
  it('fills fully at zero gap and empties at the developing cutoff', () => {
    expect(closenessPct(0, DEFAULT_TIERS)).toBe(100)
    expect(closenessPct(3.0, DEFAULT_TIERS)).toBe(0)
    expect(closenessPct(1.5, DEFAULT_TIERS)).toBe(50)
  })

  it('clamps beyond the cutoff instead of going negative', () => {
    expect(closenessPct(99, DEFAULT_TIERS)).toBe(0)
  })

  it('survives a zero developing cutoff without dividing by zero', () => {
    // The threshold inputs allow 0; this must not produce Infinity/NaN width.
    const pct = closenessPct(1, { elite: 0, competitive: 0, developing: 0 })
    expect(Number.isFinite(pct)).toBe(true)
    expect(pct).toBe(100)
  })
})

describe('formatting', () => {
  it('renders lap times as m:ss.mmm with a padded seconds field', () => {
    expect(fmtLap(95.123)).toBe('1:35.123')
    expect(fmtLap(125.5)).toBe('2:05.500') // the zero-pad case
    expect(fmtLap(59.999)).toBe('0:59.999')
  })

  it('renders missing or non-finite lap times as a dash', () => {
    expect(fmtLap(null)).toBe('—')
    expect(fmtLap(NaN)).toBe('—')
    expect(fmtLap(Infinity)).toBe('—')
  })

  it('renders gaps with a sign, and marks the best', () => {
    expect(fmtGap(1.234)).toBe('+1.234s')
    expect(fmtGap(0)).toBe('★ best')
    expect(fmtGap(null)).toBe('—')
  })
})

describe('minMax', () => {
  it('finds both extremes in one pass', () => {
    expect(minMax([3, 1, 4, 1, 5])).toEqual({ lo: 1, hi: 5 })
  })

  it('handles a large array that would overflow the spread form', () => {
    // Math.min(...arr) throws RangeError around ~124k args in V8; a driver's
    // history is unbounded, so the fold has to hold.
    const big = Array.from({ length: 200_000 }, (_, i) => i)
    expect(() => minMax(big)).not.toThrow()
    expect(minMax(big)).toEqual({ lo: 0, hi: 199_999 })
  })
})
