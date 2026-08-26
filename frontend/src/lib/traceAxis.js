// ByteCraft Racing — the x-axis of every trace plot.
//
// WHY THIS EXISTS NOW. Until lib/resample.js, a lap's points were evenly spaced
// by distance, so `i / (n - 1)` was the distance fraction and every plot used
// it. Points are now spent where the car is doing something, so index and
// distance have come apart: index 200 of 400 is no longer half way round the
// lap, it is somewhere before the middle, because the corners behind it ate
// more than their share of the budget.
//
// Plotting the new trace against index would stretch every corner and compress
// every straight — a braking trace would look like it started 200 m early. So
// the axis has to come from `d`, and the inverse (pointer position -> index)
// has to search it rather than multiply.
import { strictNum } from './num.js'

/**
 * The distance-fraction axis for a trace.
 *
 * Falls back to even spacing when `d` is missing or not monotonic — some
 * sessions predate the field, and a plot with a plausible axis beats a plot
 * with none. Always returns exactly `pts.length` values in 0…1.
 */
export function distanceAxis(pts) {
  const n = Array.isArray(pts) ? pts.length : 0
  if (n === 0) return []
  if (n === 1) return [0]

  const ds = pts.map((p) => strictNum(p?.d))
  let usable = ds.every(Number.isFinite)
  if (usable) {
    for (let i = 1; i < n; i++) {
      if (ds[i] < ds[i - 1]) { usable = false; break }
    }
  }
  // A flat axis (every point at the same distance) would collapse the plot to
  // one column; treat it as unusable rather than dividing by its zero range.
  if (usable && !(ds[n - 1] > ds[0])) usable = false
  if (!usable) return pts.map((_, i) => i / (n - 1))

  // Renormalise to 0…1 so a lap whose last point stops at 0.998 still fills
  // the plot, and so the axis is comparable across laps.
  const lo = ds[0]
  const span = ds[n - 1] - lo
  return ds.map((v) => (v - lo) / span)
}

/** SVG x for the point at `i`, given the axis and the plot width. */
export function xAt(axis, i, width) {
  const v = axis[Math.min(Math.max(0, i), axis.length - 1)]
  return (Number.isFinite(v) ? v : 0) * width
}

/**
 * The index in a monotonically non-decreasing array whose value is nearest
 * `value` — the distance axis here, the lap-time axis in lib/replay.js.
 *
 * Binary search, because this runs on every pointer move over a 400-point
 * trace and on every animation frame of the replay; a linear scan of four
 * plots plus a map adds up. Returns the closer of the two bracketing points
 * rather than always rounding down, so scrubbing lands on the sample under the
 * cursor instead of the one just behind it.
 */
export function nearestIndex(axis, value) {
  const n = axis?.length ?? 0
  if (n === 0) return 0
  const f = strictNum(value)
  if (!Number.isFinite(f)) return 0
  if (f <= axis[0]) return 0
  if (f >= axis[n - 1]) return n - 1

  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (axis[mid] <= f) lo = mid
    else hi = mid
  }
  return f - axis[lo] <= axis[hi] - f ? lo : hi
}
