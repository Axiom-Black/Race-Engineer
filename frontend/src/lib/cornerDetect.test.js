import { describe, it, expect } from 'vitest'
import {
  DETECT_DEFAULTS, smooth, lateralCapability, detectCornersFromG,
} from './cornerDetect.js'

const RATE = 25

/** `seconds` of lateral G at `g`, as samples. */
const hold = (seconds, g) => new Array(Math.round(seconds * RATE)).fill(g)
const lap = (...parts) => parts.flat()

describe('smooth', () => {
  it('averages over the box', () => {
    expect(smooth([1, 1, 5, 1, 1], 1)[2]).toBeCloseTo(7 / 3, 6)
  })
  it('clips at the ends rather than wrapping', () => {
    // Wrapping would carry the lap's last corner into its first metres.
    expect(smooth([9, 1, 1, 1, 1], 1)[4]).toBeCloseTo(1, 6)
  })
  it('is a no-op at radius 0, and survives an empty series', () => {
    expect(smooth([1, 2, 3], 0)).toEqual([1, 2, 3])
    expect(smooth([], 3)).toEqual([])
  })
})

describe('lateralCapability', () => {
  it('is a high percentile, not the maximum', () => {
    // One kerb strike must not raise the bar for the whole session.
    const series = [...new Array(99).fill(1.5), 6]
    expect(lateralCapability(series)).toBeCloseTo(1.5, 6)
  })

  it('is sign-blind — a left corner loads the car as much as a right', () => {
    expect(lateralCapability(new Array(100).fill(-1.7))).toBeCloseTo(1.7, 6)
  })

  it('is 0 for a series with nothing in it', () => {
    expect(lateralCapability([])).toBe(0)
    expect(lateralCapability(null)).toBe(0)
    expect(lateralCapability([null, undefined, 'x'])).toBe(0)
  })
})

describe('detectCornersFromG', () => {
  it('finds one corner in one sustained load', () => {
    const g = lap(hold(3, 0), hold(2, 1.5), hold(3, 0))
    const found = detectCornersFromG(g, RATE, { capability: 1.5 })
    expect(found).toHaveLength(1)
    expect(found[0].direction).toBe('right')
    expect(found[0].peakG).toBeCloseTo(1.5, 1)
  })

  it('SPLITS AN ESS AT THE SIGN CHANGE — the thing geometry could not do', () => {
    // Left immediately into right, with no release between: two corners. At 13 m
    // GPS spacing this smeared into a single arc, which is most of why the
    // trace-based detector could never reach a real corner count.
    const g = lap(hold(2, 0), hold(1.5, 1.6), hold(1.5, -1.6), hold(2, 0))
    const found = detectCornersFromG(g, RATE, { capability: 1.6 })
    expect(found).toHaveLength(2)
    expect(found.map((c) => c.direction)).toEqual(['right', 'left'])
  })

  it('splits a sustained corner where the driver released and reloaded', () => {
    // Two apexes at 1.6 G with a release to 0.6 G — 62% of the flanking peaks,
    // past the 35% relative bar. That is a second turn however it is numbered.
    const g = lap(hold(2, 0), hold(1.5, 1.6), hold(1.2, 0.6), hold(1.5, 1.6), hold(2, 0))
    expect(detectCornersFromG(g, RATE, { capability: 1.6 })).toHaveLength(2)
  })

  it('does NOT split a long constant sweeper', () => {
    // The whole risk of the splitting rule: Spa's Blanchimont is one corner for
    // eight seconds, and cutting it in half would invent a turn.
    const g = lap(hold(2, 0), hold(8, 1.4), hold(2, 0))
    expect(detectCornersFromG(g, RATE, { capability: 1.5 })).toHaveLength(1)
  })

  it('does not split on a shallow wobble mid-corner', () => {
    // A dip to 1.3 of 1.6 is a 19% release — a correction, not a second apex.
    const g = lap(hold(2, 0), hold(1.5, 1.6), hold(1.2, 1.3), hold(1.5, 1.6), hold(2, 0))
    expect(detectCornersFromG(g, RATE, { capability: 1.6 })).toHaveLength(1)
  })

  it('rejects a corner-exit tail that never loads the car', () => {
    // The defect this caught on the real export: a 0.5 G unwind after a 1.6 G
    // corner was being counted as its own turn on most laps.
    const g = lap(hold(2, 0), hold(2, 1.6), hold(0.5, 0), hold(2, 0.45), hold(2, 0))
    const found = detectCornersFromG(g, RATE, { capability: 1.6 })
    expect(found).toHaveLength(1)
    expect(found[0].peakG).toBeGreaterThan(1)
  })

  it('applies that rejection to split fragments too', () => {
    // A fragment that never loaded the car is not a corner regardless of what
    // it was cut from. Skipping this re-check left one phantom per lap.
    const g = lap(hold(2, 0), hold(1.5, 1.6), hold(1.2, 0.3), hold(1.5, 0.5), hold(2, 0))
    const found = detectCornersFromG(g, RATE, { capability: 1.6 })
    expect(found).toHaveLength(1)
  })

  it('ignores a bump too brief to be a corner', () => {
    const g = lap(hold(2, 0), hold(0.2, 1.8), hold(2, 0))
    expect(detectCornersFromG(g, RATE, { capability: 1.8 })).toHaveLength(0)
  })

  it('joins a momentary dropout inside one corner', () => {
    // Two 0.6 s loads either side of a 0.2 s gap: merged, and the halves are
    // too short for the split rule to cut them apart again. This is what
    // `mergeS` buys — bridging a sensor gap or a flick of opposite lock inside
    // a single turn.
    const g = lap(hold(2, 0), hold(0.6, 1.5), hold(0.2, 0.1), hold(0.6, 1.5), hold(2, 0))
    expect(detectCornersFromG(g, RATE, { capability: 1.5 })).toHaveLength(1)
  })

  it('but SPLITTING OVERRIDES MERGING when both halves are real corners', () => {
    // The same 0.2 s release between two full-second loads is two corners: the
    // driver unloaded the car completely and loaded it again. Merge bridges
    // gaps; it does not get to fuse two turns, and the ordering of the two
    // rules is what decides that.
    const g = lap(hold(2, 0), hold(1, 1.5), hold(0.2, 0.1), hold(1, 1.5), hold(2, 0))
    expect(detectCornersFromG(g, RATE, { capability: 1.5 })).toHaveLength(2)
  })

  it('SCALES: the same lap at half the grip gives the same corners', () => {
    // The property that makes one parameter set serve an LMP3 at Monaco and a
    // Hypercar at Le Mans. Every threshold is a fraction of capability, so
    // halving the car's grip must not change the answer.
    const shape = lap(hold(2, 0), hold(1.5, 1.6), hold(1.2, 0.6), hold(1.5, 1.6), hold(2, 0))
    const half = shape.map((v) => v / 2)
    expect(detectCornersFromG(half, RATE, { capability: 0.8 }).length)
      .toBe(detectCornersFromG(shape, RATE, { capability: 1.6 }).length)
  })

  it('reports the direction as a word, not as a raw sign', () => {
    // The sign convention of G Force Lat is an LMU fact; "left" is a driver's.
    const g = lap(hold(2, 0), hold(2, -1.6), hold(2, 0))
    expect(detectCornersFromG(g, RATE, { capability: 1.6 })[0].direction).toBe('left')
  })

  it('puts apexIdx inside the corner it belongs to', () => {
    const g = lap(hold(2, 0), hold(2, 1.6), hold(2, 0))
    const [c] = detectCornersFromG(g, RATE, { capability: 1.6 })
    expect(c.apexIdx).toBeGreaterThanOrEqual(c.startIdx)
    expect(c.apexIdx).toBeLessThanOrEqual(c.endIdx)
  })

  it('falls back to the lap\'s own capability when none is given', () => {
    const g = lap(hold(2, 0), hold(2, 1.6), hold(2, 0))
    expect(detectCornersFromG(g, RATE)).toHaveLength(1)
  })

  it('finds nothing in a lap with no lateral load, instead of dividing by zero', () => {
    // A pit lane, or an export whose G channel is empty. Scaling thresholds by
    // a zero capability would make every sample a corner.
    expect(detectCornersFromG(new Array(500).fill(0), RATE)).toEqual([])
  })

  it('refuses nonsense input rather than throwing', () => {
    expect(detectCornersFromG(null, RATE)).toEqual([])
    expect(detectCornersFromG([1, 2], RATE)).toEqual([])
    expect(detectCornersFromG(new Array(500).fill(1), 0)).toEqual([])
    expect(detectCornersFromG(new Array(500).fill(1), null)).toEqual([])
  })
})

describe('the defaults', () => {
  it('are the swept values, and every threshold is dimensionless', () => {
    expect(DETECT_DEFAULTS).toMatchObject({
      capPercentile: 0.97, onFrac: 0.15, peakFrac: 0.55, relProm: 0.35,
    })
    // The load-bearing property: no threshold is an absolute G number. "0.25 G"
    // is a firm corner in an LMP3 and a rounding error in a Hypercar, and a
    // detector built on one would not travel to a car we have never seen.
    for (const key of ['onFrac', 'peakFrac', 'relProm', 'capPercentile']) {
      expect(DETECT_DEFAULTS[key]).toBeGreaterThan(0)
      expect(DETECT_DEFAULTS[key]).toBeLessThanOrEqual(1)
    }
  })

  it('expresses every duration in seconds, not samples', () => {
    // Sample counts would mean different things at 25 Hz and 50 Hz, and LMU is
    // not the only exporter this will ever meet.
    expect(DETECT_DEFAULTS.smoothS).toBeGreaterThan(0)
    expect(DETECT_DEFAULTS.mergeS).toBeGreaterThan(0)
    expect(DETECT_DEFAULTS.minDurS).toBeGreaterThan(0)
    expect(DETECT_DEFAULTS.splitGapS).toBeGreaterThan(0)
  })

  it('gives the same answer at 50 Hz as at 25 Hz', () => {
    // The direct consequence of the rule above: doubling the sample rate of the
    // same physical lap must not change what is found.
    const at25 = lap(hold(2, 0), hold(1.5, 1.6), hold(1.2, 0.6), hold(1.5, 1.6), hold(2, 0))
    const at50 = at25.flatMap((v) => [v, v])
    expect(detectCornersFromG(at50, 50, { capability: 1.6 }).length)
      .toBe(detectCornersFromG(at25, 25, { capability: 1.6 }).length)
  })
})
