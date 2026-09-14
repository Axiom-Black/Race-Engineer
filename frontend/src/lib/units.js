// ByteCraft Racing — imperial ↔ SI, at the display edge only.
//
// THE ONE RULE THAT MATTERS: STORED DATA IS ALWAYS CANONICAL SI.
//
// Nothing here runs at ingest. Converting on the way in would corrupt the
// archive — two sessions uploaded by drivers with different preferences would
// hold numerically incompatible values, every cross-session comparison
// (Progression, run averages, the delta trace) would silently mix systems, and
// a driver changing their mind would need a re-parse of everything they own.
// The same lesson as anchoring notes to distance rather than to corner numbers:
// **store the invariant, convert at the edge.**
//
// So a preference change is a re-render and nothing more. It cannot lose data
// and it cannot be got wrong retroactively.
//
// KEYED ON THE UNIT STRING, NOT ON THE QUANTITY'S NAME.
//
// Every decoded channel already carries its unit ('km/h', 'C', 'kPa', 'mm', …)
// straight from the `.ld` header. Converting by that string rather than by a
// per-field mapping means the 70-channel inventory converts for free, and any
// channel a future export adds converts too if its unit is known.
//
// **An unknown unit passes through untouched.** That is deliberate: a screen
// that converts some numbers and silently leaves others is worse than one that
// converts none, because the reader cannot tell which is which. Pass-through is
// visible (the unit label stays SI) where a wrong factor would not be.
import { strictNum } from './num.js'

export const SI = 'si'
export const IMPERIAL = 'imperial'
export const SYSTEMS = Object.freeze([SI, IMPERIAL])
export const DEFAULT_SYSTEM = SI

/**
 * Affine conversions from the canonical SI unit to imperial: `v * f + offset`.
 *
 * Temperature is why this is affine rather than a bare factor — °C → °F needs
 * the +32, and a factor-only table would have silently reported 0 °C as 0 °F.
 *
 * `dp` is the sensible display precision in the TARGET unit, which is not always
 * the source's: 245.98 km/h is 152.8 mph, and 5.513 km is 3.426 mi — a mile
 * needs more decimals than a kilometre to say the same thing.
 */
const TO_IMPERIAL = Object.freeze({
  'km/h': { unit: 'mph', f: 0.621371, offset: 0, dp: 1 },
  'm/s': { unit: 'ft/s', f: 3.28084, offset: 0, dp: 1 },
  km: { unit: 'mi', f: 0.621371, offset: 0, dp: 3 },
  m: { unit: 'ft', f: 3.28084, offset: 0, dp: 0 },
  mm: { unit: 'in', f: 0.0393701, offset: 0, dp: 2 },
  C: { unit: '°F', f: 1.8, offset: 32, dp: 0 },
  '°C': { unit: '°F', f: 1.8, offset: 32, dp: 0 },
  kPa: { unit: 'psi', f: 0.145038, offset: 0, dp: 1 },
  bar: { unit: 'psi', f: 14.5038, offset: 0, dp: 1 },
  N: { unit: 'lbf', f: 0.224809, offset: 0, dp: 0 },
  'N.m': { unit: 'lbf·ft', f: 0.737562, offset: 0, dp: 1 },
  Nm: { unit: 'lbf·ft', f: 0.737562, offset: 0, dp: 1 },
  l: { unit: 'gal', f: 0.264172, offset: 0, dp: 2 },
  L: { unit: 'gal', f: 0.264172, offset: 0, dp: 2 },
  kg: { unit: 'lb', f: 2.20462, offset: 0, dp: 1 },
})

/**
 * Display precision for units that do NOT convert, so a caller can format
 * consistently without special-casing.
 *
 * `%`, `G`, `rpm`, `s`, `deg` and `rad/s` are the same number in both systems —
 * a percentage is a ratio, a G is a ratio, and an angle is an angle.
 */
const SI_DP = Object.freeze({
  'km/h': 1, 'm/s': 1, km: 3, m: 0, mm: 1,
  C: 0, '°C': 0, kPa: 1, bar: 2, N: 0, 'N.m': 1, Nm: 1,
  l: 2, L: 2, kg: 1,
  '%': 1, G: 2, rpm: 0, s: 3, deg: 1, 'rad/s': 1,
})

/** Is this unit affected by the imperial/SI choice at all? */
export function isConvertible(unit) {
  return Object.prototype.hasOwnProperty.call(TO_IMPERIAL, unit)
}

/** Every SI unit this module knows how to convert — for tests and tooling. */
export function convertibleUnits() {
  return Object.keys(TO_IMPERIAL)
}

/**
 * Convert a canonical-SI value for display.
 *
 * @param {number|string|null} value  canonical SI (Postgres sends numerics as text)
 * @param {string} unit               the canonical SI unit, as stored
 * @param {string} system             SI or IMPERIAL
 * @returns {{value: number|null, unit: string, dp: number, converted: boolean}}
 *   `value` is null when the input is not a usable number — the caller renders
 *   its own dash rather than being handed a fabricated 0.
 */
export function convert(value, unit, system = DEFAULT_SYSTEM) {
  const n = strictNum(value)
  const usable = Number.isFinite(n)
  const spec = system === IMPERIAL ? TO_IMPERIAL[unit] : undefined

  if (!spec) {
    return {
      value: usable ? n : null,
      unit: unit ?? '',
      dp: SI_DP[unit] ?? 2,
      converted: false,
    }
  }
  return {
    value: usable ? n * spec.f + spec.offset : null,
    unit: spec.unit,
    dp: spec.dp,
    converted: true,
  }
}

/**
 * Convert and format in one call: `{ text, unit }`.
 *
 * `dp` overrides the unit's default precision. The value and the unit come back
 * separately because most of this UI styles them differently — and because a
 * caller that wants "—" for a missing value should not have to parse a string
 * to discover it is missing.
 */
export function format(value, unit, system = DEFAULT_SYSTEM, dp) {
  const c = convert(value, unit, system)
  const places = Number.isFinite(strictNum(dp)) ? Number(dp) : c.dp
  return {
    text: c.value === null ? '—' : c.value.toFixed(places),
    unit: c.unit,
    converted: c.converted,
    missing: c.value === null,
  }
}

/** Normalise anything to a valid system, defaulting rather than throwing. */
export function coerceSystem(raw) {
  return SYSTEMS.includes(raw) ? raw : DEFAULT_SYSTEM
}

/** The label a toggle shows for a system. */
export function systemLabel(system) {
  return coerceSystem(system) === IMPERIAL ? 'Imperial' : 'Metric'
}
