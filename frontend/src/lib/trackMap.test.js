import { describe, it, expect } from 'vitest'
import { gpsPoints, project, nearestPointIndex, speedFraction, speedExtent } from './trackMap.js'

const GEOM = { width: 1000, height: 600, pad: 40 }
// A small square circuit, plus a point with no GPS in the middle of it.
const PTS = [
  { x: 0, y: 0, s: 100 },
  { x: 1, y: 0, s: 250 },
  { x: null, y: null, s: 200 }, // GPS dropout
  { x: 1, y: 1, s: 150 },
  { x: 0, y: 1, s: 90 },
]

describe('gpsPoints', () => {
  it('keeps only points that carry a position', () => {
    expect(gpsPoints(PTS)).toHaveLength(4)
  })
  it('tolerates an absent trace', () => {
    expect(gpsPoints(null)).toEqual([])
    expect(gpsPoints([null, undefined])).toEqual([])
  })
})

describe('project', () => {
  it('maps 0…1 into the padded box', () => {
    expect(project({ x: 0, y: 0 }, GEOM)).toEqual({ x: 40, y: 560 })
    expect(project({ x: 1, y: 1 }, GEOM)).toEqual({ x: 960, y: 40 })
  })

  it('INVERTS y — SVG grows down, latitude grows north', () => {
    // Without this every circuit renders mirrored, which looks plausible to
    // anyone who has not driven it and is wrong.
    const low = project({ x: 0.5, y: 0 }, GEOM)
    const high = project({ x: 0.5, y: 1 }, GEOM)
    expect(high.y).toBeLessThan(low.y)
  })
})

describe('nearestPointIndex', () => {
  it('finds the closest point to a position', () => {
    // Top-left of the box is x:0, y:1 -> index 4.
    expect(nearestPointIndex(PTS, 40, 40, GEOM)).toBe(4)
    // Bottom-left is x:0, y:0 -> index 0.
    expect(nearestPointIndex(PTS, 40, 560, GEOM)).toBe(0)
  })

  it('returns an index into the ORIGINAL array, not the GPS subset', () => {
    // The caller scrubs the full trace. An index into a filtered list would
    // silently point at the wrong sample on any lap with a dropout.
    const i = nearestPointIndex(PTS, 960, 40, GEOM) // x:1, y:1 -> index 3
    expect(i).toBe(3)
    expect(PTS[i].s).toBe(150)
  })

  it('skips points with no position rather than treating them as origin', () => {
    const i = nearestPointIndex(PTS, 500, 300, GEOM)
    expect(PTS[i].x).not.toBeNull()
  })

  it('returns null for an empty trace or a nonsense position', () => {
    expect(nearestPointIndex([], 10, 10, GEOM)).toBeNull()
    expect(nearestPointIndex(PTS, null, 10, GEOM)).toBeNull()
    expect(nearestPointIndex(null, 10, 10, GEOM)).toBeNull()
  })
})

describe('speedFraction', () => {
  it('scales to the lap, so every circuit uses the full palette', () => {
    expect(speedFraction(90, 90, 250)).toBe(0)
    expect(speedFraction(250, 90, 250)).toBe(1)
    expect(speedFraction(170, 90, 250)).toBe(0.5)
  })

  it('clamps rather than running off the palette', () => {
    expect(speedFraction(300, 90, 250)).toBe(1)
    expect(speedFraction(10, 90, 250)).toBe(0)
  })

  it('returns null on a flat range instead of dividing by zero', () => {
    // A stationary or single-sample lap has no gradient to show.
    expect(speedFraction(100, 100, 100)).toBeNull()
    expect(speedFraction(null, 90, 250)).toBeNull()
  })
})

describe('speedExtent', () => {
  it('ignores points with no reading', () => {
    expect(speedExtent(PTS)).toEqual({ min: 90, max: 250 })
  })
  it('returns null when nothing has a speed', () => {
    expect(speedExtent([{ x: 0, y: 0 }])).toBeNull()
    expect(speedExtent([])).toBeNull()
  })
})
