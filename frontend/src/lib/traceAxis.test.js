import { describe, it, expect } from 'vitest'
import { distanceAxis, xAt, indexAtFraction } from './traceAxis.js'

const pts = (ds) => ds.map((d) => ({ d }))

describe('distanceAxis', () => {
  it('uses d, so a corner-dense trace plots against distance', () => {
    expect(distanceAxis(pts([0, 0.1, 0.15, 0.2, 1]))).toEqual([0, 0.1, 0.15, 0.2, 1])
  })

  it('renormalises so a lap ending at 0.998 still fills the plot', () => {
    const axis = distanceAxis(pts([0, 0.5, 0.998]))
    expect(axis[0]).toBe(0)
    expect(axis[2]).toBe(1)
    expect(axis[1]).toBeCloseTo(0.501, 3)
  })

  it('falls back to even spacing when d is missing', () => {
    // Sessions ingested before the field existed must still plot.
    expect(distanceAxis([{}, {}, {}])).toEqual([0, 0.5, 1])
  })

  it('falls back when d goes backwards, rather than folding the plot', () => {
    expect(distanceAxis(pts([0, 0.6, 0.3, 1]))).toEqual([0, 1 / 3, 2 / 3, 1])
  })

  it('falls back on a flat axis instead of dividing by a zero range', () => {
    expect(distanceAxis(pts([0.4, 0.4, 0.4]))).toEqual([0, 0.5, 1])
  })

  it('handles the empty and single-point cases', () => {
    expect(distanceAxis([])).toEqual([])
    expect(distanceAxis(null)).toEqual([])
    expect(distanceAxis(pts([0.7]))).toEqual([0])
  })
})

describe('xAt', () => {
  it('scales the axis onto the plot width', () => {
    expect(xAt([0, 0.25, 1], 1, 1000)).toBe(250)
  })
  it('clamps an out-of-range index instead of returning NaN', () => {
    expect(xAt([0, 0.5, 1], 99, 1000)).toBe(1000)
    expect(xAt([0, 0.5, 1], -3, 1000)).toBe(0)
  })
})

describe('indexAtFraction', () => {
  const axis = [0, 0.1, 0.2, 0.9, 1]

  it('lands on the sample under the cursor, not the one behind it', () => {
    // 0.88 is much nearer index 3 (0.9) than index 2 (0.2). Rounding down —
    // which is what a naive search returns — would scrub 700 m up the road.
    expect(indexAtFraction(axis, 0.88)).toBe(3)
  })

  it('picks the nearer of the two bracketing points', () => {
    expect(indexAtFraction(axis, 0.12)).toBe(1)
    expect(indexAtFraction(axis, 0.18)).toBe(2)
  })

  it('clamps at both ends', () => {
    expect(indexAtFraction(axis, -1)).toBe(0)
    expect(indexAtFraction(axis, 5)).toBe(4)
  })

  it('is the inverse of the axis at every sample', () => {
    axis.forEach((d, i) => expect(indexAtFraction(axis, d)).toBe(i))
  })

  it('survives an empty axis or a nonsense fraction', () => {
    expect(indexAtFraction([], 0.5)).toBe(0)
    expect(indexAtFraction(axis, null)).toBe(0)
    expect(indexAtFraction(axis, NaN)).toBe(0)
  })
})
