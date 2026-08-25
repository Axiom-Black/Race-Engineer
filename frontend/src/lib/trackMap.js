// ByteCraft Racing — track map projection and hit-testing.
//
// The map's one interactive job is turning a pointer position into a trace
// index, which is fiddly enough to be worth testing and invisible enough that
// a bug in it just feels "off" rather than looking broken.
//
// GPS CAVEAT, carried from CLAUDE.md: LMU's GPS channels are game-world
// coordinates dressed as latitude/longitude, nominally in the Pacific.
// Relative positions are exact — which is why the shape is trustworthy — but
// they must never be overlaid on a real map. Ingest already normalises them to
// 0…1 per session, so nothing here sees a real coordinate.
import { strictNum } from './num.js'

/** Points that actually carry a position. A lap can log telemetry with no GPS. */
export function gpsPoints(pts) {
  if (!Array.isArray(pts)) return []
  return pts.filter((p) => p && Number.isFinite(strictNum(p.x)) && Number.isFinite(strictNum(p.y)))
}

/**
 * Project a normalised point into SVG space.
 *
 * y is inverted because SVG grows downward while latitude grows north — without
 * this every circuit renders mirrored, which looks plausible to anyone who has
 * not driven it and is wrong.
 */
export function project(p, { width, height, pad }) {
  return {
    x: pad + strictNum(p.x) * (width - 2 * pad),
    y: pad + (1 - strictNum(p.y)) * (height - 2 * pad),
  }
}

/**
 * Index of the trace point nearest a position in SVG space.
 *
 * Squared distance, deliberately: the square root is monotonic, so it cannot
 * change which point wins, and skipping it avoids ~400 sqrt calls per pointer
 * move.
 *
 * Returns the index within the ORIGINAL array, not within the filtered GPS
 * subset — the caller scrubs a cursor over the full trace, and an index into a
 * filtered list would silently point at the wrong sample on any lap with a GPS
 * dropout.
 */
export function nearestPointIndex(pts, x, y, geom) {
  if (!Array.isArray(pts) || pts.length === 0) return null
  const mx = strictNum(x)
  const my = strictNum(y)
  if (!Number.isFinite(mx) || !Number.isFinite(my)) return null

  let best = null
  let bestDist = Infinity
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (!p || !Number.isFinite(strictNum(p.x)) || !Number.isFinite(strictNum(p.y))) continue
    const q = project(p, geom)
    const d = (q.x - mx) ** 2 + (q.y - my) ** 2
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

/**
 * Where a speed sits between the lap's slowest and fastest, as 0…1.
 *
 * Scaled to the LAP rather than to an absolute range so the colour spread uses
 * the full palette on every circuit: a Monaco lap and a Le Mans lap should both
 * show their slowest corner as slow, not render one entirely blue.
 *
 * Returns null when every point shares a speed — a stationary or single-sample
 * lap has no gradient to show, and dividing by that range would be a NaN.
 */
export function speedFraction(value, min, max) {
  const v = strictNum(value)
  const lo = strictNum(min)
  const hi = strictNum(max)
  if (![v, lo, hi].every(Number.isFinite)) return null
  if (hi - lo <= 0) return null
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
}

/** The lap's speed extremes, ignoring points with no reading. */
export function speedExtent(pts) {
  const speeds = (Array.isArray(pts) ? pts : [])
    .map((p) => strictNum(p?.s))
    .filter(Number.isFinite)
  if (speeds.length === 0) return null
  return { min: Math.min(...speeds), max: Math.max(...speeds) }
}
