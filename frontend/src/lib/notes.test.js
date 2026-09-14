import { describe, it, expect } from 'vitest'
import {
  ANCHOR_BUCKETS, GROUP_TOLERANCE, MAX_NOTE_CHARS, WHOLE_LAP,
  trackKey, normaliseAnchor, anchorKey,
  anchorFromCorner, anchorFromDistance,
  conditionsFrom, conditionLabel, normaliseBody,
  buildNoteRow, isOrphaned, groupByProximity, pickForSession, attachToCorners,
  isAtDistance, stacksForLap, stacksAtDistance,
} from './notes.js'

// A session shaped the way Postgres returns one, with the channel summary
// ingest actually writes.
const SESSION = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  venue: 'Circuit of the Americas',
  car: 'Ferrari 499P',
  car_class: 'Hypercar',
  recorded_at: '2026-08-20T14:00:00Z',
  summary: {
    channels: [
      { name: 'Ambient Temperature', min: 29, max: 30 },
      { name: 'Track Temperature', min: 38, max: 40 },
      { name: 'Ground Speed', min: 0, max: 245.98 },
    ],
  },
}

function note(over = {}) {
  return {
    id: 'n1', d_start: 0.12, d_end: 0.135, body: 'brake later',
    car: 'Ferrari 499P', ambient_c: 29.5, session_key: 's1',
    source_session_id: 's1', session_recorded_at: '2026-08-20T14:00:00Z',
    ...over,
  }
}

describe('trackKey', () => {
  it('folds case and whitespace so one venue is one track', () => {
    expect(trackKey('Circuit of the Americas')).toBe('circuit of the americas')
    expect(trackKey('  Monza  ')).toBe('monza')
    expect(trackKey('Paul   Ricard')).toBe('paul ricard')
  })

  it('KEEPS LAYOUT SUFFIXES DISTINCT — they are different tracks', () => {
    // A distance fraction means a different place on each layout. Folding
    // Silverstone GP into Silverstone National would put a note about Stowe
    // somewhere in the middle of nothing.
    expect(trackKey('Silverstone GP')).not.toBe(trackKey('Silverstone National'))
    expect(trackKey('Bahrain Endurance')).not.toBe(trackKey('Bahrain International Circuit'))
  })

  it('returns null rather than an empty key', () => {
    for (const bad of [null, undefined, '', '   ', 42, {}]) expect(trackKey(bad)).toBeNull()
  })
})

describe('normaliseAnchor', () => {
  it('orders a reversed span instead of rejecting it', () => {
    expect(normaliseAnchor({ dStart: 0.6, dEnd: 0.2 })).toEqual({ dStart: 0.2, dEnd: 0.6 })
  })

  it('clamps to the lap — a fraction cannot leave [0, 1]', () => {
    expect(normaliseAnchor({ dStart: -0.3, dEnd: 1.9 })).toEqual({ dStart: 0, dEnd: 1 })
  })

  it('treats one given end as a POINT rather than inventing a width', () => {
    expect(normaliseAnchor({ dStart: 0.4 })).toEqual({ dStart: 0.4, dEnd: 0.4 })
    expect(normaliseAnchor({ dEnd: 0.4 })).toEqual({ dStart: 0.4, dEnd: 0.4 })
  })

  it('returns null when there is no usable place at all', () => {
    // Not { 0, 0 }: silently anchoring a note to the start/finish line would be
    // a fabricated location, and it would then group with real notes there.
    for (const bad of [null, undefined, {}, { dStart: 'abc' }, { dStart: NaN }]) {
      expect(normaliseAnchor(bad)).toBeNull()
    }
  })
})

describe('anchorKey', () => {
  it('sorts lexically in lap order, so `order by anchor_key` walks the lap', () => {
    const keys = [0.9, 0.05, 0.5, 0.0].map((d) => anchorKey({ dStart: d, dEnd: d }))
    expect([...keys].sort()).toEqual([
      anchorKey({ dStart: 0, dEnd: 0 }),
      anchorKey({ dStart: 0.05, dEnd: 0.05 }),
      anchorKey({ dStart: 0.5, dEnd: 0.5 }),
      anchorKey({ dStart: 0.9, dEnd: 0.9 }),
    ])
  })

  it('GIVES THE SAME CORNER THE SAME KEY A WEEK LATER', () => {
    // This is the assertion that makes accumulation work. The detector places
    // an apex a few metres differently every lap; ~4 m at COTA is 0.0007 of a
    // lap, far inside one 0.005 bucket.
    const first = anchorKey({ dStart: 0.1200, dEnd: 0.1350 })
    const later = anchorKey({ dStart: 0.1207, dEnd: 0.1358 })
    expect(later).toBe(first)
  })

  it('separates two genuinely different corners', () => {
    expect(anchorKey({ dStart: 0.12, dEnd: 0.13 })).not.toBe(anchorKey({ dStart: 0.30, dEnd: 0.31 }))
  })

  it('never runs off the end at d = 1', () => {
    // floor(1 * 200) would be bucket 200, one past the last.
    expect(anchorKey({ dStart: 1, dEnd: 1 })).toBe(`d${String(ANCHOR_BUCKETS - 1).padStart(4, '0')}`)
  })

  it('is null when there is no anchor', () => {
    expect(anchorKey(null)).toBeNull()
  })
})

describe('anchorFromCorner', () => {
  it('uses the corner span when the corner has one', () => {
    expect(anchorFromCorner({ n: 5, dStart: 0.12, d: 0.128, dEnd: 0.135 }))
      .toEqual({ dStart: 0.12, dEnd: 0.135 })
  })

  it('falls back to the apex for a pre-25-Aug corner with no span', () => {
    expect(anchorFromCorner({ n: 5, d: 0.128 })).toEqual({ dStart: 0.128, dEnd: 0.128 })
  })

  it('DOES NOT anchor on the corner NUMBER', () => {
    // Numbering is ours and derived; the detector moved COTA 12 → 15 → 20 in
    // three days. Two corners numbered 5 at different places must not collide,
    // and the same place numbered differently must still match.
    const a = anchorFromCorner({ n: 5, dStart: 0.12, dEnd: 0.135 })
    const b = anchorFromCorner({ n: 9, dStart: 0.12, dEnd: 0.135 })
    expect(anchorKey(a)).toBe(anchorKey(b))
    const far = anchorFromCorner({ n: 5, dStart: 0.72, dEnd: 0.735 })
    expect(anchorKey(far)).not.toBe(anchorKey(a))
  })

  it('is null for a corner with no position', () => {
    expect(anchorFromCorner({ n: 5 })).toBeNull()
    expect(anchorFromCorner(null)).toBeNull()
  })
})

describe('anchorFromDistance', () => {
  it('makes a point note on a straight', () => {
    expect(anchorFromDistance(0.45)).toEqual({ dStart: 0.45, dEnd: 0.45 })
  })

  it('widens symmetrically and stays inside the lap', () => {
    const w = anchorFromDistance(0.45, 0.02)
    expect(w.dStart).toBeCloseTo(0.43, 9)
    expect(w.dEnd).toBeCloseTo(0.47, 9)
    // Clamped, not merely arithmetic — a note near the finish line must not
    // anchor past the end of the lap.
    expect(anchorFromDistance(0.99, 0.05)).toEqual({ dStart: 0.94, dEnd: 1 })
  })
})

describe('conditionsFrom', () => {
  it('takes the MEAN of the observed range, not an endpoint', () => {
    // Ambient drifts a degree or two over a session; either endpoint alone
    // misreports it, and the fixture's 29–30 is exactly that case.
    expect(conditionsFrom(SESSION)).toEqual({ ambientC: 29.5, trackC: 39 })
  })

  it('reads a keyed channel map as well as an array', () => {
    const keyed = { summary: { channels: { 'Ambient Temperature': { min: 10, max: 12 } } } }
    expect(conditionsFrom(keyed)).toEqual({ ambientC: 11, trackC: null })
  })

  it('reports null rather than 0 for a channel the export lacks', () => {
    expect(conditionsFrom({ summary: { channels: [] } })).toEqual({ ambientC: null, trackC: null })
    expect(conditionsFrom(null)).toEqual({ ambientC: null, trackC: null })
  })

  it('does not invent wetness or time of day', () => {
    // There is no such channel in the 70 we decode. A `wet: false` that was
    // always false would be worse than an absent field, because it would be
    // read as a measurement.
    expect(Object.keys(conditionsFrom(SESSION))).toEqual(['ambientC', 'trackC'])
  })
})

describe('conditionLabel', () => {
  it('names the car and the temperatures it knows', () => {
    expect(conditionLabel({ car: 'Ferrari 499P', ambientC: 29.5, trackC: 39 }))
      .toBe('Ferrari 499P · 30°C air · 39°C track')
  })

  it('SAYS ONLY WHAT IT KNOWS — no dashes for missing facts', () => {
    expect(conditionLabel({ car: 'Oreca 07 Gibson' })).toBe('Oreca 07 Gibson')
    expect(conditionLabel({ ambientC: 14 })).toBe('14°C air')
    expect(conditionLabel({})).toBe('')
    expect(conditionLabel()).toBe('')
  })
})

describe('normaliseBody', () => {
  it('trims, and rejects a note with no content', () => {
    expect(normaliseBody('  brake later  ')).toBe('brake later')
    for (const bad of [null, undefined, '', '   ', '\n\t', 42]) {
      expect(normaliseBody(bad)).toBeNull()
    }
  })

  it('caps length at the same number the DB constraint uses', () => {
    expect(normaliseBody('x'.repeat(MAX_NOTE_CHARS + 500))).toHaveLength(MAX_NOTE_CHARS)
  })
})

describe('buildNoteRow', () => {
  const anchor = { dStart: 0.12, dEnd: 0.135 }

  it('COPIES the session identity onto the note, rather than referencing it', () => {
    // The denormalisation IS the feature: the note has to stay readable after
    // the session row is gone, and "which car, in what conditions" is what
    // makes one note about T5 distinguishable from another.
    const row = buildNoteRow({ userId: 'u1', session: SESSION, anchor, body: 'brake later', cornerLabel: 'T5' })
    expect(row).toMatchObject({
      user_id: 'u1',
      track_key: 'circuit of the americas',
      track_label: 'Circuit of the Americas',
      d_start: 0.12,
      d_end: 0.135,
      corner_label: 'T5',
      body: 'brake later',
      car: 'Ferrari 499P',
      car_class: 'Hypercar',
      ambient_c: 29.5,
      track_c: 39,
      session_recorded_at: '2026-08-20T14:00:00Z',
    })
  })

  it('writes session_key AS TEXT alongside the foreign key', () => {
    // The FK is nulled when the session is deleted. Because SQL NULLs compare
    // as distinct, a unique key on the FK would stop enforcing revision at that
    // moment. session_key is written once and never nulled.
    const row = buildNoteRow({ userId: 'u1', session: SESSION, anchor, body: 'x' })
    expect(row.source_session_id).toBe(SESSION.id)
    expect(row.session_key).toBe(SESSION.id)
    expect(typeof row.session_key).toBe('string')
  })

  it('anchors the WHOLE LAP when no place is given, rather than the start line', () => {
    const row = buildNoteRow({ userId: 'u1', session: SESSION, anchor: null, body: 'car felt loose' })
    expect(row.d_start).toBe(WHOLE_LAP.dStart)
    expect(row.d_end).toBe(WHOLE_LAP.dEnd)
  })

  it('refuses to build a row that the DB would reject anyway', () => {
    expect(buildNoteRow({ userId: 'u1', session: SESSION, anchor, body: '   ' })).toBeNull()
    expect(buildNoteRow({ userId: null, session: SESSION, anchor, body: 'x' })).toBeNull()
    expect(buildNoteRow({ userId: 'u1', session: { id: 'x' }, anchor, body: 'x' })).toBeNull()
    expect(buildNoteRow({ userId: 'u1', session: { venue: 'Monza' }, anchor, body: 'x' })).toBeNull()
  })

  it('accepts camelCase from a freshly parsed session as well as snake_case from Postgres', () => {
    const parsed = { id: 's9', venue: 'Monza', car: 'Porsche 963', carClass: 'Hypercar', recordedAt: '2026-08-21T09:00:00Z' }
    const row = buildNoteRow({ userId: 'u1', session: parsed, anchor, body: 'x' })
    expect(row).toMatchObject({ car_class: 'Hypercar', session_recorded_at: '2026-08-21T09:00:00Z' })
  })
})

describe('isOrphaned', () => {
  it('is the provenance signal — the session is gone but the note is not', () => {
    expect(isOrphaned(note({ source_session_id: null }))).toBe(true)
    expect(isOrphaned(note())).toBe(false)
  })
})

describe('groupByProximity', () => {
  it('stacks notes about one corner from DIFFERENT sessions together', () => {
    const g = groupByProximity([
      note({ id: 'a', d_start: 0.120, d_end: 0.135 }),
      note({ id: 'b', d_start: 0.122, d_end: 0.137 }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].notes.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('STACKS ACROSS A QUANTISATION BOUNDARY, which the DB key cannot', () => {
    // The reason display grouping is by proximity and not by anchor_key: two
    // notes about one corner can straddle a bucket edge. 0.1249 and 0.1251 fall
    // in buckets 24 and 25 — different keys, same corner.
    const a = note({ id: 'a', d_start: 0.1249, d_end: 0.1249 })
    const b = note({ id: 'b', d_start: 0.1251, d_end: 0.1251 })
    expect(anchorKey({ dStart: 0.1249, dEnd: 0.1249 }))
      .not.toBe(anchorKey({ dStart: 0.1251, dEnd: 0.1251 }))
    expect(groupByProximity([a, b])).toHaveLength(1)
  })

  it('keeps two real corners apart', () => {
    const g = groupByProximity([
      note({ id: 'a', d_start: 0.12, d_end: 0.13 }),
      note({ id: 'b', d_start: 0.55, d_end: 0.56 }),
    ])
    expect(g).toHaveLength(2)
  })

  it('CANNOT DRIFT one stack down a straight', () => {
    // Anchored to the stack's FIRST member, not to a running mean. A chain of
    // notes each just inside the tolerance of the last would otherwise walk one
    // group across half the circuit.
    // Spacing well INSIDE the tolerance is what makes this bite: a mean-anchored
    // group's centre lags behind its leading edge, so it keeps accepting notes
    // and the stack's span grows past the tolerance without limit. Anchoring to
    // the first member caps every stack's span at exactly the tolerance.
    const step = GROUP_TOLERANCE * 0.3
    const chain = Array.from({ length: 30 }, (_, i) =>
      note({ id: `n${i}`, d_start: 0.2 + i * step, d_end: 0.2 + i * step }),
    )
    const g = groupByProximity(chain)
    expect(g.length).toBeGreaterThan(1)
    for (const grp of g) {
      const mids = grp.notes.map((n) => n.d_start)
      expect(Math.max(...mids) - Math.min(...mids)).toBeLessThanOrEqual(GROUP_TOLERANCE + 1e-9)
    }
  })

  it('returns the lap in order, and the newest revision first inside a stack', () => {
    const g = groupByProximity([
      note({ id: 'late', d_start: 0.55, d_end: 0.55 }),
      note({ id: 'old', d_start: 0.12, d_end: 0.12, session_recorded_at: '2026-01-01T00:00:00Z' }),
      note({ id: 'new', d_start: 0.121, d_end: 0.121, session_recorded_at: '2026-08-01T00:00:00Z' }),
    ])
    expect(g.map((x) => x.notes[0].id)).toEqual(['new', 'late'])
    expect(g[0].notes.map((n) => n.id)).toEqual(['new', 'old'])
  })

  it('drops a note with no usable position instead of piling it at zero', () => {
    expect(groupByProximity([note({ d_start: null, d_end: null })])).toEqual([])
    expect(groupByProximity(null)).toEqual([])
  })
})

describe('pickForSession', () => {
  const dry = note({ id: 'dry', car: 'Ferrari 499P', ambient_c: 29.5, session_recorded_at: '2026-01-01T00:00:00Z' })
  const cold = note({ id: 'cold', car: 'Oreca 07 Gibson', ambient_c: 14, session_recorded_at: '2026-08-01T00:00:00Z' })

  it('PREFERS THE SAME CAR OVER A NEWER NOTE IN IDENTICAL CONDITIONS', () => {
    // Braking points do not transfer between an LMP2 and a Hypercar, so a newer
    // note in the wrong car is worth less than an older one in the right car.
    // The conditions are made IDENTICAL on purpose: with different temperatures
    // the closer-conditions term would pick the right answer for the wrong
    // reason, and the car preference would go untested.
    const rightCar = note({ id: 'right', car: 'Ferrari 499P', ambient_c: 29.5, session_recorded_at: '2026-01-01T00:00:00Z' })
    const wrongCarNewer = note({ id: 'wrong', car: 'Oreca 07 Gibson', ambient_c: 29.5, session_recorded_at: '2026-08-01T00:00:00Z' })
    const picked = pickForSession(groupByProximity([rightCar, wrongCarNewer])[0], SESSION)
    expect(picked.note.id).toBe('right')
    expect(picked.rest.map((n) => n.id)).toEqual(['wrong'])
  })

  it('also returns the others, so a busy corner shows a count and not a wall', () => {
    const picked = pickForSession(groupByProximity([dry, cold])[0], SESSION)
    expect(picked.note.id).toBe('dry')
    expect(picked.rest.map((n) => n.id)).toEqual(['cold'])
  })

  it('falls back to closest conditions when no note matches the car', () => {
    const warm = note({ id: 'warm', car: 'Porsche 963', ambient_c: 28 })
    const chilly = note({ id: 'chilly', car: 'Porsche 963', ambient_c: 8 })
    expect(pickForSession(groupByProximity([chilly, warm])[0], SESSION).note.id).toBe('warm')
  })

  it('breaks a tie on recency', () => {
    const older = note({ id: 'older', car: 'Ferrari 499P', ambient_c: 29.5, session_recorded_at: '2026-01-01T00:00:00Z' })
    const newer = note({ id: 'newer', car: 'Ferrari 499P', ambient_c: 29.5, session_recorded_at: '2026-08-01T00:00:00Z' })
    expect(pickForSession({ notes: [older, newer] }, SESSION).note.id).toBe('newer')
  })

  it('accepts a bare array as well as a stack, and is null for nothing', () => {
    expect(pickForSession([dry], SESSION).note.id).toBe('dry')
    expect(pickForSession({ notes: [] }, SESSION)).toBeNull()
    expect(pickForSession(null, SESSION)).toBeNull()
  })
})

describe('attachToCorners', () => {
  const CORNERS = [
    { n: 1, dStart: 0.02, d: 0.03, dEnd: 0.05 },
    { n: 5, dStart: 0.12, d: 0.128, dEnd: 0.135 },
    { n: 12, dStart: 0.55, d: 0.56, dEnd: 0.57 },
  ]

  it('lands a note on the corner whose span contains it', () => {
    const { attached, loose } = attachToCorners([note({ d_start: 0.125, d_end: 0.130 })], CORNERS)
    expect(loose).toEqual([])
    expect(attached.get(5).notes).toHaveLength(1)
    expect(attached.get(5).corner.n).toBe(5)
  })

  it('RENDERS A NOTE WITH NO CORNER ON THE TRACE, not as an error', () => {
    // The note is anchored to a place on the road, and the road did not move —
    // only our numbering of it did. `loose` is what the map draws at its own
    // distance. This is the case that a corner-number anchor would have lost
    // entirely, and it is the whole reason for the distance span.
    const orphanAnchor = note({ id: 'between', d_start: 0.33, d_end: 0.34 })
    const { attached, loose } = attachToCorners([orphanAnchor], CORNERS)
    expect(attached.size).toBe(0)
    expect(loose).toHaveLength(1)
    expect(loose[0].notes[0].id).toBe('between')
    expect(loose[0].anchorMid).toBeCloseTo(0.335, 6)
  })

  it('SURVIVES A DETECTOR THAT RENUMBERS EVERY CORNER', () => {
    // The regression this design exists to prevent. Same road, corner 5 now
    // called 9 because an earlier corner split in two — the note must still be
    // on the same piece of tarmac.
    const renumbered = CORNERS.map((c) => ({ ...c, n: c.n + 4 }))
    const n = note({ id: 'keep', d_start: 0.125, d_end: 0.130 })
    const { attached, loose } = attachToCorners([n], renumbered)
    expect(loose).toEqual([])
    expect(attached.get(9).notes[0].id).toBe('keep')
  })

  it('merges two stacks that land on the same corner', () => {
    const { attached } = attachToCorners(
      [note({ id: 'a', d_start: 0.121, d_end: 0.121 }), note({ id: 'b', d_start: 0.134, d_end: 0.134 })],
      CORNERS,
    )
    expect(attached.size).toBe(1)
    expect(attached.get(5).notes.map((x) => x.id).sort()).toEqual(['a', 'b'])
  })

  it('treats every note as loose when the lap has no corners at all', () => {
    const { attached, loose } = attachToCorners([note()], [])
    expect(attached.size).toBe(0)
    expect(loose).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SPEC 001 — one rule decides whether a note is visible.
// docs/specs/001-note-visibility/spec.md
// ─────────────────────────────────────────────────────────────────────────────

describe('isAtDistance', () => {
  const span = { dStart: 0.40, dEnd: 0.44 }

  it('is true inside the span and on both edges', () => {
    expect(isAtDistance(span, 0.42)).toBe(true)
    expect(isAtDistance(span, 0.40)).toBe(true)
    expect(isAtDistance(span, 0.44)).toBe(true)
  })

  it('pads the span by the tolerance at each end — which is what makes a POINT note reachable', () => {
    // A note on a straight is a zero-width span. Without the pad the only way
    // to see it would be to land the cursor on its exact fraction, and the
    // trace's points sit ~35 m apart down a straight.
    expect(isAtDistance({ dStart: 0.6, dEnd: 0.6 }, 0.6 + GROUP_TOLERANCE * 0.9)).toBe(true)
    expect(isAtDistance({ dStart: 0.6, dEnd: 0.6 }, 0.6 + GROUP_TOLERANCE * 1.5)).toBe(false)
  })

  it('MEASURES AGAINST THE WHOLE SPAN, not its midpoint', () => {
    // A corner note's anchor is the corner's own window — 60-180 m at COTA. If
    // this measured to the midpoint with the same tolerance, the note would
    // vanish while the car was still in the corner it is about.
    const wide = { dStart: 0.30, dEnd: 0.36 }
    const mid = 0.33
    expect(Math.abs(0.355 - mid)).toBeGreaterThan(GROUP_TOLERANCE)
    expect(isAtDistance(wide, 0.355)).toBe(true)
  })

  it('says no rather than guessing when either side is unusable', () => {
    expect(isAtDistance(span, null)).toBe(false)
    expect(isAtDistance(span, 'x')).toBe(false)
    expect(isAtDistance(null, 0.42)).toBe(false)
    expect(isAtDistance({ dStart: null, dEnd: null }, 0.42)).toBe(false)
  })
})

describe('stacksForLap', () => {
  const CORNERS = [{ n: 5, dStart: 0.12, d: 0.128, dEnd: 0.135 }]

  it('returns ONE lap-ordered list, corner attachment as an attribute not a category', () => {
    // The root cause of spec 001: two collections with different meanings let
    // an implementation detail decide what a driver sees.
    const stacks = stacksForLap(
      [note({ id: 'straight', d_start: 0.62, d_end: 0.62 }), note({ id: 'corner', d_start: 0.125, d_end: 0.130 })],
      CORNERS,
    )
    expect(stacks.map((s) => s.notes[0].id)).toEqual(['corner', 'straight'])
    expect(stacks[0].corner.n).toBe(5)
    expect(stacks[1].corner).toBe(null)
  })

  it('keeps every note when the lap has no corners at all', () => {
    const stacks = stacksForLap([note()], [])
    expect(stacks).toHaveLength(1)
    expect(stacks[0].corner).toBe(null)
  })
})

describe('stacksAtDistance', () => {
  const CORNERS = [{ n: 5, dStart: 0.12, d: 0.128, dEnd: 0.135 }]
  const NOTES = [
    note({ id: 'corner', d_start: 0.125, d_end: 0.130 }),
    note({ id: 'straight', d_start: 0.62, d_end: 0.62 }),
  ]

  it('SELECTS BOTH KINDS BY THE SAME RULE — the whole point of the spec', () => {
    const stacks = stacksForLap(NOTES, CORNERS)
    expect(stacksAtDistance(stacks, 0.128).map((s) => s.notes[0].id)).toEqual(['corner'])
    expect(stacksAtDistance(stacks, 0.62).map((s) => s.notes[0].id)).toEqual(['straight'])
    expect(stacksAtDistance(stacks, 0.40)).toEqual([])
  })

  it('finds a corner note without being told about the corner', () => {
    // Replay drives DISTANCE, and a lap re-detected differently may not call
    // this place a corner at all. Visibility must not depend on that.
    const stacks = stacksForLap(NOTES, [])
    expect(stacksAtDistance(stacks, 0.1275).map((s) => s.notes[0].id)).toEqual(['corner'])
  })
})
