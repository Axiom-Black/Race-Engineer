// ByteCraft Racing — corner detection from the GPS trace.
//
// WHY THIS EXISTS. The track map without corner numbers is a coloured line: it
// shows where the car was, and answers nothing. The number a driver wants is
// "what did I carry through turn 6, and in what gear" — which needs the
// corners themselves identified, numbered and given an apex.
//
// METHOD: MENGER CURVATURE, THEN SPEED FOR THE APEX.
//
// Curvature at point i is computed from the triangle through its neighbours:
//
//     k = 4 * area(A,B,C) / (|AB| * |BC| * |CA|)
//
// which is the reciprocal of the circumradius — large through a hairpin, near
// zero down a straight. Geometry decides WHERE a corner is; speed decides where
// its apex is, because the slowest point of a corner is what a driver means by
// the apex and the curvature peak often sits slightly before it.
//
// Positions are the normalised 0…1 GPS the trace already carries, so curvature
// is in normalised units and the threshold is a shape property, not a distance.
//
// THE LIMIT IS TRACE RESOLUTION, AND IT IS OURS.
//
// Phase 1 persists a DOWNSAMPLED trace — ~400 points per lap. At COTA that is
// 5.42 km / 400 = roughly 13.5 m between samples, and COTA's tight sequences
// are shorter than the window any curvature estimate needs. Sweeping the real
// export shows detection plateauing at TWELVE corners: curvature alone reaches
// 13 across every threshold and span tried, speed dips alone 12, the union 12.
// The circuit has 20.
//
// So the gap is not a tuning failure and cannot be tuned away. Raising the
// persisted trace resolution is the only thing that would move it, and that is
// a storage decision, not a detection one. The earlier prototype's 16 corners
// came from a set precomputed against the full-rate data, which is why it is
// not reproducible here.
//
// CONSEQUENCE FOR THE UI: this numbering is OURS, derived from one lap, and it
// is not the circuit's official numbering. It must be labelled as such —
// showing "T12" next to a corner a driver calls turn 15 is worse than showing
// an honest count, because it invites them to quote it to someone else. The
// curated corner registry in Phase 3 is what replaces it with real numbering.
import { strictNum } from './num.js'

/** Menger curvature at index i, or 0 where it is undefined. */
export function curvatureAt(pts, i, span = 3) {
  const a = pts[i - span]
  const b = pts[i]
  const c = pts[i + span]
  if (!a || !b || !c) return 0
  const ax = strictNum(a.x), ay = strictNum(a.y)
  const bx = strictNum(b.x), by = strictNum(b.y)
  const cx = strictNum(c.x), cy = strictNum(c.y)
  if (![ax, ay, bx, by, cx, cy].every(Number.isFinite)) return 0

  const area2 = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
  const ab = Math.hypot(bx - ax, by - ay)
  const bc = Math.hypot(cx - bx, cy - by)
  const ca = Math.hypot(ax - cx, ay - cy)
  const denom = ab * bc * ca
  // Coincident samples (a stationary car) give a zero denominator, not a
  // corner of infinite tightness.
  if (denom < 1e-12) return 0
  return (2 * area2) / denom
}

/**
 * Outward normal at index i — the direction a badge should be offset so it sits
 * beside the track rather than on it.
 *
 * Perpendicular to the local direction of travel, flipped to point away from
 * the lap's centroid so labels land outside the circuit rather than inside it,
 * where they would collide with the rest of the track.
 */
export function outwardNormal(pts, i, centroid, span = 3) {
  const a = pts[Math.max(0, i - span)]
  const b = pts[Math.min(pts.length - 1, i + span)]
  const p = pts[i]
  if (!a || !b || !p) return { nx: 0, ny: -1 }
  const dx = strictNum(b.x) - strictNum(a.x)
  const dy = strictNum(b.y) - strictNum(a.y)
  const len = Math.hypot(dx, dy)
  if (!Number.isFinite(len) || len < 1e-9) return { nx: 0, ny: -1 }
  let nx = -dy / len
  let ny = dx / len
  // Flip if it points inward.
  const toOut = { x: strictNum(p.x) - centroid.x, y: strictNum(p.y) - centroid.y }
  if (nx * toOut.x + ny * toOut.y < 0) {
    nx = -nx
    ny = -ny
  }
  return { nx, ny }
}

function centroidOf(pts) {
  let sx = 0, sy = 0, n = 0
  for (const p of pts) {
    const x = strictNum(p?.x), y = strictNum(p?.y)
    if (Number.isFinite(x) && Number.isFinite(y)) { sx += x; sy += y; n++ }
  }
  return n ? { x: sx / n, y: sy / n } : { x: 0.5, y: 0.5 }
}

/**
 * Local speed minima with enough prominence to be a corner rather than a lift.
 *
 * `prominence` is in km/h: how far the car had to slow below the surrounding
 * peaks. This is the signal that catches slow turns geometry blurs together at
 * this sampling rate.
 */
export function speedDips(pts, { prominence, minGap }) {
  const s = pts.map((p) => {
    const v = strictNum(p?.s)
    return Number.isFinite(v) ? v : Infinity
  })
  const n = s.length
  const keep = []
  for (let i = 1; i < n - 1; i++) {
    if (!(s[i] <= s[i - 1] && s[i] < s[i + 1])) continue
    let lp = s[i]
    let rp = s[i]
    for (let q = i; q >= 0 && s[q] >= s[i]; q--) lp = Math.max(lp, s[q])
    for (let q = i; q < n && s[q] >= s[i]; q++) rp = Math.max(rp, s[q])
    const prom = Math.min(lp, rp) - s[i]
    if (Number.isFinite(prom) && prom >= prominence) keep.push({ i, prom })
  }
  const out = []
  for (const k of keep) {
    const last = out[out.length - 1]
    if (last && k.i - last.i < minGap) {
      if (k.prom > last.prom) out[out.length - 1] = k
    } else out.push(k)
  }
  return out.map((k) => k.i)
}

// Defaults chosen by sweeping the real COTA export, not guessed. Across every
// combination tried, detection plateaus at TWELVE corners — curvature alone
// tops out at 13, speed dips alone at 12, and the union at 12. See the
// resolution note in the module header for why.
export const DEFAULTS = {
  threshold: 12,
  // A corner must persist over more than one sample: isolated spikes are GPS
  // noise, not turns.
  minRun: 2,
  // Runs closer than this are one corner — what merges an entry and exit
  // phase, and what makes a multi-apex complex read as one.
  mergeGap: 3,
  // Half-width of the curvature window, in samples. The trace is ~400 points
  // per lap (~13 m at COTA), so a span of 3 smooths a 40 m window and erases
  // tighter turns — this is the knob that decides resolution.
  span: 2,
  // Speed drop, in km/h, that marks a corner geometry alone would miss.
  prominence: 6,
  // Two detections closer than this are the same corner.
  minGap: 5,
}

/**
 * Detect corners in a single lap's trace.
 *
 * @returns Array of `{ n, startIdx, apexIdx, endIdx, minSpeed, gearAtApex, nx, ny }`
 *          numbered from 1 in lap order.
 */
export function detectCorners(pts, opts = {}) {
  const { threshold, minRun, mergeGap, span, prominence, minGap } = { ...DEFAULTS, ...opts }
  if (!Array.isArray(pts) || pts.length < 10) return []

  const k = pts.map((_, i) => curvatureAt(pts, i, span))

  // Contiguous runs above threshold.
  const runs = []
  let start = null
  for (let i = 0; i < k.length; i++) {
    if (k[i] >= threshold) {
      if (start === null) start = i
    } else if (start !== null) {
      runs.push([start, i - 1])
      start = null
    }
  }
  if (start !== null) runs.push([start, k.length - 1])

  const merged = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && run[0] - last[1] <= mergeGap) last[1] = run[1]
    else merged.push([...run])
  }

  const kept = merged.filter(([a, b]) => b - a + 1 >= minRun)

  // UNION OF TWO SIGNALS, because neither alone is enough at this sampling
  // rate. Curvature finds fast kinks the driver barely lifts for; speed dips
  // find slow turns that 13 m sampling blurs into one another. Measured on the
  // real COTA lap: curvature alone tops out at 13 corners across every
  // threshold/span combination tried, speed alone at 12, and they disagree
  // about which.
  const dips = speedDips(pts, { prominence, minGap })
  const covered = (i) => kept.some(([a, b]) => i >= a - minGap && i <= b + minGap)
  for (const i of dips) {
    if (!covered(i)) kept.push([Math.max(0, i - 2), Math.min(pts.length - 1, i + 2)])
  }
  kept.sort((a, b) => a[0] - b[0])

  const centroid = centroidOf(pts)

  return kept.map(([a, b], idx) => {
    // Apex is the SLOWEST point in the corner, not the tightest: the curvature
    // peak usually sits before the point a driver would call the apex.
    let apex = a
    for (let i = a; i <= b; i++) {
      const s = strictNum(pts[i]?.s)
      const best = strictNum(pts[apex]?.s)
      if (Number.isFinite(s) && (!Number.isFinite(best) || s < best)) apex = i
    }
    const { nx, ny } = outwardNormal(pts, apex, centroid)
    const minSpeed = strictNum(pts[apex]?.s)
    const gear = strictNum(pts[apex]?.g)
    return {
      n: idx + 1,
      startIdx: a,
      apexIdx: apex,
      endIdx: b,
      minSpeed: Number.isFinite(minSpeed) ? Math.round(minSpeed) : null,
      gearAtApex: Number.isFinite(gear) ? Math.round(gear) : null,
      nx,
      ny,
    }
  })
}

/** Index of the fastest point in the lap — the top-speed marker. */
export function topSpeedIndex(pts) {
  if (!Array.isArray(pts) || pts.length === 0) return null
  let best = null
  for (let i = 0; i < pts.length; i++) {
    const s = strictNum(pts[i]?.s)
    if (!Number.isFinite(s)) continue
    if (best === null || s > strictNum(pts[best].s)) best = i
  }
  return best
}

/**
 * Push overlapping badges apart so labels stay readable.
 *
 * A simple relaxation, as in the prototype: repeatedly separate any two chips
 * that overlap, capped at `passes` so a pathological layout cannot spin.
 * Positions are in SVG space; the caller supplies chip dimensions.
 */
export function relaxLabels(items, { chipW, chipH, width, height, passes = 40 }) {
  const out = items.map((it) => ({ ...it }))
  for (const it of out) {
    it.bx = Math.max(20, Math.min(width - chipW - 30, it.bx))
    it.by = Math.max(chipH, Math.min(height - chipH, it.by))
  }
  for (let pass = 0; pass < passes; pass++) {
    let moved = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const A = out[i]
        const B = out[j]
        if (Math.abs(A.bx - B.bx) < chipW + 34 && Math.abs(A.by - B.by) < chipH + 8) {
          const push = (chipH + 9 - Math.abs(A.by - B.by)) / 2 + 1
          if (A.by <= B.by) { A.by -= push; B.by += push } else { A.by += push; B.by -= push }
          moved = true
        }
      }
    }
    if (!moved) break
  }
  return out
}
