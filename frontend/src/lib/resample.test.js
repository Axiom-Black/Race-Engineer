import { describe, it, expect } from 'vitest'
import {
  RESAMPLE_DEFAULTS,
  smoothWeights,
  importanceWeights,
  allocateByWeight,
  spacingStats,
} from './resample.js'

describe('smoothWeights', () => {
  it('averages over the box, so a spike becomes a shoulder', () => {
    const w = smoothWeights([1, 1, 5, 1, 1], 1)
    expect(w[2]).toBeCloseTo(7 / 3, 6)
    expect(w[1]).toBeCloseTo(7 / 3, 6)
    expect(w[0]).toBeCloseTo(1, 6) // clipped box, indices 0-1: (1 + 1) / 2
  })

  it('conserves nothing at the ends by clipping, not by wrapping', () => {
    // Wrapping would carry the lap's last braking zone into its first metres.
    const w = smoothWeights([9, 1, 1, 1, 1], 1)
    expect(w[4]).toBeCloseTo(1, 6)
  })

  it('is a no-op at radius 0 and returns a plain array', () => {
    const w = smoothWeights(new Float64Array([1, 2, 3]), 0)
    expect(Array.isArray(w)).toBe(true)
    expect(w).toEqual([1, 2, 3])
  })

  it('tolerates an empty field', () => {
    expect(smoothWeights([], 3)).toEqual([])
  })
})

describe('importanceWeights', () => {
  const flat = { speeds: new Array(60).fill(200), rateHz: 20 }

  it('weights a steady straight at 1 — nothing to spend points on', () => {
    for (const w of importanceWeights(flat)) expect(w).toBeCloseTo(1, 6)
  })

  it('raises the weight where lateral G says the car is cornering', () => {
    const gLat = new Array(60).fill(0)
    for (let i = 25; i < 35; i++) gLat[i] = 1.5
    const w = importanceWeights({ ...flat, gLat }, { smoothRadius: 0 })
    expect(w[30]).toBeCloseTo(1 + RESAMPLE_DEFAULTS.cornerWeight, 6)
    expect(w[5]).toBeCloseTo(1, 6)
  })

  it('saturates rather than letting one huge reading eat the lap', () => {
    const mild = importanceWeights({ ...flat, gLat: new Array(60).fill(1.5) }, { smoothRadius: 0 })
    const wild = importanceWeights({ ...flat, gLat: new Array(60).fill(6) }, { smoothRadius: 0 })
    expect(wild[30]).toBeCloseTo(mild[30], 6)
  })

  it('is sign-blind: a left-hander is worth what a right-hander is', () => {
    const l = importanceWeights({ ...flat, gLat: new Array(60).fill(-1.2) }, { smoothRadius: 0 })
    const r = importanceWeights({ ...flat, gLat: new Array(60).fill(1.2) }, { smoothRadius: 0 })
    expect(l[30]).toBeCloseTo(r[30], 6)
  })

  it('raises the weight under braking even with no G channel at all', () => {
    // GTE exports have empty channels; the weighting must still work off speed
    // alone rather than falling back to uniform.
    const speeds = new Array(60).fill(200)
    for (let i = 30; i < 40; i++) speeds[i] = 200 - (i - 29) * 12
    const w = importanceWeights({ speeds, rateHz: 20 }, { smoothRadius: 0 })
    expect(w[35]).toBeGreaterThan(1.5)
    expect(w[5]).toBeCloseTo(1, 6)
  })

  it('never reaches outside the lap for its speed difference', () => {
    // A one-sided difference at the ends; reaching past index 0 would pull in
    // the previous lap's braking zone.
    const w = importanceWeights({ speeds: [10, 10, 10], rateHz: 20 }, { smoothRadius: 0 })
    expect(w.every((v) => Math.abs(v - 1) < 1e-9)).toBe(true)
  })

  it('ignores a non-numeric G reading rather than scoring it as zero G', () => {
    const gLat = new Array(60).fill(null)
    const w = importanceWeights({ ...flat, gLat }, { smoothRadius: 0 })
    expect(w[30]).toBeCloseTo(1, 6)
  })

  it('returns nothing for an empty lap', () => {
    expect(importanceWeights({ speeds: [], rateHz: 20 })).toEqual([])
    expect(importanceWeights({ rateHz: 20 })).toEqual([])
  })
})

describe('allocateByWeight', () => {
  // 100 samples, 1 m apart. Samples 40-59 are worth 5x.
  const cum = Array.from({ length: 100 }, (_, i) => i)
  const weights = cum.map((_, i) => (i >= 40 && i < 60 ? 5 : 1))

  it('spends more points where the weight is higher', () => {
    const idx = allocateByWeight(cum, weights, 40)
    const inHot = idx.filter((i) => i >= 40 && i < 60).length
    const inCold = idx.length - inHot
    // The hot 20 m carries 5x the weight of the cold 80 m: 100 vs 80 weighted
    // metres, so it should take roughly half the points despite being a fifth
    // of the distance.
    expect(inHot).toBeGreaterThan(inCold * 0.7)
    expect(inHot / 20).toBeGreaterThan((inCold / 80) * 3)
  })

  it('reduces to even spacing when nothing is more important than anything', () => {
    const idx = allocateByWeight(cum, cum.map(() => 1), 11)
    const gaps = idx.slice(1).map((v, i) => v - idx[i])
    for (const g of gaps) expect(Math.abs(g - 10)).toBeLessThanOrEqual(1)
  })

  it('always opens at the first sample and closes on the last', () => {
    const idx = allocateByWeight(cum, weights, 17)
    expect(idx[0]).toBe(0)
    expect(idx[idx.length - 1]).toBe(99)
  })

  it('returns strictly increasing indices — no duplicate samples stored', () => {
    // Asking for more points than there are samples must not store the same
    // reading twice; raw resolution is a real ceiling.
    const idx = allocateByWeight(cum, weights, 400)
    expect(idx.length).toBeLessThanOrEqual(100)
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1])
  })

  it('falls back to even index spacing on a stationary lap', () => {
    // A car sitting in the pits has no arc length to distribute; returning a
    // single point would erase the lap instead of showing it flat.
    const still = new Array(50).fill(0)
    const idx = allocateByWeight(still, still.map(() => 1), 10)
    expect(idx.length).toBeGreaterThan(5)
    expect(idx[idx.length - 1]).toBe(49)
  })

  it('handles degenerate inputs without throwing', () => {
    expect(allocateByWeight([], [], 10)).toEqual([])
    expect(allocateByWeight([0], [1], 10)).toEqual([0])
    expect(allocateByWeight(cum, weights, 1)).toEqual([0])
    expect(allocateByWeight(null, null, 10)).toEqual([])
  })
})

describe('spacingStats', () => {
  it('reports the spread the redistribution actually produced', () => {
    const cum = [0, 1, 2, 10, 30]
    expect(spacingStats(cum, [0, 1, 2, 3, 4])).toEqual({ minM: 1, maxM: 20, medianM: 8 })
  })
  it('returns null when there is no gap to measure', () => {
    expect(spacingStats([0], [0])).toBeNull()
    expect(spacingStats([0, 1], null)).toBeNull()
  })
})
