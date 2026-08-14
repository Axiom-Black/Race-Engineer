// ByteCraft Racing — lap-vs-lap delta time (S8).
//
// Pure functions, no React and no I/O — the same discipline as lib/ingest.js.
//
// The persisted trace stores speed and NORMALIZED DISTANCE per point, but no
// timestamp (see lib/ingest.js buildLapPoints). Rather than re-ingest every
// existing session to add a time field, cumulative time is reconstructed by
// integrating 1/speed over the distance axis and then scaling so the lap
// totals its known lap time. That is self-consistent: the distance axis was
// itself built by integrating speed over time, so this inverts the same
// relationship — and it works on traces already in Storage.
//
// The delta itself is a pointwise subtraction, which is only possible because
// every lap is resampled to the SAME normalized-distance grid (the S5
// decision that made this story cheap). Two laps of different duration line
// up by track position, not elapsed time.

/** Speed floor (km/h) so a stationary sample can't divide by zero. */
export const MIN_SPEED_KMH = 1

/**
 * Cumulative elapsed time (seconds) at each trace point.
 * Returns null when the lap can't be timed (no points, or no recorded lap
 * time — e.g. an out-lap still running at export). Null is honest here: a
 * fabricated delta against an untimed lap would be worse than no delta.
 *
 * @param {Array<{d:number,s:number|null}>} pts
 * @param {number|null} lapTimeS  the lap's recorded duration
 * @returns {number[]|null} cumulative seconds, [0] === 0, last === lapTimeS
 */
export function cumulativeLapTime(pts, lapTimeS) {
  if (!Array.isArray(pts) || pts.length < 2) return null
  if (lapTimeS == null || !(lapTimeS > 0)) return null

  // Raw integral of dd / v — units are arbitrary; scaling fixes them.
  const raw = new Array(pts.length)
  raw[0] = 0
  for (let i = 1; i < pts.length; i++) {
    const dd = Math.max(0, (pts[i].d ?? 0) - (pts[i - 1].d ?? 0))
    const vAvg = ((pts[i - 1].s ?? 0) + (pts[i].s ?? 0)) / 2
    const v = Math.max(MIN_SPEED_KMH, vAvg)
    raw[i] = raw[i - 1] + dd / v
  }

  const total = raw[raw.length - 1]
  if (!(total > 0)) return null

  const k = lapTimeS / total
  return raw.map((v) => v * k)
}

/**
 * Linear interpolation of `values` (indexed by the monotonically
 * non-decreasing distances `ds`) at distance `d`. Clamps outside the range.
 */
export function sampleAtDistance(ds, values, d) {
  const n = ds.length
  if (!n) return null
  if (d <= ds[0]) return values[0]
  if (d >= ds[n - 1]) return values[n - 1]

  let lo = 0
  let hi = n - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (ds[mid] <= d) lo = mid
    else hi = mid
  }
  const span = ds[hi] - ds[lo]
  const f = span === 0 ? 0 : (d - ds[lo]) / span
  return values[lo] + (values[hi] - values[lo]) * f
}

/**
 * Cumulative delta time of lap A against reference lap B, sampled on A's
 * distance grid. Positive = A is BEHIND B at that point on track.
 * The final value equals A's lap time minus B's.
 *
 * @param {{pts:Array,time:number|null}} lapA  selected lap
 * @param {{pts:Array,time:number|null}} lapB  reference lap
 * @returns {number[]|null}
 */
export function deltaTrace(lapA, lapB) {
  if (!lapA?.pts?.length || !lapB?.pts?.length) return null
  const tA = cumulativeLapTime(lapA.pts, lapA.time)
  const tB = cumulativeLapTime(lapB.pts, lapB.time)
  if (!tA || !tB) return null

  const dsB = lapB.pts.map((p) => p.d ?? 0)
  return lapA.pts.map((p, i) => tA[i] - sampleAtDistance(dsB, tB, p.d ?? 0))
}

/** Format a delta for display: signed, 3 dp, with a leading + when behind. */
export function fmtDelta(v) {
  if (v == null || Number.isNaN(v)) return '—'
  const s = v.toFixed(3)
  return v > 0 ? `+${s}` : s
}
