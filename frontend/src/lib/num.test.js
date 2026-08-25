// Each rejected case here is a value Number() maps onto a finite 0. In a
// telemetry product that means rendering a measurement nobody recorded.
import { describe, it, expect } from 'vitest'
import { strictNum, isNum } from './num.js'

describe('strictNum rejects what Number() would fabricate', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['whitespace', '   '],
    ['false', false],
    ['true', true],
    ['empty array', []],
    ['object', {}],
  ])('%s -> NaN (Number() gives a finite value here)', (_label, input) => {
    expect(Number.isNaN(strictNum(input))).toBe(true)
    expect(isNum(input)).toBe(false)
  })
})

describe('strictNum keeps what is genuinely numeric', () => {
  it('passes numbers through, including zero and negatives', () => {
    expect(strictNum(0)).toBe(0)
    expect(strictNum(-2.38)).toBe(-2.38)
    expect(isNum(0)).toBe(true)
  })

  it('converts numeric strings — Postgres sends numerics over the wire as text', () => {
    expect(strictNum('135.475')).toBe(135.475)
    expect(strictNum(' 42 ')).toBe(42)
    expect(isNum('135.475')).toBe(true)
  })

  it('rejects non-numeric strings', () => {
    expect(Number.isNaN(strictNum('abc'))).toBe(true)
    expect(isNum('abc')).toBe(false)
  })

  it('rejects the infinities — finite or nothing', () => {
    expect(isNum(Infinity)).toBe(false)
    expect(isNum(-Infinity)).toBe(false)
    expect(isNum(NaN)).toBe(false)
  })
})
