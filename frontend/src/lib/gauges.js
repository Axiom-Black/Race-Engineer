// ByteCraft Racing — geometry and thresholds for the instrument cluster.
//
// The maths behind a dial is easy to get subtly wrong and impossible to eyeball:
// an arc that is 3° short at full scale looks fine and is wrong. Keeping it
// here means the geometry is testable without rendering anything, and the
// component is left with layout only.
//
// Ported from prototypes/ByteCraft_SessionReport.jsx's RadialGauge / GForceCross
// / SlipRow, whose visual language this preserves: the number carries the data,
// colour carries the state.
import { strictNum } from './num.js'

/**
 * Where a value sits on its dial, as 0…1.
 *
 * Clamped at both ends deliberately. Telemetry overshoots its nominal maximum
 * — an engine bounces off the limiter, a car exceeds the top speed you assumed
 * — and an unclamped fraction would sweep the needle past the end of the arc
 * and render outside the gauge. Returns null for values that are not numbers,
 * so a missing sample shows an empty dial rather than a needle at zero.
 */
export function gaugeFraction(value, max) {
  const v = strictNum(value)
  const m = strictNum(max)
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return null
  return Math.min(1, Math.max(0, v / m))
}

/** Point on a circle, angle in degrees, 0° at the top, clockwise. */
export function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/**
 * SVG path for a gauge arc sweeping `fraction` of the way from `startDeg` to
 * `endDeg`.
 *
 * Returns null at fraction 0: a zero-length arc still paints a dot with round
 * line caps, which reads as a tiny reading rather than as none.
 */
export function arcPath(cx, cy, r, startDeg, endDeg, fraction) {
  const f = strictNum(fraction)
  if (!Number.isFinite(f) || f <= 0) return null
  const sweep = (endDeg - startDeg) * Math.min(1, Math.max(0, f))
  const a = polar(cx, cy, r, startDeg)
  const b = polar(cx, cy, r, startDeg + sweep)
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

/**
 * Gear as a driver reads it.
 *
 * LMU's Gear channel is 0 for neutral and 1..n for the gears; negatives are
 * reverse. A missing sample is an em dash, never "0" — showing neutral when we
 * simply do not know is a claim the data does not support.
 */
export function gearLabel(g) {
  const n = strictNum(g)
  if (!Number.isFinite(n)) return '—'
  if (n < 0) return 'R'
  if (n === 0) return 'N'
  return String(Math.round(n))
}

/**
 * Slip severity bands, as percentage difference between wheel and ground speed.
 *
 * Thresholds are deliberately generous: ingest already floors slip to 0 below
 * 20 km/h, and a few percent under power is normal rather than a fault. Calling
 * ordinary traction "high slip" would train a driver to ignore the indicator,
 * which is worse than not having one.
 */
export const SLIP_WARN = 5
export const SLIP_HIGH = 12

export function slipSeverity(pct) {
  const v = Math.abs(strictNum(pct))
  if (!Number.isFinite(v)) return 'unknown'
  if (v >= SLIP_HIGH) return 'high'
  if (v >= SLIP_WARN) return 'warn'
  return 'ok'
}

/**
 * Position of a G reading inside a cross plot, as -1…1 on each axis.
 *
 * `max` is the full-scale G the cross is drawn to. Clamped for the same reason
 * as the dial: a 2.4 G braking spike on a 2 G cross must sit on the edge, not
 * outside the box.
 */
export function gCrossPosition(lat, long, max = 2.5) {
  const m = strictNum(max)
  const clamp = (v) => {
    const n = strictNum(v)
    if (!Number.isFinite(n) || !Number.isFinite(m) || m <= 0) return null
    return Math.min(1, Math.max(-1, n / m))
  }
  const x = clamp(lat)
  const y = clamp(long)
  return x === null || y === null ? null : { x, y }
}
