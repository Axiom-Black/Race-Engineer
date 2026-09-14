// ByteCraft Racing — corners on the map: resolving the persisted set, and the
// legacy fallback that detects from the trace's geometry.
//
// WHY THIS EXISTS. The track map without corner numbers is a coloured line: it
// shows where the car was, and answers nothing. The number a driver wants is
// "what did I carry through turn 6, and in what gear" — which needs the
// corners themselves identified, numbered and given an apex.
//
// WHERE CORNERS COME FROM NOW. **lib/cornerDetect.js, at ingest, from
// `G Force Lat` at its own 25 Hz** — 8.5x this trace's resolution — and the
// result is persisted with the session. That finds 20 corners on every lap of
// the real COTA export against the circuit's official 20. `resolveCorners()`
// below is the normal path.
//
// EVERYTHING BELOW `detectCorners` IS THE FALLBACK, and it is kept only for
// sessions ingested before corners were persisted. It reads the downsampled
// trace, so it is capped by a storage decision rather than by the circuit: 12
// corners under uniform spacing, 15 under importance-weighted spacing, on a
// track with 20. Do not extend it, and do not tune it in the belief that the
// gap is tunable — it is not, which is exactly why detection moved to ingest.
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
// CONSEQUENCE FOR THE UI, WHICHEVER PATH PRODUCED THE CORNERS: this numbering
// is OURS. It counts cornering events; official numbering is a circuit-operator
// convention that no telemetry channel contains. It must stay labelled as such
// — showing "T12" next to a corner a driver calls turn 15 is worse than showing
// an honest count, because it invites them to quote it to someone else. The
// curated corner registry in Phase 3 is what replaces it with real numbering.
import { strictNum } from './num.js'
import { distanceAxis, nearestIndex } from './traceAxis.js'

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

// Defaults RE-SWEPT against the importance-weighted trace, not guessed and not
// carried over: every one of these moved when lib/resample.js changed what a
// sample index is worth. The winning combination finds 15 corners on the real
// COTA fastest lap; the next setting up (minGap 3) reports 16 by splitting one
// turn at 78%/79% into two, which is a worse answer with a bigger number.
export const DEFAULTS = {
  // Menger curvature, in normalised-GPS units. Far higher than the old 12
  // because corner samples are now ~5 m apart rather than ~13 m: the same turn
  // resolves as a much tighter arc, so the bar to clear rises with it.
  threshold: 40,
  // A corner must persist over more than one sample: isolated spikes are GPS
  // noise, not turns.
  minRun: 2,
  // Runs closer than this are one corner — what merges an entry and exit
  // phase, and what makes a multi-apex complex read as one.
  mergeGap: 3,
  // Half-width of the curvature window, in samples. Now 1 (a 3-point window),
  // because in a corner that spans ~10-20 m rather than the ~55 m a span of 2
  // covered under uniform sampling. This is the knob that decides resolution.
  span: 1,
  // Speed drop, in km/h, that marks a corner geometry alone would miss.
  prominence: 3,
  // Two detections closer than this are the same corner. In samples, so it
  // tightened along with the spacing.
  minGap: 4,
}

/**
 * LEGACY: detect corners from a single lap's downsampled trace.
 *
 * Only reached for sessions persisted before ingest-time detection existed —
 * `resolveCorners()` prefers the stored set. See the module header for why this
 * cannot reach the real corner count and must not be tuned in the hope that it
 * can.
 *
 * @returns Array of `{ n, startIdx, apexIdx, endIdx, minSpeed, gearAtApex, nx, ny }`
 *          numbered from 1 in lap order.
 */
export function detectCorners(pts, opts = {}) {
  const { threshold, minRun, mergeGap, span, prominence, minGap } = { ...DEFAULTS, ...opts }
  if (!Array.isArray(pts) || pts.length < 10) return []

  // Needed so each corner can report WHERE it is as a distance fraction, not
  // only as an index into this lap's point array — see the return shape below.
  const axis = distanceAxis(pts)
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
      // DISTANCE FRACTIONS TRAVEL WITH THE CORNER, alongside the indices.
      //
      // Indices are how this lap is drawn; `d` is what the corner IS. A Track
      // Note anchors to a distance span precisely so it survives the detector
      // renumbering or re-indexing — and a resolver that converts `d` to an
      // index and drops it leaves the note with nothing to anchor to. That is
      // not hypothetical: it disabled Save on every corner in production, while
      // notes on straights (which read the distance axis directly) worked fine.
      dStart: axis[a],
      d: axis[apex],
      dEnd: axis[b],
      minSpeed: Number.isFinite(minSpeed) ? Math.round(minSpeed) : null,
      gearAtApex: Number.isFinite(gear) ? Math.round(gear) : null,
      nx,
      ny,
    }
  })
}

/**
 * The corner the cursor is currently inside, or null on a straight.
 *
 * Deliberately NOT "the nearest corner": a cursor halfway down the back
 * straight is not in a corner, and labelling it with whichever turn happens to
 * be closest would put a corner readout on a piece of track that has none.
 * Straight is a real answer.
 */
export function cornerAt(corners, index) {
  if (!Array.isArray(corners)) return null
  const i = strictNum(index)
  if (!Number.isFinite(i)) return null
  return corners.find((c) => i >= c.startIdx && i <= c.endIdx) ?? null
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

/**
 * Turn the persisted corner set into what the map draws.
 *
 * Ingest stores corners as DISTANCE FRACTIONS, not trace indices, so that the
 * stored set survives any future change to how the trace is resampled — the
 * importance-weighted resampler moved every index once already. Inverting `d`
 * here costs a binary search per corner and means the two can never drift.
 *
 * A corner whose apex falls outside the trace (a GPS dropout at exactly that
 * point) is dropped rather than clamped to the nearest sample: a badge pinned
 * to the wrong piece of track is worse than one corner not shown.
 */
export function cornersFromPersisted(persisted, pts) {
  if (!Array.isArray(persisted) || persisted.length === 0) return []
  if (!Array.isArray(pts) || pts.length === 0) return []

  const axis = distanceAxis(pts)
  const centroid = centroidOf(pts)

  return persisted
    .map((c, i) => {
      const d = strictNum(c?.d)
      if (!Number.isFinite(d)) return null
      const apexIdx = nearestIndex(axis, d)
      const startIdx = Number.isFinite(strictNum(c?.dStart)) ? nearestIndex(axis, strictNum(c.dStart)) : apexIdx
      const endIdx = Number.isFinite(strictNum(c?.dEnd)) ? nearestIndex(axis, strictNum(c.dEnd)) : apexIdx
      const { nx, ny } = outwardNormal(pts, apexIdx, centroid)
      const minSpeed = strictNum(c?.minSpeed)
      const gear = strictNum(c?.gear)
      return {
        n: strictNum(c?.n) || i + 1,
        startIdx: Math.min(startIdx, apexIdx),
        apexIdx,
        endIdx: Math.max(endIdx, apexIdx),
        // The ORIGINAL fractions, not the axis values the indices round to.
        // Ingest measured these at 25 Hz against the full-rate lateral-G trace;
        // the 400-point axis is a coarser grid, so re-deriving them from
        // `axis[apexIdx]` would quietly move every corner a few metres and make
        // a note saved today disagree with the same corner tomorrow.
        dStart: Number.isFinite(strictNum(c?.dStart)) ? strictNum(c.dStart) : d,
        d,
        dEnd: Number.isFinite(strictNum(c?.dEnd)) ? strictNum(c.dEnd) : d,
        minSpeed: Number.isFinite(minSpeed) ? Math.round(minSpeed) : null,
        gearAtApex: Number.isFinite(gear) ? Math.round(gear) : null,
        direction: c?.dir ?? null,
        peakG: strictNum(c?.peakG) ?? null,
        nx,
        ny,
      }
    })
    .filter(Boolean)
}

/**
 * The corners to draw for a lap: the persisted set when the session has one,
 * the legacy trace detector when it does not.
 *
 * The fallback is deliberately silent rather than flagged. A session uploaded
 * before ingest-time detection is not faulty, and its map is not wrong — it is
 * coarser, and telling a driver their old session is somehow lesser would be
 * noise about our release history rather than about their driving.
 */
export function resolveCorners(persisted, pts, opts) {
  const stored = cornersFromPersisted(persisted, pts)
  return stored.length ? stored : detectCorners(pts, opts)
}
