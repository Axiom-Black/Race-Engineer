// S5 · Step 2 acceptance — the ingest module against the sanitized fixture.
// The decode itself is golden-tested in ../motec/golden.test.js; this suite
// asserts the INGEST contract: lap segmentation, the distance-resample
// invariants, summary correctness (cross-checked against the raw decode),
// honest empty-channel reporting, and dedup hashes.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ingest, DEFAULT_POINTS } from './session.js'
import { parseLd, decodeAll, lapBoundaries } from '../motec/ld.js'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../../../fixtures')
const ldBytes = new Uint8Array(readFileSync(join(FIXTURES, 'cota_gte_sanitized.ld')))
const ldxText = readFileSync(join(FIXTURES, 'cota_gte_sanitized.ldx'), 'utf-8')
const svmText = readFileSync(join(FIXTURES, 'cota_gte_sanitized.svm'), 'utf-8')

const result = await ingest(ldBytes, ldxText, svmText)

describe('lap segmentation', () => {
  it('lap count matches the .ld Lap Number boundaries', () => {
    const ld = parseLd(ldBytes)
    decodeAll(ldBytes, ld)
    const expected = lapBoundaries(ld).length
    expect(result.session.lapCount).toBe(expected)
    expect(result.laps.length).toBe(expected)
    expect(result.trace.laps.length).toBe(expected)
  })
})

describe('distance-resample invariants', () => {
  it('every lap has exactly DEFAULT_POINTS points', () => {
    for (const lap of result.trace.laps) {
      expect(lap.pts.length).toBe(DEFAULT_POINTS)
    }
  })

  it('d runs 0→1, monotonically non-decreasing', () => {
    for (const lap of result.trace.laps) {
      expect(lap.pts[0].d).toBe(0)
      expect(lap.pts[lap.pts.length - 1].d).toBe(1)
      for (let i = 1; i < lap.pts.length; i++) {
        expect(lap.pts[i].d).toBeGreaterThanOrEqual(lap.pts[i - 1].d)
      }
    }
  })

  it('normalized GPS coordinates stay within the unit box', () => {
    for (const lap of result.trace.laps) {
      for (const p of lap.pts) {
        if (p.x != null) {
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThanOrEqual(1)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeLessThanOrEqual(1)
        }
      }
    }
    expect(typeof result.trace.aspect).toBe('number')
  })

  it('honors a custom point count', async () => {
    const small = await ingest(ldBytes, ldxText, svmText, { points: 10 })
    expect(small.trace.laps[0].pts.length).toBe(10)
  })
})

describe('summary correctness', () => {
  it("a channel's summary min/max equals the raw decode over the same window", () => {
    const ld = parseLd(ldBytes)
    decodeAll(ldBytes, ld)
    // Single fixture lap spans the whole Lap Number clock, so the summary
    // window covers Ground Speed's full sample set.
    const gs = ld.channels['Ground Speed'].samples
    const rawMin = Math.min(...gs)
    const rawMax = Math.max(...gs)
    const s = result.laps[0].summary.channels['Ground Speed']
    expect(s.min).toBeCloseTo(rawMin, 3)
    expect(s.max).toBeCloseTo(rawMax, 3)
    expect(s.unit).toBe('km/h')
  })
})

describe('honest empty-channel reporting (standing bar)', () => {
  it('reports the known-empty GTE channels as empty, never fabricated', () => {
    const known = [
      'Tyre Load FL', 'Tyre Load FR', 'Tyre Load RL', 'Tyre Load RR',
      'Grip Fract FL', 'Grip Fract FR', 'Grip Fract RL', 'Grip Fract RR',
      'Battery Charge Level',
    ]
    for (const name of known) {
      expect(result.session.emptyChannels).toContain(name)
    }
    expect(result.session.knownEmptyForClass.sort()).toEqual(known.sort())
  })
})

describe('header + vehicle from .ld/.svm', () => {
  it('pulls car / class / ruleset from the .svm and scrubbed driver from the .ld', () => {
    expect(result.session.car).toBe('Ferrari 488 GTE EVO')
    expect(result.session.carClass).toBe('GTE')
    expect(result.session.ruleset).toBe('WEC2023')
    expect(result.session.driver).toBe('DRIVER_REDACTED')
    expect(result.session.energyScheme).toBe('fuel')
  })
})

describe('dedup hashes', () => {
  it('emits the SHA-256 of each raw file', () => {
    const expectLd = createHash('sha256').update(ldBytes).digest('hex')
    const expectLdx = createHash('sha256').update(ldxText).digest('hex')
    const expectSvm = createHash('sha256').update(svmText).digest('hex')
    expect(result.session.ldSha256).toBe(expectLd)
    expect(result.session.ldxSha256).toBe(expectLdx)
    expect(result.session.svmSha256).toBe(expectSvm)
    expect(result.session.ldSha256).toMatch(/^[0-9a-f]{64}$/)
  })
})
