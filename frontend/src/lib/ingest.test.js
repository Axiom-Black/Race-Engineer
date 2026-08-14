// S5 back half — ingest pipeline vs the committed fixture. Not a golden-master
// gate (that's Ring 4, scoped to the raw parsers); this checks the ingest
// layer built on top of them: session metadata, lap segmentation, the
// per-channel summary that carries reliable/allZero flags into persistence,
// and the distance-resampled trace blob (docs/s5-implementation-plan.md's
// frozen data contract).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSessionFiles } from './ingest'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures')
const ldBytes = new Uint8Array(readFileSync(join(FIXTURES, 'cota_gte_sanitized.ld')));
const ldxText = readFileSync(join(FIXTURES, 'cota_gte_sanitized.ldx'), 'utf-8');
const svmText = readFileSync(join(FIXTURES, 'cota_gte_sanitized.svm'), 'utf-8');

describe('parseSessionFiles', () => {
  it('extracts session identity from the .ld header and .svm vehicle class', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    expect(s.venue).toBe('Circuit of the Americas')
    expect(s.driver).toBe('DRIVER_REDACTED')
    expect(s.car).toBe('Ferrari_488_GTE_EVO')
    expect(s.carClass).toBe('GTE')
    expect(s.ruleset).toBe('WEC2023')
    expect(s.energyScheme).toBe('fuel') // GTE carries fuel, not virtual energy
  })

  it('parses the .ld header date+time into an ISO recordedAt', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    expect(s.recordedAt).toBe('2026-06-30T19:32:27.000Z')
  })

  it('hashes all three raw files deterministically (dedup + integrity keys)', async () => {
    const a = await parseSessionFiles({ ldBytes, ldxText, svmText })
    const b = await parseSessionFiles({ ldBytes, ldxText, svmText })
    expect(a.ldSha256).toBe(b.ldSha256)
    expect(a.ldxSha256).toBe(b.ldxSha256)
    expect(a.svmSha256).toBe(b.svmSha256)
    for (const h of [a.ldSha256, a.ldxSha256, a.svmSha256]) expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('segments laps from the .ld Lap Number channel, not the .ldx', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    expect(s.laps.length).toBeGreaterThan(0)
    expect(s.laps[0].lapNo).toBe(0) // out lap
    // The fixture is truncated for CI (FIXTURE_NOTES.md); the .ld's Lap
    // Number channel never reaches lap 2 even though the .ldx SUMMARY (from
    // the full session) reports fastestLapNo: 2 — confirmed against
    // fixtures/golden_master_ld.json's lap_boundaries (lap 0 only).
    expect(s.fastestLapNo).toBe(2)
    expect(s.laps.every((l) => l.lapNo !== s.fastestLapNo)).toBe(true)
    // the last (only) lap has no following boundary -> not a valid timed lap
    expect(s.laps[s.laps.length - 1].valid).toBe(false)
    expect(s.laps[s.laps.length - 1].lapTimeS).toBeNull()
  })

  it('resamples each lap to ~400 points ALONG TRACK DISTANCE, not time', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    for (const lapTrace of s.trace.laps) {
      expect(lapTrace.pts.length).toBeGreaterThan(0)
      expect(lapTrace.pts.length).toBeLessThanOrEqual(400)
      // d is the normalized-distance resample axis: monotonically 0 -> 1.
      const ds = lapTrace.pts.map((p) => p.d)
      expect(ds[0]).toBe(0)
      expect(ds[ds.length - 1]).toBeCloseTo(1, 3)
      for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThanOrEqual(ds[i - 1])
      const p0 = lapTrace.pts[0]
      expect(typeof p0.s).toBe('number') // Ground Speed
      expect(typeof p0.t).toBe('number') // Throttle Pos — CAL-badge fixed in S3
      expect(Array.isArray(p0.sl)).toBe(true)
      expect(p0.sl.length).toBe(4) // FL/FR/RL/RR wheel slip
    }
  })

  it('normalizes GPS x/y against one SESSION-WIDE bounding box across all laps', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    for (const lapTrace of s.trace.laps) {
      for (const p of lapTrace.pts) {
        if (p.x == null) continue
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(1)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(1)
      }
    }
    expect(s.trace.aspect).toBeGreaterThan(0)
  })

  it('carries reliable/allZero flags into the session-level channel summary (standing bar)', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    const byName = Object.fromEntries(s.summary.channels.map((c) => [c.name, c]))
    expect(byName['Ambient Temperature'].reliable).toBe(true) // reclassified 10 Aug
    expect(byName['Tyre Load FL'].allZero).toBe(true)
    expect(s.summary.channels.length).toBe(70)
  })

  it('carries the same flags into each lap-level summary too', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    const lap0 = s.laps[0]
    expect(lap0.summary.emptyChannels).toContain('Tyre Load FL')
    expect(lap0.summary.unreliableChannels).not.toContain('Ambient Temperature')
    expect(lap0.summary.channels['Ground Speed']).toHaveProperty('avg')
  })

  it('now decodes the previously CAL-badged channels via the full formula', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    const throttle = s.summary.channels.find((c) => c.name === 'Throttle Pos')
    expect(throttle.min).toBeGreaterThanOrEqual(0)
    expect(throttle.max).toBeLessThanOrEqual(100.01)
  })

  it('setup carries .ldx as primary and flags truncated keys for the .svm fallback', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    expect(s.setup.truncatedKeys).toContain('BrakePressure')
    expect(s.setup.svmSections.CONTROLS.BrakePressureSetting.value).toBe('68 kgf  (85%)')
  })

  it('computes a plausible lengthKm from the integrated Ground Speed distance', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    // Truncated fixture, not a full lap -- just check it's a small positive
    // number, not that it matches COTA's real ~5.5 km lap length.
    expect(s.lengthKm).toBeGreaterThan(0)
    expect(s.lengthKm).toBeLessThan(10)
  })
})
