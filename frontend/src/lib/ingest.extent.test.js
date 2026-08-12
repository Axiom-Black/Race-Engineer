// Regression: min/max over channel samples must survive real-file sizes.
// A real multi-lap/endurance export has channels with hundreds of thousands
// of samples; `Math.min(...arr)` / `Math.max(...arr)` throw RangeError on
// those. `extent()` is the single-pass replacement — this pins that it both
// gives the right answer and doesn't overflow where the spread would.
import { describe, it, expect } from 'vitest'
import { extent } from './ingest.js'

describe('extent()', () => {
  it('computes min/max in one pass', () => {
    expect(extent([3, -1, 4, 1, -5, 9, 2, 6])).toEqual({ min: -5, max: 9 })
  })

  it('returns nulls for an empty array', () => {
    expect(extent([])).toEqual({ min: null, max: null })
  })

  it('handles arrays large enough to break the spread operator', () => {
    const n = 500_000 // well past V8's argument-count limit for Math.min(...arr)
    const big = new Array(n)
    for (let i = 0; i < n; i++) big[i] = i
    big[123456] = -7 // a known min somewhere in the middle
    // Guard the premise: the old approach really does blow up at this size.
    expect(() => Math.min(...big)).toThrow(RangeError)
    // The fix does not.
    expect(extent(big)).toEqual({ min: -7, max: n - 1 })
  })
})
