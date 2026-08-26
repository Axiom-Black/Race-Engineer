// ByteCraft Racing — Track Notes: a driver's own track guide, built from their
// own laps.
//
// This module is the *logic* of notes — keys, anchors, conditions, grouping.
// Persistence lives in lib/trackNotes.js and the schema in
// supabase/migrations/20260826000000_w03_track_notes.sql. Keeping them apart is
// not ceremony: every rule below is testable without a database, and the rules
// are the part that is easy to get quietly wrong.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FOUR DECISIONS, AND WHY EACH IS THE WAY IT IS
// ─────────────────────────────────────────────────────────────────────────────
//
// 1 · A NOTE ANCHORS TO A DISTANCE SPAN, NEVER TO A CORNER NUMBER.
//
// Corner numbering is *ours* and it is derived. `lib/cornerDetect.js` changed
// twice in three days and moved COTA from 12 corners to 15 to 20 — a note
// pinned to "corner 14" is orphaned the moment corner 13 splits in two, and
// worse, it silently re-attaches to a different piece of road. A span
// `[dStart, dEnd]` of lap distance fraction is a place on the track, and the
// track does not move. It also describes a corner and a straight with one
// shape, which is what was asked for.
//
// The same lesson as persisting corners by `d` rather than by sample index, and
// as storing canonical SI and converting at the display edge: store the
// invariant.
//
// 2 · THE NOTE OUTLIVES THE SESSION THAT PRODUCED IT.
//
// A session is a recording; a note is knowledge. Deleting the recording must
// not delete what the driver learned from it. So the source session is
// **metadata, not ownership**: the foreign key is `on delete set null`, and
// every fact about the session a reader might need — its car, its date, its
// conditions — is *copied onto the note at write time*. A note that said
// "see session 4f2a…" and nothing more would become unreadable the moment
// session 4f2a was deleted, which is precisely the case this design exists for.
//
// 3 · REVISE WITHIN A SESSION, ACCUMULATE ACROSS SESSIONS.
//
// Within one session a driver is refining a single observation — the second
// thing they write about T4 replaces the first, because they drove it once and
// their reading of that run improved. Across sessions they are building
// knowledge — T4 in the wet and T4 in the dry are both true and neither should
// overwrite the other.
//
// That is the whole reason `session_key` is in the unique key:
// `(user_id, track_key, anchor_key, session_key)`. Same session → update in
// place. New session → a revision alongside.
//
// 4 · THE DB KEY IS FOR REVISION; DISPLAY GROUPING IS BY PROXIMITY.
//
// `anchorKey` quantises the span's midpoint into buckets so that "the same
// corner, a week later" lands on the same key even though the detector put its
// apex 4 metres further on. But a quantised key has boundaries, and two notes
// about one corner can still straddle one.
//
// Rather than pretend a rounding rule can't fail, grouping for *display* is
// done by proximity (`groupByProximity`) with a tolerance, so a straddled
// boundary still renders as one stack. The DB key only has to make revision
// work, and for that an exact bucket is right; relevance is a read concern.
import { strictNum } from './num.js'

/**
 * Buckets per lap for the anchor key. 200 → 0.5% of a lap, which at COTA's
 * 5.513 km is ~27.6 m: comfortably inside a single corner (the detector's
 * corner windows there run 60–180 m) and comfortably smaller than the gap
 * between two corners. It is a *fraction* of the lap and not a metre count on
 * purpose — the same reasoning as every threshold in cornerDetect.js. A metre
 * count tuned at COTA would be too coarse at a 3 km circuit and too fine at
 * Le Mans.
 */
export const ANCHOR_BUCKETS = 200

/**
 * Display-grouping tolerance, as a fraction of the lap. Deliberately wider than
 * one bucket (1/200 = 0.005) so a note that straddles a bucket boundary still
 * shows in the same stack as its neighbours.
 */
export const GROUP_TOLERANCE = 0.012

export const MAX_NOTE_CHARS = 2000

/** A span covering the whole lap — what a note gets if no anchor is offered. */
export const WHOLE_LAP = Object.freeze({ dStart: 0, dEnd: 1 })

function clamp01(v) {
  const n = strictNum(v)
  if (!Number.isFinite(n)) return null
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * Normalise a venue string into a stable grouping key.
 *
 * **Layouts stay distinct.** "Silverstone GP" and "Silverstone National" are
 * different tracks for our purposes, because a distance fraction means a
 * different place on each — grouping their notes together would put a note
 * about Stowe somewhere in the middle of nothing. So this only folds case and
 * whitespace; it never strips a layout suffix.
 */
export function trackKey(venue) {
  if (typeof venue !== 'string') return null
  const k = venue.trim().toLowerCase().replace(/\s+/g, ' ')
  return k === '' ? null : k
}

/**
 * Normalise a span into `{dStart, dEnd}`, ordered and clamped to [0, 1].
 *
 * Returns null rather than a repaired guess when neither end is usable — a
 * note with no place on the track is not a note about a corner, and silently
 * anchoring it to the start/finish line would be a fabricated location.
 */
export function normaliseAnchor(anchor) {
  const a = clamp01(anchor?.dStart)
  const b = clamp01(anchor?.dEnd)
  if (a === null && b === null) return null
  // One end given: a point note. Treat it as a zero-width span rather than
  // inventing a width, and let the renderer decide how wide to draw a point.
  const lo = a === null ? b : a
  const hi = b === null ? a : b
  return lo <= hi ? { dStart: lo, dEnd: hi } : { dStart: hi, dEnd: lo }
}

/** The midpoint of a span — the single number the anchor key is built from. */
export function anchorMid(anchor) {
  const n = normaliseAnchor(anchor)
  return n === null ? null : (n.dStart + n.dEnd) / 2
}

/**
 * The quantised identity of a place on the track.
 *
 * Zero-padded so it sorts lexically in lap order, which means a plain
 * `order by anchor_key` in Postgres walks the lap from start to finish and no
 * index needs a computed expression.
 */
export function anchorKey(anchor) {
  const mid = anchorMid(anchor)
  if (mid === null) return null
  const bucket = Math.min(ANCHOR_BUCKETS - 1, Math.floor(mid * ANCHOR_BUCKETS))
  return `d${String(bucket).padStart(4, '0')}`
}

/**
 * Build an anchor from a detected corner.
 *
 * Uses the corner's own `dStart`/`dEnd` when it has them (post-25-Aug ingest)
 * and falls back to its apex `d` as a point. Notably it does NOT record the
 * corner *number* as the anchor — see decision 1. The number travels as a
 * label, so the driver still reads "T7" on their own note, but the identity
 * underneath is the distance.
 */
export function anchorFromCorner(corner) {
  if (!corner) return null
  const span = normaliseAnchor({ dStart: corner.dStart, dEnd: corner.dEnd })
  if (span) return span
  const point = clamp01(corner.d)
  return point === null ? null : { dStart: point, dEnd: point }
}

/** Build an anchor from a single distance fraction — a note on a straight. */
export function anchorFromDistance(d, halfWidth = 0) {
  const c = clamp01(d)
  if (c === null) return null
  const w = Math.max(0, strictNum(halfWidth) || 0)
  return normaliseAnchor({ dStart: c - w, dEnd: c + w })
}

/**
 * Copy the session's identity onto the note.
 *
 * **This denormalisation is the feature, not a shortcut.** The note has to be
 * readable after the session row is gone, and "which car, in what conditions"
 * is exactly what makes one note about T4 distinguishable from another. A join
 * would give a cleaner schema and an unreadable note.
 *
 * Temperatures come from the channel summary rather than from a dedicated
 * column, because that is where ingest already puts them (`summary.channels`)
 * and because they are the only environmental facts the export actually
 * carries. **There is no wetness or time-of-day channel in the 70 we decode** —
 * so those are not derived here and not guessed. They are session-level facts
 * the test log records by hand (`docs/test-log-iteration-5.md`), and a `wet`
 * field that was always false would be worse than an absent one.
 */
export function conditionsFrom(session) {
  const channels = session?.summary?.channels
  const pick = (name) => {
    const c = Array.isArray(channels)
      ? channels.find((x) => x?.name === name)
      : channels?.[name]
    if (!c) return null
    // Mean of the observed range: a session's ambient drifts a degree or two
    // and either endpoint alone would misreport it.
    const lo = strictNum(c.min)
    const hi = strictNum(c.max)
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
    return Number(((lo + hi) / 2).toFixed(1))
  }
  return {
    ambientC: pick('Ambient Temperature'),
    trackC: pick('Track Temperature'),
  }
}

/**
 * A short human label for the conditions a note was taken in.
 *
 * Says only what it knows. An unknown temperature yields no fragment rather
 * than a `—`, so a note taken from an export missing those channels reads as
 * "Ferrari 499P" and not "Ferrari 499P · —°C amb".
 */
export function conditionLabel({ car, ambientC, trackC } = {}) {
  const parts = []
  if (typeof car === 'string' && car.trim()) parts.push(car.trim())
  const amb = strictNum(ambientC)
  const trk = strictNum(trackC)
  if (Number.isFinite(amb)) parts.push(`${Math.round(amb)}°C air`)
  if (Number.isFinite(trk)) parts.push(`${Math.round(trk)}°C track`)
  return parts.join(' · ')
}

/** Trim and cap note text; returns null for anything with no content. */
export function normaliseBody(text) {
  if (typeof text !== 'string') return null
  const t = text.trim()
  if (t === '') return null
  return t.length > MAX_NOTE_CHARS ? t.slice(0, MAX_NOTE_CHARS) : t
}

/**
 * Assemble the row to write. `sessionKey` is the session id **as text and
 * separately from the foreign key**, because the FK is nulled when the session
 * is deleted and the unique key must survive that — otherwise every orphaned
 * revision of one anchor would collapse into a single null slot and Postgres
 * would either reject the second one or (since NULLs compare distinct) stop
 * enforcing revision at all.
 */
export function buildNoteRow({ userId, session, anchor, body, cornerLabel }) {
  const span = normaliseAnchor(anchor) ?? WHOLE_LAP
  const key = trackKey(session?.venue)
  const text = normaliseBody(body)
  if (!userId || !key || !text || !session?.id) return null

  const cond = conditionsFrom(session)
  return {
    user_id: userId,
    track_key: key,
    track_label: session.venue,
    anchor_key: anchorKey(span),
    d_start: span.dStart,
    d_end: span.dEnd,
    corner_label: cornerLabel ?? null,
    body: text,
    source_session_id: session.id,
    session_key: String(session.id),
    session_recorded_at: session.recorded_at ?? session.recordedAt ?? null,
    car: session.car ?? null,
    car_class: session.car_class ?? session.carClass ?? null,
    ambient_c: cond.ambientC,
    track_c: cond.trackC,
  }
}

/** Is this note's source session still in the driver's garage? */
export function isOrphaned(note) {
  return !!note && note.source_session_id == null
}

/**
 * Group notes into stacks by proximity on the lap, in lap order.
 *
 * Proximity rather than exact key, per decision 4: a quantised key has
 * boundaries and two notes about one corner can straddle one. Greedy from the
 * start of the lap, each note joining the open stack while it is within
 * `tolerance` of that stack's *first* member — anchored to the first rather
 * than to a running mean so a dense run of notes down a straight cannot drift
 * one stack across half the circuit.
 */
export function groupByProximity(notes, tolerance = GROUP_TOLERANCE) {
  const usable = (Array.isArray(notes) ? notes : [])
    .map((n) => ({ note: n, mid: anchorMid({ dStart: n?.d_start, dEnd: n?.d_end }) }))
    .filter((x) => x.mid !== null)
    .sort((a, b) => a.mid - b.mid)

  const groups = []
  for (const { note, mid } of usable) {
    const open = groups[groups.length - 1]
    if (open && mid - open.anchorMid <= tolerance) {
      open.notes.push(note)
      open.dEnd = Math.max(open.dEnd, strictNum(note.d_end) ?? mid)
    } else {
      groups.push({
        anchorMid: mid,
        dStart: strictNum(note.d_start) ?? mid,
        dEnd: strictNum(note.d_end) ?? mid,
        notes: [note],
      })
    }
  }
  // Newest revision first inside each stack — a driver opening a corner wants
  // what they last concluded about it, with the history underneath.
  for (const g of groups) g.notes.sort((a, b) => revisionRank(b) - revisionRank(a))
  return groups
}

function revisionRank(note) {
  const t = Date.parse(note?.session_recorded_at ?? '') || Date.parse(note?.created_at ?? '')
  return Number.isFinite(t) ? t : 0
}

/**
 * Which note in a stack to show on the map for the session being *viewed*.
 *
 * Relevance, not recency alone: a note taken in the same car is worth more to
 * a driver than a newer note taken in a different one, because braking points
 * do not transfer between an LMP3 and a Hypercar. Ranked on car match first,
 * then on how close the conditions were, then on recency.
 *
 * Returns `{ note, rest }` so the caller can show one and count the others —
 * that count is what stops a busy corner turning into a wall of text.
 */
export function pickForSession(stack, session) {
  const notes = Array.isArray(stack?.notes) ? stack.notes : Array.isArray(stack) ? stack : []
  if (notes.length === 0) return null

  const car = session?.car ?? null
  const cond = conditionsFrom(session)
  const score = (n) => {
    let s = 0
    if (car && n.car === car) s += 1000
    const amb = strictNum(cond.ambientC)
    const nAmb = strictNum(n.ambient_c)
    if (Number.isFinite(amb) && Number.isFinite(nAmb)) {
      // 20 °C apart scores nothing; identical scores the full 100.
      s += Math.max(0, 100 - Math.abs(amb - nAmb) * 5)
    }
    return s
  }

  const ranked = [...notes].sort((a, b) => {
    const d = score(b) - score(a)
    return d !== 0 ? d : revisionRank(b) - revisionRank(a)
  })
  return { note: ranked[0], rest: ranked.slice(1) }
}

/**
 * Attach note stacks to the corners of the lap being viewed, and report the
 * ones that match no corner.
 *
 * **A note that matches no corner is not an error.** The note is anchored to a
 * place on the road; if the detector no longer calls that place a corner, the
 * road did not move — only our numbering of it did. Those come back in
 * `loose`, and the map renders them on the trace at their own distance.
 */
export function attachToCorners(notes, corners, tolerance = GROUP_TOLERANCE) {
  const groups = groupByProximity(notes, tolerance)
  const list = Array.isArray(corners) ? corners : []
  const attached = new Map()
  const loose = []

  for (const g of groups) {
    let best = null
    let bestGap = Infinity
    for (const c of list) {
      const cm = anchorMid(anchorFromCorner(c) ?? {})
      if (cm === null) continue
      const inside = g.anchorMid >= (strictNum(c.dStart) ?? cm) && g.anchorMid <= (strictNum(c.dEnd) ?? cm)
      const gap = inside ? 0 : Math.abs(cm - g.anchorMid)
      if (gap < bestGap) {
        bestGap = gap
        best = c
      }
    }
    if (best && bestGap <= tolerance) {
      const k = best.n ?? anchorKey({ dStart: best.dStart, dEnd: best.dEnd })
      const existing = attached.get(k)
      if (existing) existing.notes.push(...g.notes)
      else attached.set(k, { corner: best, ...g })
    } else {
      loose.push(g)
    }
  }
  return { attached, loose }
}
