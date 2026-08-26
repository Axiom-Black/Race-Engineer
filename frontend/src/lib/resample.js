// ByteCraft Racing — where a lap's stored points are spent.
//
// THE PROBLEM. Phase 1 persists a downsampled trace, and until now it spent its
// budget uniformly: 400 points spread evenly along track distance. At COTA that
// is 5.42 km / 400 ≈ 13.5 m between samples EVERYWHERE — the same resolution
// down the back straight, where the car does one thing for 1.2 km, as through
// the Turn 3-6 esses, where it changes direction four times inside 300 m.
//
// That is the wrong place to spend points, and it is measurable: corner
// detection plateaus at twelve corners on a circuit with twenty (see
// lib/corners.js), because the tight sequences are shorter than the window any
// curvature estimate needs at 13.5 m spacing.
//
// THE EFFICIENT FIX IS NOT MORE POINTS. Tripling the budget triples the row —
// the trace lives in Postgres on a free tier, and a 20-lap session already
// carries 8000 points. Instead, keep the budget and MOVE it: sample densely
// where the car is doing something and sparsely where it is not. A straight is
// straight; three points describe it as well as thirty.
//
// HOW. Build a per-sample importance weight over the lap,
//
//     w = 1 + cornerWeight · min(1, |G_lat| / gLatRef)
//           + accelWeight  · min(1, |dv/dt| / accelRef)
//
// so a sample is worth 1 on a steady straight and up to 1 + 3 + 2 = 6 under
// combined cornering and braking. Integrate w against DISTANCE to get a
// weighted arc length, then place the output points at equal intervals of THAT
// — inverse-CDF sampling of the importance density. Corners end up with ~3-4x
// the sample density they had; straights give up what they never needed.
//
// The weight field is box-smoothed first. An abrupt density change shows up as
// visible clumping at the corner entry, and the smoothing costs one pass.
//
// CONSEQUENCE FOR THE DATA CONTRACT: points are no longer evenly spaced, so a
// point's `d` (distance fraction) can no longer be inferred from its index.
// Every consumer that plotted against `i / (n - 1)` must plot against `d`.
// lib/delta.js already integrates over `d` correctly; the trace plots in
// SessionReport did not, and were fixed alongside this.

export const RESAMPLE_DEFAULTS = {
  // Lateral G at which the cornering term saturates. 1.5 G is a firm corner in
  // a GT3/Hypercar — beyond it, more G does not need more points, it needs the
  // same points closer together, which the term has already bought.
  gLatRef: 1.5,
  // Longitudinal acceleration (m/s²) at which the braking/traction term
  // saturates. ~8 m/s² is heavy braking without being a lock-up.
  accelRef: 8,
  cornerWeight: 3,
  accelWeight: 2,
  // Box-smoothing half-width, in samples, applied to the weight field.
  smoothRadius: 4,
}

/**
 * Box-smooth a weight field in place-safe fashion (returns a new array).
 *
 * Without this the density steps at the exact sample where |G| crosses the
 * reference, and the output points visibly bunch at that step rather than
 * easing into the corner.
 */
export function smoothWeights(w, radius) {
  const n = w.length
  if (!(radius > 0) || n === 0) return Array.from(w)
  // Prefix sums: a box filter of any radius in one pass rather than n·radius.
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + w[i]
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius)
    const hi = Math.min(n - 1, i + radius)
    out[i] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1)
  }
  return out
}

/**
 * Importance weight per sample across one lap.
 *
 * @param {object} lap
 * @param {number[]} lap.speeds   Ground Speed (km/h) for the lap's samples
 * @param {Array<number|null>} [lap.gLat]  lateral G aligned to `speeds`, or omitted
 * @param {number} lap.rateHz     Ground Speed's own sample rate
 * @returns {number[]} weights, each >= 1
 */
export function importanceWeights({ speeds, gLat, rateHz }, opts = {}) {
  const { gLatRef, accelRef, cornerWeight, accelWeight, smoothRadius } = {
    ...RESAMPLE_DEFAULTS,
    ...opts,
  }
  const n = Array.isArray(speeds) ? speeds.length : 0
  if (n === 0) return []
  const dt = 1 / (rateHz || 1)
  const raw = new Float64Array(n)

  for (let i = 0; i < n; i++) {
    let bonus = 0

    const g = gLat?.[i]
    if (typeof g === 'number' && Number.isFinite(g)) {
      bonus += cornerWeight * Math.min(1, Math.abs(g) / gLatRef)
    }

    // Central difference on speed. At the ends it degrades to a one-sided
    // difference rather than reaching outside the lap, which would pull in the
    // previous lap's braking zone.
    const a = speeds[Math.max(0, i - 1)]
    const b = speeds[Math.min(n - 1, i + 1)]
    const span = Math.min(n - 1, i + 1) - Math.max(0, i - 1)
    if (typeof a === 'number' && typeof b === 'number' && span > 0) {
      const accel = Math.abs((b - a) / 3.6) / (span * dt) // km/h -> m/s²
      if (Number.isFinite(accel)) bonus += accelWeight * Math.min(1, accel / accelRef)
    }

    raw[i] = 1 + bonus
  }

  return smoothWeights(raw, smoothRadius)
}

/**
 * Choose which sample indices to keep, spending `count` points in proportion to
 * importance-weighted distance.
 *
 * `cumDist` is cumulative metres along the lap (monotonically non-decreasing);
 * `weights` is aligned to it. Returns strictly increasing local indices, always
 * starting at 0 and ending at the last sample, so the lap is closed.
 *
 * DUPLICATES ARE DROPPED. Where the weighting asks for more points than the
 * source has samples — a slow hairpin at 20 Hz — two output points land on the
 * same source index. Keeping both would store the same reading twice; dropping
 * one costs nothing, because raw sample resolution is a real ceiling and no
 * amount of budget gets past it. The lap simply comes back shorter than
 * `count`, which is why callers must never assume a fixed length.
 */
export function allocateByWeight(cumDist, weights, count) {
  const n = Math.min(cumDist?.length ?? 0, weights?.length ?? 0)
  if (n === 0) return []
  if (n === 1 || !(count > 1)) return [0]

  // Weighted arc length: ∫ w ds, accumulated on the same index axis.
  const cumW = new Float64Array(n)
  for (let i = 1; i < n; i++) {
    const ds = Math.max(0, cumDist[i] - cumDist[i - 1])
    const w = (weights[i] + weights[i - 1]) / 2
    cumW[i] = cumW[i - 1] + w * ds
  }
  const total = cumW[n - 1]
  // A stationary lap has no arc length to distribute. Fall back to even index
  // spacing rather than returning a single point.
  if (!(total > 0)) {
    const out = []
    for (let k = 0; k < count; k++) {
      const i = Math.round((k / (count - 1)) * (n - 1))
      if (out[out.length - 1] !== i) out.push(i)
    }
    return out
  }

  const out = []
  let cursor = 0
  for (let k = 0; k < count; k++) {
    const target = (k / (count - 1)) * total
    while (cursor < n - 1 && cumW[cursor] < target) cursor++
    if (out.length === 0 || out[out.length - 1] !== cursor) out.push(cursor)
  }
  // Guarantee the lap closes on its last sample even if rounding stopped short.
  if (out[out.length - 1] !== n - 1) out.push(n - 1)
  return out
}

/**
 * Effective spacing statistics for a chosen index set — used by tests and by
 * anyone asking "did the redistribution actually do anything".
 *
 * @returns {{minM:number, maxM:number, medianM:number}|null}
 */
export function spacingStats(cumDist, indices) {
  if (!Array.isArray(indices) || indices.length < 2) return null
  const gaps = []
  for (let i = 1; i < indices.length; i++) {
    gaps.push(Math.max(0, cumDist[indices[i]] - cumDist[indices[i - 1]]))
  }
  const sorted = [...gaps].sort((a, b) => a - b)
  return {
    minM: sorted[0],
    maxM: sorted[sorted.length - 1],
    medianM: sorted[Math.floor(sorted.length / 2)],
  }
}
