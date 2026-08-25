// ByteCraft Racing — headline figures for the session overview.
//
// WHY THIS IS A SEPARATE MODULE.
//
// Everything here is a pure function of the session row, its laps and the
// persisted channel inventory. Keeping it out of the component means the
// numbers a driver reads first are unit-testable without a DOM, a Supabase
// client, or a network round trip — the same reason lib/progression.js and
// lib/lapReconciliation.js exist.
//
// WHY A MISSING OR EMPTY CHANNEL IS NOT ZERO.
//
// The standing bar is "unreliable data is flagged, never hidden"
// (WORKING_PLAN §4). A stat whose channel is absent, all-zero, or marked
// unreliable must NOT render as a confident number: `Fuel Level` reading
// all-zero would otherwise display "0.0 L used", which a driver would read as
// "I used no fuel" rather than "we don't know". Every derived stat therefore
// carries its own status, and the UI is responsible for showing that status
// rather than the number alone.
import { reconcile, displayLapTimeS } from './lapReconciliation.js'

/** Channel inventory lookup by exact name. Returns null when absent. */
export function channel(channels, name) {
  if (!Array.isArray(channels)) return null
  return channels.find((c) => c?.name === name) ?? null
}

export const STAT = {
  OK: 'ok',
  ABSENT: 'absent', // the export carried no such channel
  EMPTY: 'empty', // present but all-zero (known-empty GTE channels)
  UNRELIABLE: 'unreliable', // present but flagged by the parser
}

/**
 * Reduce one channel to a single displayable figure.
 *
 * `pick` says which figure the stat is: 'max' for a peak (top speed), 'range'
 * for a consumption (fuel burned = max - min). Both are meaningless on an
 * all-zero channel, which is why status is returned rather than a number alone.
 */
export function statFrom(channels, name, pick) {
  const ch = channel(channels, name)
  if (!ch) return { status: STAT.ABSENT, value: null, unit: null, name }
  if (ch.allZero) return { status: STAT.EMPTY, value: null, unit: ch.unit, name }
  if (ch.reliable === false) return { status: STAT.UNRELIABLE, value: null, unit: ch.unit, name }

  const min = Number(ch.min)
  const max = Number(ch.max)
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { status: STAT.ABSENT, value: null, unit: ch.unit, name }
  }
  const value = pick === 'range' ? max - min : max
  return { status: STAT.OK, value, unit: ch.unit, name }
}

/** mm:ss.mmm, or null when there is no time to show. */
export function fmtLapTime(s) {
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  const m = Math.floor(n / 60)
  return `${m}:${(n % 60).toFixed(3).padStart(6, '0')}`
}

/**
 * The four figures the overview leads with, in reading order.
 *
 * Fastest lap goes through lapReconciliation rather than reading
 * `session.fastest_lap_s` directly: the .ldx summary can name a lap the
 * telemetry cannot support, and the overview must not headline a lap time that
 * the rest of the app refuses to attribute to any lap.
 */
export function headlineStats(session, laps, channels) {
  const { fastestLap, timedCount } = reconcile(session, laps)
  const fastestS = fastestLap ? displayLapTimeS(fastestLap, session, laps) : null

  return [
    {
      key: 'laps',
      label: 'TIMED LAPS',
      text: String(timedCount),
      status: STAT.OK,
    },
    {
      key: 'fastest',
      label: 'FASTEST',
      text: fmtLapTime(fastestS) ?? '—',
      // No fastest lap is a real state (an out-lap-only session), not an error.
      status: fastestS == null ? STAT.ABSENT : STAT.OK,
      // Its own wording: the generic channel explanation ("not in this
      // export") is nonsense here, because a fastest lap is not a channel —
      // it is absent when no timed lap exists to attribute one to.
      why: 'no timed lap',
      accent: true,
    },
    statCard('top', 'TOP SPEED', statFrom(channels, 'Ground Speed', 'max'), 0),
    statCard('fuel', 'FUEL USED', statFrom(channels, 'Fuel Level', 'range'), 1),
  ]
}

function statCard(key, label, stat, dp) {
  return {
    key,
    label,
    text: stat.status === STAT.OK ? stat.value.toFixed(dp) : '—',
    unit: stat.status === STAT.OK ? stat.unit : null,
    status: stat.status,
    channelName: stat.name,
  }
}

/** One-line description of the car and session, or null if nothing is known. */
export function sessionSubtitle(session) {
  if (!session) return null
  const parts = [session.car, session.car_class, session.session_type, session.driver].filter(
    (p) => p != null && String(p).trim() !== '',
  )
  return parts.length ? parts.join(' · ') : null
}
