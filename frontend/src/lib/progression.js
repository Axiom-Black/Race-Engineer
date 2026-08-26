// ByteCraft Racing — Progression rollup (pure).
//
// Kept out of ProgressionTab.jsx so the maths is testable without dragging in
// the Supabase client (importing a component would transitively load
// lib/supabase.js, which throws by design when env vars are absent).
/** Sentinel for "no filter applied" on any of the three facet filters. */
export const ALL = '__all__'

/**
 * Tier thresholds, as a PERCENTAGE of the driver's best lap for that combo.
 *
 * Percent rather than seconds, because seconds are not comparable between
 * circuits: half a second off at Monaco is a different driver from half a
 * second off at Le Mans, and one threshold cannot mean both. A percentage of
 * the lap says the same thing everywhere.
 *
 * The numbers are unchanged from the prototype (≤0.5 / ≤1.5 / ≤3.0), and the
 * unit change is why lib/prefs.js persists them under a new key — reading a
 * stored "0.5 seconds" back as "0.5 percent" would silently reinterpret a
 * driver's own setting.
 */
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
      map.set(key, {
        venue: s.venue,
        car: s.car,
        carClass: s.car_class ?? null,
        sessionType: s.session_type,
        runs: [],
      })
    map.get(key).runs.push(s)
  }
  return Array.from(map.values()).map((c) => {
    const runs = c.runs.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const bests = runs.map((r) => r.fastest_lap_s)
    const { lo: bestEver } = minMax(bests)
    const latest = bests[bests.length - 1]
    const gap = Number((latest - bestEver).toFixed(4))
    const trend = bests.length > 1 ? bests[bests.length - 1] - bests[bests.length - 2] : null
    // Every run's gap to the personal best, as a percentage — the series the
    // sparkline draws and the number the tier is read from.
    const series = bests.map((b) => pctOff(b, bestEver))
    return {
      ...c,
      bests,
      bestEver,
      gap,
      gapPct: series[series.length - 1],
      series,
      direction: trendDirection(series),
      trend,
      count: runs.length,
    }
  })
}

/** How far `lap` is off `best`, as a percentage of `best`. */
export function pctOff(lap, best) {
  if (!Number.isFinite(lap) || !Number.isFinite(best) || best <= 0) return null
  return Number((((lap - best) / best) * 100).toFixed(3))
}

/**
 * Which way a gap series is going, over its last few entries.
 *
 * Deliberately not "latest vs. previous": one slow session in an otherwise
 * closing gap is a bad day, not a trend, and labelling it a regression would
 * tell a driver to change something that is working. Null until there is
 * enough history to have a direction at all.
 */
export function trendDirection(series, window = 3) {
  const vals = (Array.isArray(series) ? series : []).filter((v) => Number.isFinite(v))
  if (vals.length < 2) return null
  const recent = vals.slice(-Math.max(2, window))
  const change = recent[recent.length - 1] - recent[0]
  if (Math.abs(change) < 0.05) return 'holding'
  return change < 0 ? 'improving' : 'slipping'
}

/** Distinct values of one combo field, alphabetical, blanks dropped. */
export function optionsOf(combos, field) {
  return Array.from(new Set((combos ?? []).map((c) => c[field]).filter(Boolean))).sort()
}

/**
 * Narrow the combos by any subset of the three facets.
 *
 * A filter naming a value nothing carries yields an empty list rather than
 * quietly passing everything through — an empty result is the honest answer,
 * and the view says so.
 */
export function applyFilters(combos, filters = {}) {
  const match = (value, want) => want === undefined || want === ALL || value === want
  return (combos ?? []).filter(
    (c) =>
      match(c.venue, filters.venue) &&
      match(c.carClass, filters.carClass) &&
      match(c.sessionType, filters.sessionType),
  )
}

/**
 * Tier name for a gap PERCENTAGE. Colours are resolved by the caller's theme.
 *
 * `runCount` is not optional decoration. The gap is measured against the
 * driver's OWN best, so a combo with a single session has a gap of exactly
 * zero by definition — and would be awarded ELITE for having nothing to be
 * compared against. Every first upload would come back top-tier. A tier needs
 * at least two runs before it is reporting anything at all.
 */
export function tierNameFor(gapPct, tiers, runCount = 2) {
  const gap = gapPct
  if (gap == null || !Number.isFinite(gap)) return 'UNRANKED'
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
