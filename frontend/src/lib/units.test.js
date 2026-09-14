import { describe, it, expect } from 'vitest'
import {
  SI, IMPERIAL, SYSTEMS, DEFAULT_SYSTEM,
  convert, format, isConvertible, convertibleUnits, coerceSystem, systemLabel,
} from './units.js'

describe('convert', () => {
  it('leaves SI alone — the stored value IS the SI value', () => {
    // Canonical storage is SI, so the SI path must be an identity. Anything else
    // means a round-trip through the display layer could alter a number.
    expect(convert(245.98, 'km/h', SI)).toMatchObject({ value: 245.98, unit: 'km/h', converted: false })
    expect(convert(-2.38, 'G', SI).value).toBe(-2.38)
  })

  it('converts speed, distance, pressure and volume', () => {
    expect(convert(100, 'km/h', IMPERIAL).value).toBeCloseTo(62.1371, 4)
    expect(convert(5.513, 'km', IMPERIAL).value).toBeCloseTo(3.4256, 3)
    expect(convert(100, 'kPa', IMPERIAL).value).toBeCloseTo(14.5038, 4)
    expect(convert(50, 'l', IMPERIAL).value).toBeCloseTo(13.2086, 3)
  })

  it('handles TEMPERATURE, which needs an offset and not just a factor', () => {
    // The reason the table is affine. A factor-only conversion reports 0 °C as
    // 0 °F, which is wrong by 32 degrees and looks entirely plausible.
    expect(convert(0, 'C', IMPERIAL).value).toBeCloseTo(32, 6)
    expect(convert(100, 'C', IMPERIAL).value).toBeCloseTo(212, 6)
    expect(convert(29, 'C', IMPERIAL).value).toBeCloseTo(84.2, 6)
    expect(convert(-40, 'C', IMPERIAL).value).toBeCloseTo(-40, 6)
  })

  it('PASSES AN UNKNOWN UNIT THROUGH, in SI, rather than guessing', () => {
    // A screen that converts some numbers and silently leaves others is worse
    // than one that converts none: the reader cannot tell which is which.
    // Pass-through is visible in the unit label; a wrong factor would not be.
    const r = convert(7, 'furlongs/fortnight', IMPERIAL)
    expect(r).toMatchObject({ value: 7, unit: 'furlongs/fortnight', converted: false })
  })

  it('does not convert ratios or angles, which are the same in both systems', () => {
    for (const unit of ['%', 'G', 'rpm', 's', 'deg', 'rad/s']) {
      expect(convert(42, unit, IMPERIAL)).toMatchObject({ value: 42, converted: false })
    }
  })

  it('returns null for an unusable value instead of a fabricated zero', () => {
    // Number(null) is 0, which in a telemetry product is a measurement nobody
    // recorded. lib/num.js exists for this and the display layer honours it.
    for (const bad of [null, undefined, '', [], {}, false, NaN, 'abc']) {
      expect(convert(bad, 'km/h', IMPERIAL).value).toBeNull()
      expect(convert(bad, 'km/h', SI).value).toBeNull()
    }
  })

  it('accepts a numeric string, because Postgres sends numerics as text', () => {
    expect(convert('100', 'km/h', IMPERIAL).value).toBeCloseTo(62.1371, 4)
  })

  it('gives a target unit its own sensible precision', () => {
    // A mile needs more decimals than a kilometre to say the same thing.
    expect(convert(5.513, 'km', IMPERIAL).dp).toBeGreaterThan(convert(100, 'km/h', IMPERIAL).dp)
  })

  it('defaults to SI when the system is nonsense', () => {
    expect(convert(100, 'km/h', 'klingon').value).toBe(100)
    expect(convert(100, 'km/h', undefined).value).toBe(100)
  })
})

describe('format', () => {
  it('separates the number from the unit, so the UI can style them apart', () => {
    expect(format(245.98, 'km/h', IMPERIAL)).toMatchObject({ text: '152.8', unit: 'mph' })
    expect(format(245.98, 'km/h', SI)).toMatchObject({ text: '246.0', unit: 'km/h' })
  })

  it('reports a missing value as a flag, not just as a dash to parse', () => {
    const r = format(null, 'km/h', SI)
    expect(r.text).toBe('—')
    expect(r.missing).toBe(true)
  })

  it('honours an explicit precision over the unit default', () => {
    expect(format(245.98, 'km/h', SI, 0).text).toBe('246')
    expect(format(245.98, 'km/h', SI, 3).text).toBe('245.980')
  })
})

describe('the unit table', () => {
  it('covers every unit the fixture actually carries that has an imperial form', () => {
    // From golden_master_ld.json: C, %, rad/s, mm, kPa, N, s, km/h, deg, G,
    // rpm, l, N.m. The convertible ones must all be known, or a real channel
    // silently stays metric while its neighbours change.
    for (const unit of ['C', 'mm', 'kPa', 'N', 'km/h', 'l', 'N.m']) {
      expect(isConvertible(unit)).toBe(true)
    }
  })

  it('does not claim to convert the dimensionless ones', () => {
    for (const unit of ['%', 'G', 'rpm', 's', 'deg', 'rad/s', '']) {
      expect(isConvertible(unit)).toBe(false)
    }
  })

  it('every entry produces a finite number and a non-empty target unit', () => {
    for (const unit of convertibleUnits()) {
      const r = convert(1, unit, IMPERIAL)
      expect(Number.isFinite(r.value)).toBe(true)
      expect(r.unit).toBeTruthy()
      expect(r.unit).not.toBe(unit)
      expect(Number.isInteger(r.dp)).toBe(true)
    }
  })
})

describe('coerceSystem', () => {
  it('accepts the real systems and defaults everything else', () => {
    expect(coerceSystem(SI)).toBe(SI)
    expect(coerceSystem(IMPERIAL)).toBe(IMPERIAL)
    for (const bad of [null, undefined, '', 'metric', 42, {}]) {
      expect(coerceSystem(bad)).toBe(DEFAULT_SYSTEM)
    }
  })

  it('defaults to SI, because the stored data is SI', () => {
    expect(DEFAULT_SYSTEM).toBe(SI)
    expect(SYSTEMS).toEqual([SI, IMPERIAL])
  })
})

describe('systemLabel', () => {
  it('names the system in a driver\'s words, not the code\'s', () => {
    expect(systemLabel(IMPERIAL)).toBe('Imperial')
    expect(systemLabel(SI)).toBe('Metric')
    expect(systemLabel('nonsense')).toBe('Metric')
  })
})
