// ByteCraft Racing — stints, and the run averages a driver actually quotes.
//
// WHAT A RUN IS HERE (owner decision, 25 Aug 2026).
//
// A run is a **stint**: consecutive timed laps, of any length. The reported
// figures are the best 3, 5, 7 and 10-lap averages.
//
// The alternative — a rolling window over the last N timed laps regardless of
// gaps — was rejected, and the reason matters: it happily averages across a
// pit stop and a tyre change, producing a confident number an engineer would
// call meaningless. Consecutiveness is the whole point. "My best five-lap
// average" means five laps in a row, on one set of tyres, with no
// interruption; it does not mean "five laps I did at some point".
//
// WHAT BREAKS A STINT.
//
// Any lap that is not a completed timed lap — an out-lap, an in-lap, a partial
// trailing lap — and any gap in lap numbering, which is how a pit stop or a
// paused export shows up in the data. A break ends the stint; the next timed
// lap starts a new one.
//
// A CONSEQUENCE HELD ON PURPOSE.
//
// The pilot fixture yields at most a 3-lap stint, so the 5, 7 and 10-lap
// figures legitimately have nothing to report on it. They return null and the
// UI is expected to say so, rather than falling back to "the best we have",
// which would silently answer a different question than the one asked. This is
// the same discipline Progression already applies in refusing to award a tier
// on a single data point.
import { strictNum } from './num.js'

/** The window sizes reported, in display order. */
export const RUN_SIZES = [3, 5, 7, 10]

function isTimed(lap) {
  return (lap?.summary?.kind ?? (lap?.valid ? 'timed' : null)) === 'timed'
}

/** A usable lap time, or null. Postgres sends numerics as strings. */
export function lapTime(lap) {
  const t = strictNum(lap?.lap_time_s)
  return Number.isFinite(t) && t > 0 ? t : null
}

/**
 * Split a session's laps into stints of consecutive timed laps.
 *
 * Laps are sorted by lap number first: the persisted order is not guaranteed,
 * and a stint built from an unsorted list would be consecutive by accident
 * rather than by fact.
 *
 * @returns {Array<Array<object>>} stints, each in lap order, none empty.
 */
export function stintsOf(laps) {
  const ordered = (Array.isArray(laps) ? laps.filter(Boolean) : [])
    .slice()
    .sort((a, b) => strictNum(a.lap_no) - strictNum(b.lap_no))

  const stints = []
  let current = []
  let prevNo = null

  for (const lap of ordered) {
    const no = strictNum(lap.lap_no)
    const usable = isTimed(lap) && lapTime(lap) !== null
    // A gap in numbering is a pit stop or a paused export — not consecutive,
    // whatever the two laps look like individually.
    const contiguous = prevNo === null || no === prevNo + 1

    if (!usable || !contiguous) {
      if (current.length) stints.push(current)
      current = usable ? [lap] : []
    } else {
      current.push(lap)
    }
    prevNo = Number.isFinite(no) ? no : null
  }
  if (current.length) stints.push(current)
  return stints
}

/**
 * The best (fastest) mean lap time over any `size` consecutive laps within a
 * single stint.
 *
 * "Best" is the lowest average, because these are lap times. Windows may not
 * span two stints — that is the whole reason stints are computed first.
 *
 * @returns {{avgS: number, startLapNo: number, endLapNo: number}|null}
 */
export function bestRun(laps, size) {
  const n = strictNum(size)
  if (!Number.isFinite(n) || n < 1) return null

  let best = null
  for (const stint of stintsOf(laps)) {
    if (stint.length < n) continue
    for (let i = 0; i + n <= stint.length; i++) {
      const window = stint.slice(i, i + n)
      const total = window.reduce((sum, l) => sum + lapTime(l), 0)
      const avgS = total / n
      if (!best || avgS < best.avgS) {
        best = {
          avgS,
          startLapNo: strictNum(window[0].lap_no),
          endLapNo: strictNum(window[n - 1].lap_no),
        }
      }
    }
  }
  return best
}

/**
 * Every reported run average for a session, including the ones with nothing to
 * report.
 *
 * A row is returned for each size even when no stint is long enough: dropping
 * it would leave a driver unsure whether the figure is unavailable or simply
 * not offered. `available: false` is the honest answer to "what was my best
 * ten-lap average" when no ten consecutive laps exist.
 */
export function runAverages(laps, sizes = RUN_SIZES) {
  const stints = stintsOf(laps)
  const longest = stints.reduce((m, s) => Math.max(m, s.length), 0)
  return sizes.map((size) => {
    const best = bestRun(laps, size)
    return {
      size,
      available: best !== null,
      avgS: best?.avgS ?? null,
      startLapNo: best?.startLapNo ?? null,
      endLapNo: best?.endLapNo ?? null,
      // Carried so the UI can explain the absence concretely — "needs 5
      // consecutive laps, longest stint was 3" beats a bare dash.
      longestStint: longest,
    }
  })
}

/** Summary of the stints themselves, for a "runs in this session" strip. */
export function stintSummary(laps) {
  return stintsOf(laps).map((stint, i) => {
    const times = stint.map(lapTime)
    const total = times.reduce((a, t) => a + t, 0)
    return {
      index: i + 1,
      lapCount: stint.length,
      startLapNo: strictNum(stint[0].lap_no),
      endLapNo: strictNum(stint[stint.length - 1].lap_no),
      avgS: total / stint.length,
      bestS: Math.min(...times),
    }
  })
}
