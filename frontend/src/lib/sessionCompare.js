// ByteCraft Racing — comparing one session against the driver's own history.
//
// WHY THIS EXISTS. The shipped Performance tab lists numbers: "Top speed
// 244.2 km/h". True, and nearly useless — a driver cannot tell from it whether
// that was a good lap. The prototype
// (prototypes/ByteCraft_SessionReport.jsx) answers the question the number
// raises, by showing every metric against a session average and a historical
// one: "244.2 ▲0.6 vs session ▲4.6 vs history" says something.
//
// WHY IT IS CHEAP. Peaks come from `sessions.summary.channels`, which
// listSessions() already returns — so a historical comparison costs no extra
// query and downloads no trace blobs. Per-lap metrics would need the traces of
// every past session; per-channel peaks do not.
//
// WHAT IT DELIBERATELY WILL NOT DO. A comparison is only meaningful between
// like sessions, so history is drawn from the same venue AND the same car.
// Comparing a GTE lap at COTA against an LMP2 lap at Sebring produces a
// confident number that means nothing, which is worse than no number.

import { strictNum } from './num.js'

/**
 * The peak value of one channel in a session, or null if it cannot be trusted.
 *
 * Mirrors lib/sessionOverview.js: absent, all-zero and parser-flagged channels
 * yield null rather than a number, because a comparison built on a fabricated
 * zero is worse than an absent comparison (WORKING_PLAN §4).
 */
export function peakOf(session, channelName) {
  const channels = session?.summary?.channels
  if (!Array.isArray(channels)) return null
  const ch = channels.find((c) => c?.name === channelName)
  if (!ch || ch.allZero || ch.reliable === false) return null
  const max = strictNum(ch.max)
  return Number.isFinite(max) ? max : null
}

/**
 * Prior sessions worth comparing against: same venue, same car, not this one,
 * and never the seeded demo.
 *
 * The demo exclusion matters more than it looks. Every account is seeded with
 * the same COTA fixture, so leaving it in would give every driver an identical
 * phantom "past session" at that circuit — and their first real COTA run would
 * be measured against a stranger's lap.
 */
export function comparableSessions(sessions, current) {
  if (!Array.isArray(sessions) || !current) return []
  return sessions.filter(
    (s) =>
      s &&
      s.id !== current.id &&
      !s.is_demo &&
      s.venue === current.venue &&
      s.car === current.car,
  )
}

/**
 * Mean peak for a channel across comparable history.
 *
 * Returns the sample size alongside the value, because "▲4.6 vs history" reads
 * very differently when history is one session versus twelve. The UI is
 * expected to show n.
 */
export function historicalPeak(sessions, current, channelName) {
  const peers = comparableSessions(sessions, current)
  const values = peers.map((s) => peakOf(s, channelName)).filter((v) => v !== null)
  if (values.length === 0) return null
  const avg = values.reduce((a, v) => a + v, 0) / values.length
  return { avg, n: values.length }
}

/**
 * A signed comparison of value against reference.
 *
 * `higherBetter` decides the colour, not the arrow: the arrow always points
 * the direction the number moved, so a driver reading "▼" never has to work
 * out whether down is good here. `better` carries that judgement separately.
 *
 * EPSILON exists because floating peaks are never exactly equal, and an arrow
 * on a 0.0001 difference is noise dressed as information.
 */
export const EPSILON = 0.01

export function delta(value, reference, higherBetter = true) {
  const v = strictNum(value)
  const r = strictNum(reference)
  if (!Number.isFinite(v) || !Number.isFinite(r)) return null
  const diff = v - r
  if (Math.abs(diff) < EPSILON) {
    return { diff: 0, magnitude: 0, direction: 'same', better: null }
  }
  return {
    diff,
    magnitude: Math.abs(diff),
    direction: diff > 0 ? 'up' : 'down',
    better: higherBetter ? diff > 0 : diff < 0,
  }
}

/**
 * The metrics the Performance tab compares, in display order.
 *
 * `higherBetter: null` means the direction carries no verdict — a hotter brake
 * is not better or worse without knowing the target window, so the UI shows
 * the movement without colouring it as good or bad. Claiming otherwise would
 * be inventing an opinion the telemetry does not support.
 */
export const COMPARED_METRICS = [
  { key: 'topSpeed', label: 'Top speed', channel: 'Ground Speed', unit: 'km/h', dp: 1, higherBetter: true },
  { key: 'peakLatG', label: 'Peak lateral G', channel: 'G Force Lat', unit: 'G', dp: 2, higherBetter: true },
  { key: 'peakLongG', label: 'Peak longitudinal G', channel: 'G Force Long', unit: 'G', dp: 2, higherBetter: true },
  { key: 'maxRpm', label: 'Max RPM', channel: 'Engine RPM', unit: 'rpm', dp: 0, higherBetter: null },
  { key: 'brakePeak', label: 'Peak brake temp', channel: 'Brake Temp FL', unit: '°C', dp: 0, higherBetter: null },
]

/**
 * Build the compared rows for one session against its history.
 *
 * A row is always returned for every metric, even when the channel is missing:
 * dropping it would silently shorten the list and leave a driver wondering
 * whether the metric exists at all.
 */
export function buildComparison(session, sessions) {
  return COMPARED_METRICS.map((m) => {
    const value = peakOf(session, m.channel)
    const hist = historicalPeak(sessions, session, m.channel)
    return {
      ...m,
      value,
      history: hist,
      vsHistory: hist && value !== null ? delta(value, hist.avg, m.higherBetter ?? true) : null,
    }
  })
}
