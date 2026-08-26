import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLd, decodeAll, lapBoundaries } from './motec/ld.js'
import {
  DETECT_DEFAULTS, smooth, lateralCapability, median, detectCornersFromG,
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

describe('median', () => {
  it('takes the middle of an odd and an even list', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })
  it('is 0 when there is nothing to take one of', () => {
    expect(median([])).toBe(0)
    expect(median(null)).toBe(0)
    expect(median([null, 'x', undefined])).toBe(0)
  })
})

describe('robustness of the scale', () => {
  // THE POINT OF THE TWO-PASS DESIGN, and the reason it exists.
  //
  // The first version took its yardstick from a session-wide percentile of
  // |G_lat|, which put the whole answer on one scalar with a ±12% tolerance
  // against the real export. A car with unfamiliar grip, a wet session, or a
  // circuit with a different straight-to-corner ratio walks out of that band —
  // and the failure is silent, with corners quietly missing.
  //
  // The yardstick is now the lap's own typical corner. These tests pin that the
  // hint barely matters, because that is what will decide whether this survives
  // a car nobody here has driven.

  // Six corners of clearly different loads, plus an exit tail after each.
  const circuit = lap(
    hold(2, 0),
    hold(2, 1.6), hold(1, 0.35), hold(1.5, 0),
    hold(2, -1.5), hold(1, -0.3), hold(1.5, 0),
    hold(2, 1.2), hold(1, 0.3), hold(1.5, 0),
    hold(2, -1.7), hold(1, -0.35), hold(1.5, 0),
    hold(2, 1.4), hold(1, 0.3), hold(1.5, 0),
    hold(2, -1.3), hold(1, -0.3), hold(2, 0),
  )
  const truth = 6

  it('finds the corners and rejects every exit tail', () => {
    expect(detectCornersFromG(circuit, RATE, { capability: 1.6 })).toHaveLength(truth)
  })

  it('SURVIVES A WILDLY WRONG CAPABILITY HINT', () => {
    // A 27x range on the real export; a 20x range here. Under the old
    // single-pass form the answer moved well inside this.
    for (const hint of [0.3, 0.5, 1.0, 1.6, 2.5, 4.0, 6.0]) {
      expect(detectCornersFromG(circuit, RATE, { capability: hint })).toHaveLength(truth)
    }
  })

  it('is unmoved by one kerb strike', () => {
    // A 3 G moment is not a corner and must not redefine what one is. The old
    // form scaled its accept bar off a high percentile, so a big enough
    // outlier pulled the bar up and started rejecting real corners.
    const withStrike = lap(circuit, hold(0.3, 3.0), hold(2, 0))
    expect(detectCornersFromG(withStrike, RATE, { capability: 1.6 }).length)
      .toBeGreaterThanOrEqual(truth)
  })

  it('is unmoved by how much of the lap is straight', () => {
    // Le Mans is mostly straight and Monaco mostly corners. A yardstick taken
    // over the time distribution reads those as different cars; a median over
    // the corners themselves does not.
    const monaco = detectCornersFromG(circuit, RATE, { capability: 1.6 }).length
    const leMans = detectCornersFromG(lap(circuit, hold(90, 0)), RATE, { capability: 1.6 }).length
    expect(leMans).toBe(monaco)
  })

  it('still scales with the car — half the grip, same corners', () => {
    const half = circuit.map((v) => v / 2)
    expect(detectCornersFromG(half, RATE, { capability: 0.8 }).length).toBe(truth)
    // ...and with no hint at all, since the hint is only a bootstrap now.
    expect(detectCornersFromG(half, RATE).length).toBe(truth)
  })

  it('does not invent corners on a lap that has none', () => {
    // The failure mode of a self-normalising scale: with no real corners, the
    // median is taken over noise and everything clears a bar scaled to noise.
    const noise = Array.from({ length: 3000 }, (_, i) => Math.sin(i / 7) * 0.02)
    expect(detectCornersFromG(noise, RATE, { capability: 1.6 })).toEqual([])
  })
})

describe('the defaults', () => {
  it('are the swept values, and every threshold is dimensionless', () => {
    expect(DETECT_DEFAULTS).toMatchObject({
      capPercentile: 0.97, bootFrac: 0.15, edgeFrac: 0.30, cornerFrac: 0.50, relProm: 0.35,
    })
    // The load-bearing property: no threshold is an absolute G number. "0.25 G"
    // is a firm corner in an LMP3 and a rounding error in a Hypercar, and a
    // detector built on one would not travel to a car we have never seen.
    for (const key of ['bootFrac', 'edgeFrac', 'cornerFrac', 'relProm', 'capPercentile']) {
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

// ── the real export ───────────────────────────────────────────────
// Synthetic shapes prove the rules; this proves they survive a real car on a
// real circuit, which is the only evidence that counts for generalisation.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures')

function cotaLaps() {
  const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'cota_gte_sanitized.ld')))
  const ld = parseLd(bytes)
  decodeAll(bytes, ld)
  const ch = ld.channels['G Force Lat']
  const rate = ch.sampleRateHz
  const bounds = lapBoundaries(ld)
  // Four full laps: the out-lap and the three timed ones. The trailing partial
  // is a fragment, not a lap, and is excluded.
  return {
    rate,
    laps: [0, 1, 2, 3].map((i) =>
      ch.samples.slice(Math.floor(bounds[i].startS * rate), Math.floor(bounds[i + 1].startS * rate)),
    ),
  }
}

describe('against the real COTA export', () => {
  const { rate, laps } = cotaLaps()

  it('finds all 20 of the circuit\'s corners, on every lap', () => {
    for (const g of laps) {
      expect(detectCornersFromG(g, rate, { capability: 1.607 })).toHaveLength(20)
    }
  })

  it('KEEPS FINDING 20 ACROSS A 27x ERROR IN THE CAPABILITY HINT', () => {
    // The measured session capability is 1.607. The single-pass form held 20
    // only between 1.40 and 1.80 — a ±12% tolerance on one scalar, with silent
    // corner loss outside it. This is the test that made the rework worth
    // doing, and the number it defends is the tolerance, not the 20.
    for (const hint of [0.3, 0.5, 0.8, 1.0, 1.4, 1.607, 2.0, 2.4, 3.0, 4.0, 5.0, 8.0]) {
      for (const g of laps) {
        expect(detectCornersFromG(g, rate, { capability: hint })).toHaveLength(20)
      }
    }
  })

  it('needs no hint at all — the lap supplies its own scale', () => {
    for (const g of laps) expect(detectCornersFromG(g, rate)).toHaveLength(20)
  })
})
