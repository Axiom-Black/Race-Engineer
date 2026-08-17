// ByteCraft Racing — Progression rollup (pure).
//
// Kept out of ProgressionTab.jsx so the maths is testable without dragging in
// the Supabase client (importing a component would transitively load
// lib/supabase.js, which throws by design when env vars are absent).
export const ALL_CARS = '__all__'

export const DEFAULT_TIERS = Object.freeze({
  elite: 0.5,
  competitive: 1.5,
  developing: 3.0,
})

// Single-pass min/max. Deliberately not Math.min(...arr): the spread form
// blows the call stack on large arrays, and a driver's session history is
// unbounded. Same reasoning as extentOf() in SessionReport.
export function minMax(nums) {
  let lo = Infinity
  let hi = -Infinity
  for (const n of nums) {
    if (n < lo) lo = n
    if (n > hi) hi = n
  }
  return { lo, hi }
}

export function fmtLap(s) {
  if (s == null || !Number.isFinite(s)) return '—'
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`
}

export function fmtGap(g) {
  if (g == null) return '—'
  return g <= 0.0005 ? '★ best' : `+${g.toFixed(3)}s`
}

/**
 * Roll persisted sessions up into venue × car × session_type combos.
 * `gap` is measured against the driver's OWN best for that combo — there is
 * no curated ideal-lap library in Phase 1, and inventing one would violate
 * the standing bar against faked capability.
 */
export function groupCombos(sessions) {
  const map = new Map()
  for (const s of sessions) {
    // The seeded demo session is sample data — it must not count toward a
    // driver's real gap/trend/best. It still shows in the Sessions list.
    if (s.is_demo) continue
    if (s.fastest_lap_s == null) continue
    const key = `${s.venue}|${s.car}|${s.session_type}`
    if (!map.has(key))
      map.set(key, { venue: s.venue, car: s.car, sessionType: s.session_type, runs: [] })
    map.get(key).runs.push(s)
  }
  return Array.from(map.values()).map((c) => {
    const runs = c.runs.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const bests = runs.map((r) => r.fastest_lap_s)
    const { lo: bestEver } = minMax(bests)
    const latest = bests[bests.length - 1]
    const gap = Number((latest - bestEver).toFixed(4))
    const trend = bests.length > 1 ? bests[bests.length - 1] - bests[bests.length - 2] : null
    return { ...c, bests, bestEver, gap, trend, count: runs.length }
  })
}

/** Distinct cars across the rolled-up combos, alphabetical. */
export function carsOf(combos) {
  return Array.from(new Set(combos.map((c) => c.car).filter(Boolean))).sort()
}

export function filterByCar(combos, car) {
  return car === ALL_CARS ? combos : combos.filter((c) => c.car === car)
}

/**
 * Tier name for a gap. Colours are resolved by the caller's theme.
 *
 * `runCount` is not optional decoration. The gap is measured against the
 * driver's OWN best, so a combo with a single session has a gap of exactly
 * zero by definition — and would be awarded ELITE for having nothing to be
 * compared against. Every first upload would come back top-tier. A tier needs
 * at least two runs before it is reporting anything at all.
 */
export function tierNameFor(gap, tiers, runCount = 2) {
  if (gap == null) return 'UNRANKED'
  if (runCount < 2) return 'UNRANKED'
  if (gap <= tiers.elite) return 'ELITE'
  if (gap <= tiers.competitive) return 'COMPETITIVE'
  if (gap <= tiers.developing) return 'DEVELOPING'
  return 'FOUNDATION'
}

/** Closeness-bar fill, 0–100. Guards a zero cutoff (division by zero). */
export function closenessPct(gap, tiers) {
  if (gap == null) return 0
  if (!(tiers.developing > 0)) return 100
  return Math.max(0, Math.min(100, 100 - (gap / tiers.developing) * 100))
}
