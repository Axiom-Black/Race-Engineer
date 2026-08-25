// ByteCraft Racing — the derived figures the Summary hero leads with.
//
// Ported from prototypes/ByteCraft_SessionReport.jsx's HeaderCard, which
// carries four things the shipped Summary never had: a personal best for the
// circuit, the tyre compound, thermal peaks, and the driver's session history
// at that circuit. All four turn out to be derivable from data already
// persisted — no new columns, no extra queries.
//
// ONE THING IS DELIBERATELY NOT PORTED. The prototype shows a "Technical
// Circuit" classification chip. That value was hardcoded in the prototype and
// has no source in the export or the schema — inventing a label for a circuit
// would be exactly the confident-but-baseless claim the flagging bar exists to
// prevent. It returns when a curated circuit registry does (Phase 3).
import { strictNum } from './num.js'
import { comparableSessions } from './sessionCompare.js'

/**
 * The driver's best lap at this venue in this car, across all their sessions.
 *
 * INCLUDES the current session, because if today was the best lap then today
 * IS the personal best — a "personal best" that silently excluded the session
 * you are looking at would read as wrong every time you set one.
 *
 * Demo sessions are excluded via comparableSessions: every account is seeded
 * with the same fixture, so counting it would hand every driver the same
 * borrowed personal best at COTA before they had driven a lap.
 */
export function personalBest(sessions, current) {
  if (!current) return null
  const pool = [current, ...comparableSessions(sessions, current)]
  let best = null
  for (const s of pool) {
    if (s?.is_demo) continue
    const t = strictNum(s?.fastest_lap_s)
    if (!Number.isFinite(t) || t <= 0) continue
    if (!best || t < best.timeS) best = { timeS: t, sessionId: s.id, isCurrent: s.id === current.id }
  }
  return best
}

/**
 * Peak temperatures worth showing at a glance.
 *
 * Brake temperature is the hottest of the four corners rather than one of
 * them: a driver cares that SOMETHING reached 807 °C, and picking FL by
 * convention would hide a right-front problem entirely.
 */
const BRAKE_CHANNELS = ['Brake Temp FL', 'Brake Temp FR', 'Brake Temp RL', 'Brake Temp RR']

export function thermalPeaks(channels) {
  const list = Array.isArray(channels) ? channels : []
  const usable = (name) => {
    const ch = list.find((c) => c?.name === name)
    if (!ch || ch.allZero || ch.reliable === false) return null
    const max = strictNum(ch.max)
    return Number.isFinite(max) ? { max, unit: ch.unit } : null
  }

  const brakes = BRAKE_CHANNELS.map(usable).filter(Boolean)
  const brake = brakes.length
    ? { value: Math.max(...brakes.map((b) => b.max)), unit: brakes[0].unit }
    : null

  const water = usable('Eng Water Temp')
  const oil = usable('Eng Oil Temp')

  return [
    { key: 'brake', label: 'brake', ...(brake ?? { value: null, unit: null }) },
    { key: 'water', label: 'water', value: water?.max ?? null, unit: water?.unit ?? null },
    { key: 'oil', label: 'oil', value: oil?.max ?? null, unit: oil?.unit ?? null },
  ]
}

const CORNERS = ['FL', 'FR', 'RL', 'RR']

/**
 * The tyre compound fitted, from the decoded setup.
 *
 * Returns `{ compound, uniform }`. Split compounds are rare but real, and
 * reporting "Soft" when only three corners are soft would be a quiet lie —
 * `uniform: false` lets the UI say "mixed" instead.
 */
export function tyreCompound(setup) {
  const ldx = setup?.ldx
  if (!ldx || typeof ldx !== 'object') return null
  const values = CORNERS.map((c) => ldx[`${c}Compound`]).filter(
    (v) => typeof v === 'string' && v.trim() !== '',
  )
  if (values.length === 0) return null
  const unique = Array.from(new Set(values.map((v) => v.trim())))
  return { compound: unique.length === 1 ? unique[0] : 'Mixed', uniform: unique.length === 1 }
}

/**
 * The driver's sessions at this circuit, oldest first, with the current one
 * marked — the prototype's "SESSION HISTORY · THIS CIRCUIT" strip.
 *
 * Ordered oldest-first on purpose: read left to right, it shows whether the
 * driver is getting quicker, which a newest-first list obscures.
 */
export function circuitHistory(sessions, current, limit = 5) {
  if (!current) return []
  const rows = [current, ...comparableSessions(sessions, current)]
    .filter((s) => s && !s.is_demo)
    .map((s) => ({
      id: s.id,
      sessionType: s.session_type ?? null,
      recordedAt: s.recorded_at ?? s.created_at ?? null,
      timeS: Number.isFinite(strictNum(s.fastest_lap_s)) ? strictNum(s.fastest_lap_s) : null,
      isCurrent: s.id === current.id,
    }))
    .sort((a, b) => String(a.recordedAt ?? '').localeCompare(String(b.recordedAt ?? '')))

  // Keep the most recent `limit`, but never drop the session being viewed —
  // a history strip that omits the session you are looking at is disorienting.
  if (rows.length <= limit) return rows
  const tail = rows.slice(-limit)
  return tail.some((r) => r.isCurrent) ? tail : [...tail.slice(1), rows.find((r) => r.isCurrent)]
}
