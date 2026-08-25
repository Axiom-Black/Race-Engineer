// Dial geometry is impossible to eyeball — an arc 3° short at full scale looks
// fine and is wrong — so it is tested rather than reviewed.
import { describe, it, expect } from 'vitest'
import {
  gaugeFraction, polar, arcPath, gearLabel, slipSeverity,
  gCrossPosition, advanceCursor, SLIP_WARN, SLIP_HIGH,
} from './gauges.js'

describe('gaugeFraction', () => {
  it('maps a value onto 0…1', () => {
    expect(gaugeFraction(130, 260)).toBe(0.5)
    expect(gaugeFraction(0, 260)).toBe(0)
  })

  it('CLAMPS an overshoot instead of sweeping past the arc', () => {
    // Engines bounce off the limiter; cars beat the top speed you assumed.
    expect(gaugeFraction(8400, 8000)).toBe(1)
    expect(gaugeFraction(-50, 260)).toBe(0)
  })

  it('returns null for a missing sample — an empty dial, not a needle at zero', () => {
    expect(gaugeFraction(null, 260)).toBeNull()
    expect(gaugeFraction(undefined, 260)).toBeNull()
    expect(gaugeFraction(130, 0)).toBeNull()
  })
})

describe('polar', () => {
  it('puts 0° at the top and runs clockwise', () => {
    const top = polar(50, 50, 40, 0)
    expect(top.x).toBeCloseTo(50, 6)
    expect(top.y).toBeCloseTo(10, 6)
    const right = polar(50, 50, 40, 90)
    expect(right.x).toBeCloseTo(90, 6)
    expect(right.y).toBeCloseTo(50, 6)
  })
})

describe('arcPath', () => {
  it('draws from the start angle and sweeps proportionally', () => {
    const d = arcPath(50, 50, 40, -135, 135, 0.5)
    expect(d).toMatch(/^M /)
    expect(d).toContain('A 40 40')
    // Half of a 270° sweep from -135° lands at 0° — the top of the dial.
    expect(d).toMatch(/50\.00 10\.00$/)
  })

  it('sets the large-arc flag past 180°', () => {
    expect(arcPath(50, 50, 40, -135, 135, 1)).toMatch(/A 40 40 0 1 1/)
    expect(arcPath(50, 50, 40, -135, 135, 0.5)).toMatch(/A 40 40 0 0 1/)
  })

  it('returns null at zero rather than painting a dot', () => {
    // A zero-length arc with round caps reads as a small reading, not as none.
    expect(arcPath(50, 50, 40, -135, 135, 0)).toBeNull()
    expect(arcPath(50, 50, 40, -135, 135, null)).toBeNull()
  })
})

describe('gearLabel', () => {
  it('names neutral and reverse rather than printing their codes', () => {
    expect(gearLabel(0)).toBe('N')
    expect(gearLabel(-1)).toBe('R')
  })
  it('prints the gear number', () => {
    expect(gearLabel(5)).toBe('5')
    expect(gearLabel('3')).toBe('3')
  })
  it('shows a dash, NOT neutral, when the sample is missing', () => {
    // "N" would claim the car was in neutral; we simply do not know.
    expect(gearLabel(null)).toBe('—')
    expect(gearLabel(undefined)).toBe('—')
  })
})

describe('slipSeverity', () => {
  it('treats ordinary traction as fine', () => {
    expect(slipSeverity(0)).toBe('ok')
    expect(slipSeverity(SLIP_WARN - 0.1)).toBe('ok')
  })
  it('escalates at the thresholds', () => {
    expect(slipSeverity(SLIP_WARN)).toBe('warn')
    expect(slipSeverity(SLIP_HIGH)).toBe('high')
  })
  it('is symmetric — locking a wheel matters as much as spinning it', () => {
    expect(slipSeverity(-SLIP_HIGH)).toBe('high')
  })
  it('reports unknown rather than ok for a missing reading', () => {
    expect(slipSeverity(null)).toBe('unknown')
  })
})

describe('gCrossPosition', () => {
  it('maps G onto -1…1 per axis', () => {
    expect(gCrossPosition(1.25, -2.5, 2.5)).toEqual({ x: 0.5, y: -1 })
  })
  it('clamps a spike to the edge of the box', () => {
    expect(gCrossPosition(4, -4, 2.5)).toEqual({ x: 1, y: -1 })
  })
  it('returns null when either axis is missing', () => {
    expect(gCrossPosition(null, 1)).toBeNull()
    expect(gCrossPosition(1, undefined)).toBeNull()
  })
})

describe('advanceCursor', () => {
  it('advances proportionally to elapsed time and rate', () => {
    // 400 points over 100 s = 4 points/s; half a second at 2x = 4 points.
    expect(advanceCursor(0, 400, 0.5, 100, 2)).toBeCloseTo(4, 6)
  })

  it('WRAPS to the start rather than stopping at the end', () => {
    // Halting on the last sample forces a re-scrub to watch it again.
    expect(advanceCursor(399, 400, 1, 100, 1)).toBe(0)
  })

  it('holds position when there is nothing to replay', () => {
    expect(advanceCursor(7, 1, 1, 100)).toBe(7)
    expect(advanceCursor(7, 400, 1, null)).toBe(7)
    expect(advanceCursor(7, 400, 1, 0)).toBe(7)
  })
})
