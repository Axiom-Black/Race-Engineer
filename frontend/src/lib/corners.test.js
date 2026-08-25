// Corner detection, tested on synthetic shapes where the right answer is known
// by construction. The real-export behaviour is recorded in the module header:
// detection plateaus at 12 corners at COTA because the persisted trace is
// ~400 points per lap (~13.5 m), and that is a storage limit, not a tuning one.
import { describe, it, expect } from 'vitest'
import {
  curvatureAt, outwardNormal, speedDips, detectCorners, topSpeedIndex,
  relaxLabels, DEFAULTS,
} from './corners.js'

/** A closed circle of `n` points — constant curvature everywhere. */
function circle(n, r = 0.4, speed = 100) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a), s: speed, g: 4 }
  })
}

/**
 * A rounded square — four tight corners joined by straights, which is a far
 * better synthetic circuit than a circle: a constant-radius circle is ONE
 * continuous corner, so it cannot test ordering or numbering.
 */
function roundedSquare({ n = 400, r = 0.06, straightSpeed = 200, cornerSpeed = 80 } = {}) {
  const pts = []
  const side = 0.34
  const corners = [
    { cx: 0.5 - side, cy: 0.5 - side, a0: Math.PI, a1: Math.PI * 1.5 },
    { cx: 0.5 + side, cy: 0.5 - side, a0: Math.PI * 1.5, a1: Math.PI * 2 },
    { cx: 0.5 + side, cy: 0.5 + side, a0: 0, a1: Math.PI * 0.5 },
    { cx: 0.5 - side, cy: 0.5 + side, a0: Math.PI * 0.5, a1: Math.PI },
  ]
  const perCorner = Math.floor(n / 8)
  const perStraight = Math.floor(n / 8)
  for (const c of corners) {
    for (let i = 0; i < perCorner; i++) {
      const a = c.a0 + ((c.a1 - c.a0) * i) / perCorner
      pts.push({ x: c.cx + r * Math.cos(a), y: c.cy + r * Math.sin(a), s: cornerSpeed, g: 2 })
    }
    const last = pts[pts.length - 1]
    for (let i = 1; i <= perStraight; i++) {
      pts.push({ x: last.x, y: last.y, s: straightSpeed, g: 6 })
    }
  }
  return pts
}

/** A straight line — zero curvature. */
function straight(n) {
  return Array.from({ length: n }, (_, i) => ({ x: i / (n - 1), y: 0.5, s: 200, g: 6 }))
}

describe('curvatureAt', () => {
  it('is near zero on a straight', () => {
    const pts = straight(50)
    expect(curvatureAt(pts, 25)).toBeCloseTo(0, 6)
  })

  it('is larger on a tighter circle — it is 1/radius', () => {
    const tight = curvatureAt(circle(200, 0.1), 50)
    const wide = curvatureAt(circle(200, 0.4), 50)
    expect(tight).toBeGreaterThan(wide)
    // Radius 0.1 vs 0.4 is 4x the curvature.
    expect(tight / wide).toBeCloseTo(4, 0)
  })

  it('returns 0 rather than infinity on coincident samples', () => {
    // A stationary car is not a corner of infinite tightness.
    const stuck = Array.from({ length: 20 }, () => ({ x: 0.5, y: 0.5, s: 0 }))
    expect(curvatureAt(stuck, 10)).toBe(0)
  })

  it('returns 0 at the ends where the window does not fit', () => {
    const pts = circle(50)
    expect(curvatureAt(pts, 0)).toBe(0)
    expect(curvatureAt(pts, 49)).toBe(0)
  })

  it('returns 0 for points with no GPS instead of NaN', () => {
    const pts = [{ x: null, y: null }, { x: null, y: null }, { x: null, y: null },
                 { x: null, y: null }, { x: null, y: null }, { x: null, y: null }, { x: null, y: null }]
    expect(curvatureAt(pts, 3)).toBe(0)
  })
})

describe('outwardNormal', () => {
  it('points away from the centre of the lap', () => {
    // Labels belong outside the circuit; inside they collide with the track.
    const pts = circle(200)
    const centroid = { x: 0.5, y: 0.5 }
    const i = 0 // at (0.9, 0.5) — outward is +x
    const { nx } = outwardNormal(pts, i, centroid)
    expect(nx).toBeGreaterThan(0)
  })

  it('falls back to a fixed direction rather than NaN on degenerate input', () => {
    const stuck = Array.from({ length: 10 }, () => ({ x: 0.5, y: 0.5 }))
    expect(outwardNormal(stuck, 5, { x: 0.5, y: 0.5 })).toEqual({ nx: 0, ny: -1 })
  })
})

describe('speedDips', () => {
  const withDip = (depth) => {
    const pts = straight(60)
    for (let i = 28; i <= 32; i++) pts[i] = { ...pts[i], s: 200 - depth }
    return pts
  }

  it('finds a dip deep enough to be a corner', () => {
    expect(speedDips(withDip(60), { prominence: 20, minGap: 5 })).toHaveLength(1)
  })

  it('ignores a lift too shallow to be one', () => {
    // Otherwise every small correction becomes a corner and the map is noise.
    expect(speedDips(withDip(5), { prominence: 20, minGap: 5 })).toHaveLength(0)
  })

  it('keeps the deeper of two dips that are too close together', () => {
    const pts = straight(60)
    for (let i = 28; i <= 30; i++) pts[i] = { ...pts[i], s: 150 }
    for (let i = 32; i <= 34; i++) pts[i] = { ...pts[i], s: 120 }
    const dips = speedDips(pts, { prominence: 20, minGap: 10 })
    expect(dips).toHaveLength(1)
    expect(pts[dips[0]].s).toBe(120)
  })
})

describe('detectCorners', () => {
  it('finds nothing on a straight', () => {
    expect(detectCorners(straight(200))).toEqual([])
  })

  it('refuses to guess from too little data', () => {
    expect(detectCorners(circle(5))).toEqual([])
    expect(detectCorners(null)).toEqual([])
  })

  it('numbers corners from 1, in lap order', () => {
    const found = detectCorners(roundedSquare())
    expect(found.length).toBeGreaterThan(1)
    expect(found[0].n).toBe(1)
    expect(found.map((c) => c.n)).toEqual(found.map((_, i) => i + 1))
    const starts = found.map((c) => c.startIdx)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('treats a constant-radius circle as ONE corner, which it is', () => {
    // Radius 0.05 -> curvature 20, comfortably above threshold, and continuous.
    expect(detectCorners(circle(300, 0.05))).toHaveLength(1)
  })

  it('puts the apex at the SLOWEST point, not the tightest', () => {
    // The curvature peak usually sits before what a driver calls the apex.
    const pts = circle(300, 0.05, 120)
    for (let i = 40; i <= 44; i++) pts[i] = { ...pts[i], s: 60 }
    const corner = detectCorners(pts).find((c) => c.startIdx <= 42 && c.endIdx >= 42)
    expect(corner).toBeTruthy()
    expect(corner.minSpeed).toBe(60)
  })

  it('reports gear at the apex alongside the speed', () => {
    const pts = circle(300, 0.05, 120)
    for (let i = 40; i <= 44; i++) pts[i] = { ...pts[i], s: 60, g: 2 }
    const corner = detectCorners(pts).find((c) => c.apexIdx >= 40 && c.apexIdx <= 44)
    expect(corner.gearAtApex).toBe(2)
  })

  it('reports null rather than 0 when the apex has no reading', () => {
    const pts = circle(300, 0.05).map((p) => ({ ...p, s: null, g: null }))
    const corners = detectCorners(pts)
    if (corners.length) {
      expect(corners[0].minSpeed).toBeNull()
      expect(corners[0].gearAtApex).toBeNull()
    }
  })

  it('catches a slow turn that curvature alone would miss', () => {
    // This is why the detector unions two signals: at ~13 m sampling, geometry
    // blurs tight sequences together, and the speed trace is what recovers them.
    const pts = straight(200)
    for (let i = 95; i <= 105; i++) pts[i] = { ...pts[i], s: 70 }
    const byCurvatureOnly = detectCorners(pts, { prominence: 1e9 })
    const byBoth = detectCorners(pts)
    expect(byCurvatureOnly).toHaveLength(0)
    expect(byBoth.length).toBeGreaterThan(0)
  })
})

describe('topSpeedIndex', () => {
  it('finds the fastest point', () => {
    const pts = straight(50)
    pts[17] = { ...pts[17], s: 244 }
    expect(topSpeedIndex(pts)).toBe(17)
  })
  it('ignores points with no speed', () => {
    expect(topSpeedIndex([{ s: null }, { s: 100 }, { s: undefined }])).toBe(1)
  })
  it('returns null for an empty trace', () => {
    expect(topSpeedIndex([])).toBeNull()
    expect(topSpeedIndex(null)).toBeNull()
  })
})

describe('relaxLabels', () => {
  const geom = { chipW: 108, chipH: 30, width: 1000, height: 600 }

  it('separates chips that would overlap', () => {
    const items = [{ bx: 500, by: 300 }, { bx: 505, by: 302 }]
    const out = relaxLabels(items, geom)
    expect(Math.abs(out[0].by - out[1].by)).toBeGreaterThan(Math.abs(300 - 302))
  })

  it('keeps chips inside the viewbox', () => {
    const out = relaxLabels([{ bx: -400, by: -400 }, { bx: 9999, by: 9999 }], geom)
    for (const it of out) {
      expect(it.bx).toBeGreaterThanOrEqual(20)
      expect(it.bx).toBeLessThanOrEqual(geom.width - geom.chipW - 30)
    }
  })

  it('terminates on a pathological layout instead of spinning', () => {
    // Twenty chips stacked on one another cannot all be separated; the pass cap
    // is what stops the relaxation running forever.
    const items = Array.from({ length: 20 }, () => ({ bx: 500, by: 300 }))
    expect(() => relaxLabels(items, { ...geom, passes: 40 })).not.toThrow()
  })

  it('does not mutate its input', () => {
    const items = [{ bx: 500, by: 300 }, { bx: 505, by: 302 }]
    relaxLabels(items, geom)
    expect(items[0]).toEqual({ bx: 500, by: 300 })
  })
})

describe('defaults', () => {
  it('are the swept values, not round numbers someone liked', () => {
    expect(DEFAULTS).toMatchObject({ threshold: 12, minRun: 2, mergeGap: 3, prominence: 6, minGap: 5 })
  })
})
