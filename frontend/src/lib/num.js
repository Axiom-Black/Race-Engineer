// ByteCraft Racing — numeric coercion that refuses to invent a measurement.
//
// WHY THIS MODULE EXISTS. JavaScript's Number() maps several "no value" inputs
// onto a perfectly finite zero:
//
//     Number(null)  === 0
//     Number('')    === 0
//     Number([])    === 0
//     Number(false) === 0
//
// In a telemetry product that is not a quirk, it is a correctness bug with a
// specific shape: a channel whose minimum came back null renders as
// "0.00 … 245.98", showing a floor that was never recorded. A driver reads a
// measurement where there is none.
//
// This was written after the same mistake was caught twice in one afternoon
// (25 Aug 2026) — once in channels.formatRange, once in sessionCompare.delta —
// both times by a test, neither time by review. Fixing the class rather than
// the instance is what stops a third.
//
// Postgres numerics arrive over the wire as strings ("135.475"), so a numeric
// string must still convert. Only genuinely absent values are rejected.

/**
 * Number(), minus the coercions that fabricate a value.
 * Returns NaN for null, undefined, empty/whitespace strings, booleans, arrays
 * and objects — everything whose numeric reading would be an invention.
 */
export function strictNum(v) {
  if (v === null || v === undefined) return NaN
  if (typeof v === 'boolean') return NaN
  if (typeof v === 'string' && v.trim() === '') return NaN
  if (typeof v === 'object') return NaN
  return Number(v)
}

/** True when `v` is a real, finite number (or a numeric string, as Postgres sends). */
export function isNum(v) {
  return Number.isFinite(strictNum(v))
}
