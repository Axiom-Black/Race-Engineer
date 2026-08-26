// ByteCraft Racing — the replay clock.
//
// WHY THIS REPLACED AN INDEX COUNTER. Playback used to advance the cursor at a
// constant rate through the sample array: n points over lapSeconds, one step
// per frame's worth of that. While points were evenly spaced by DISTANCE that
// was already subtly wrong — a distance-uniform sweep runs a lap at constant
// speed, so it hurried through the corners the driver spent real seconds in —
// but it was close enough to look like a car.
//
// Importance-weighted sampling (lib/resample.js) broke it outright. Corners now
// hold three to four times the points of a straight, so a constant index rate
// crawls through every corner and fires down every straight: the exact inverse
// of what the car did. The replay would be a lie about the one thing it exists
// to show.
//
// So the clock is now SECONDS. Each point already has a lap time — lib/delta.js
// integrates distance over speed and scales the result to the lap's recorded
// duration — and playback walks that axis, looking up the point whose time is
// nearest the elapsed reading. Sampling density stops mattering entirely, which
// is the property worth having: change the resampler again and the replay is
// still right.
import { cumulativeLapTime } from './delta.js'
import { nearestIndex } from './traceAxis.js'

/**
 * Seconds-into-the-lap for each point, or null when the lap has no time.
 *
 * An out-lap or a trailing partial has no recorded duration, and a replay of it
 * would have to invent a pace. Returning null is what disables the transport
 * rather than playing back a fabricated one.
 */
export function lapTimeAxis(pts, lapSeconds) {
  return cumulativeLapTime(pts, lapSeconds)
}

/**
 * Advance the replay clock by `dt` real seconds at `rate`x, wrapping at the
 * end of the lap.
 *
 * Wrapping to 0 rather than stopping: a lap is a loop, and a driver comparing
 * two corners wants it to come round again without reaching for the button.
 */
export function advanceTime(elapsed, dt, lapSeconds, rate = 1) {
  const t = Number(elapsed)
  const step = Number(dt)
  const total = Number(lapSeconds)
  const r = Number(rate) || 1
  if (!Number.isFinite(total) || total <= 0) return 0
  const base = Number.isFinite(t) ? t : 0
  if (!Number.isFinite(step)) return base
  const next = base + step * r
  if (!Number.isFinite(next)) return 0
  // Modulo rather than a reset, so a long stall (a backgrounded tab handing back
  // a two-second frame) lands where the car would be, not at the start line.
  return next >= total ? next % total : Math.max(0, next)
}

/** The point being shown at `seconds` into the lap. */
export function indexAtTime(times, seconds) {
  if (!Array.isArray(times) || times.length === 0) return 0
  return nearestIndex(times, seconds)
}

/** Seconds into the lap for a point, for seeking by hand. */
export function timeAtIndex(times, index) {
  if (!Array.isArray(times) || times.length === 0) return 0
  const i = Math.min(Math.max(0, Math.round(Number(index) || 0)), times.length - 1)
  const v = times[i]
  return Number.isFinite(v) ? v : 0
}
