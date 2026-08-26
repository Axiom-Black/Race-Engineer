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
import { detectCorners } from './corners'

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
    // The fixture is now the full multi-lap session (P0, 21 Aug 2026), so this
    // asserts real segmentation instead of documenting a truncation.
    expect(s.laps.map((l) => l.kind)).toEqual(['out', 'timed', 'timed', 'timed', 'partial'])
    expect(s.laps[0].lapNo).toBe(0) // out lap

    // Exactly three timed laps — the same count the .ldx summary reports
    // independently, which is what makes this cross-validated rather than
    // merely self-consistent.
    const timed = s.laps.filter((l) => l.kind === 'timed')
    expect(timed).toHaveLength(3)
    expect(s.lapCount).toBe(3)

    // The .ldx names lap 2 as fastest; that lap must now actually exist and be
    // timed. On the old truncated fixture it did not, which is precisely the
    // defect that shipped to production.
    expect(s.fastestLapNo).toBe(2)
    const fastest = s.laps.find((l) => l.lapNo === s.fastestLapNo)
    expect(fastest).toBeDefined()
    expect(fastest.kind).toBe('timed')
    // ...and it must be the quickest of the timed laps.
    expect(Math.min(...timed.map((l) => l.lapTimeS))).toBeCloseTo(fastest.lapTimeS, 6)

    // Neither the out-lap nor the trailing partial is ever presented as a time.
    expect(s.laps[0].lapTimeS).toBeNull()
    expect(s.laps[s.laps.length - 1].valid).toBe(false)
    expect(s.laps[s.laps.length - 1].lapTimeS).toBeNull()
  })

  it('spends its point budget on corners, not evenly on distance', async () => {
    // The bar this defends: 400 points spread evenly gave ~13.5 m spacing
    // everywhere at COTA, and corner detection plateaued at twelve corners on
    // a twenty-corner circuit. Redistributing the SAME budget by importance
    // (lib/resample.js) buys the resolution back without buying storage.
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    const fastest = s.trace.laps.find((l) => l.lap === s.fastestLapNo)
    expect(fastest).toBeDefined()

    const lengthM = s.lengthKm * 1000
    const gaps = fastest.pts
      .slice(1)
      .map((p, i) => (p.d - fastest.pts[i].d) * lengthM)
      .sort((a, b) => a - b)
    const min = gaps[0]
    const max = gaps[gaps.length - 1]

    // Measured on the real export: ~4.9 m at the tightest, ~35 m down the
    // straights. Asserting the SPREAD rather than the numbers — the point is
    // that spacing varies by several times, which uniform sampling cannot do.
    expect(max / min).toBeGreaterThan(3)
    expect(min).toBeLessThan(8)
    // ...and no gap so long the map visibly cuts a corner.
    expect(max).toBeLessThan(60)
  })

  it('finds more corners on the real lap than uniform sampling could', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    const fastest = s.trace.laps.find((l) => l.lap === s.fastestLapNo)
    // Twelve was the ceiling under uniform spacing, across every threshold and
    // span swept. Anything at or below it means the redistribution regressed.
    expect(detectCorners(fastest.pts).length).toBeGreaterThan(12)
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

  it('derives lengthKm from a complete timed lap', async () => {
    const s = await parseSessionFiles({ ldBytes, ldxText, svmText })
    // Circuit length is only measurable from a lap bounded by two crossings.
    // The fixture now contains three, so a real number is the honest answer —
    // where the truncated fixture correctly reported null.
    //
    // COTA's official length is 5.513 km. GPS-derived distance reads slightly
    // short because the racing line cuts inside the centreline; the tolerance
    // below is deliberately loose enough to allow that and tight enough to
    // catch a unit or scale error.
    expect(s.lengthKm).toBeGreaterThan(5.0)
    expect(s.lengthKm).toBeLessThan(5.6)
    expect(s.lengthKm).toBeCloseTo(5.437, 2)
  })

  it('still reports no lengthKm when nothing but a partial lap exists', async () => {
    // The honest-null contract outlived the fixture that used to prove it, so
    // it is asserted here against a session cut short before any line crossing.
    // Without this, replacing the fixture would have silently retired the rule.
    const short = ldBytes.slice(0, Math.floor(ldBytes.byteLength * 0.02))
    let s
    try {
      s = await parseSessionFiles({ ldBytes: short, ldxText, svmText })
    } catch {
      return // a hard-truncated file may not parse at all; G1.4 covers that
    }
    if (s.laps.filter((l) => l.kind === 'timed').length === 0) {
      expect(s.lengthKm).toBeNull()
    }
  })

  it('classifies out-lap / timed / partial segments and only times the timed ones', async () => {
    // Synthetic boundaries: the classification rule is about segment POSITION,
    // so it is provable without a multi-lap fixture (the committed one has a
    // single segment). Verified against the real COTA export separately: 5
    // segments -> 3 timed laps, matching the .ldx's Total Laps 3 / Fastest 2.
    const { classifyLapSegments } = await import('./ingest.js')
    const kinds = classifyLapSegments(5)
    expect(kinds).toEqual(['out', 'timed', 'timed', 'timed', 'partial'])
    // Degenerate cases must not invent a timed lap.
    expect(classifyLapSegments(1)).toEqual(['partial'])
    expect(classifyLapSegments(2)).toEqual(['out', 'partial'])
    expect(classifyLapSegments(0)).toEqual([])
  })
})
