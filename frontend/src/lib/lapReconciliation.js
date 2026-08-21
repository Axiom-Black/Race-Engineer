// ByteCraft Racing — reconcile the `.ldx` lap summary against `.ld` segmentation.
//
// THE TWO SOURCES, AND WHY THEY DISAGREE.
//
// A session's headline lap figures (`lap_count`, `fastest_lap_no`,
// `fastest_lap_s`) come from the **`.ldx`** — clean XML, pre-decoded by MoTeC,
// and the more precise number. The lap *rows* come from segmenting the
// **`.ld`** on its Beacon / Lap Number channels, because the `.ldx` carries no
// per-lap boundaries at all (`docs/motec-ld-format.md`).
//
// Two sources means they can disagree, and on real data they do:
//
//   * **Sub-sample drift.** On the production COTA upload the `.ldx` says the
//     fastest lap is 135.475 s; beacon segmentation computes 135.500 s for the
//     same lap. 25 ms — under one sample period. Both are "right"; the `.ldx`
//     is simply finer than the `.ld`'s sample grid.
//
//   * **Unsupportable summaries.** The seeded demo session is worse than
//     imprecise: its `.ldx` claims 3 laps with the fastest being lap 2, while
//     its truncated `.ld` yields a single *partial* segment. The summary
//     describes a session the trace cannot support — there is no lap 2 to
//     point at. Every new account sees this one.
//
// THE RULE (decided 21 Aug 2026): **`.ldx` wins, and disagreement is flagged.**
//
// Keeping the `.ldx` figure preserves MoTeC's precision, which is the whole
// reason the file is the preferred source. But a headline that its own lap
// table cannot corroborate must say so — WORKING_PLAN §4: *unreliable data is
// flagged, never hidden*. So this module never rewrites either source; it
// reports where they diverge, and the UI renders the divergence.
//
// It is deliberately pure and schema-free: flags are computed on read from
// values already persisted, so nothing here needs a migration and existing
// sessions gain the flags without re-ingest.

export const RECONCILE = {
  /** `.ldx` names a fastest lap that does not exist among the timed laps. */
  FASTEST_LAP_ABSENT: 'fastest-lap-absent',
  /** `.ldx` lap total disagrees with the number of timed laps found in `.ld`. */
  LAP_COUNT_MISMATCH: 'lap-count-mismatch',
  /** Both agree which lap is fastest, but the times differ measurably. */
  FASTEST_TIME_DRIFT: 'fastest-time-drift',
}

// Below this, a difference is explained by the `.ld`'s sample grid rather than
// by a real conflict, and flagging it would be noise. The observed real-world
// case is 25 ms; a beacon timestamp can only ever be as precise as one sample.
export const DRIFT_TOLERANCE_S = 0.05

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** Laps that represent a genuine timed lap — bounded by two line crossings. */
export function timedLaps(laps) {
  return (laps ?? []).filter((l) => (l.summary?.kind ?? (l.valid ? 'timed' : null)) === 'timed')
}

/**
 * Compare the `.ldx` summary against the `.ld`-derived laps.
 *
 * @param session persisted session row (`lap_count`, `fastest_lap_no`, `fastest_lap_s`)
 * @param laps    persisted lap rows
 * @returns {{flags: Array, fastestLap: object|null, timedCount: number}}
 *          `flags` is ordered most severe first. Empty means the two sources
 *          corroborate each other.
 */
export function reconcile(session, laps) {
  const rows = laps ?? []
  const timed = timedLaps(rows)
  const flags = []

  const summaryCount = session?.lap_count
  const summaryNo = session?.fastest_lap_no
  const summaryS = session?.fastest_lap_s == null ? null : Number(session.fastest_lap_s)

  // Match on lap number, but only against laps that are actually timed — a
  // summary pointing at an out-lap is as unsupported as one pointing at
  // nothing. This is also why `lap.lap_no === session.fastest_lap_no` is not
  // safe on its own: on the demo session it never matches.
  const fastestLap = isNum(summaryNo)
    ? (timed.find((l) => l.lap_no === summaryNo) ?? null)
    : null

  if (isNum(summaryNo) && !fastestLap) {
    flags.push({
      code: RECONCILE.FASTEST_LAP_ABSENT,
      severity: 'high',
      label: 'FASTEST LAP UNVERIFIED',
      detail:
        `The session summary names lap ${summaryNo} as fastest, but no timed lap ` +
        `${summaryNo} was found in the telemetry. The time shown comes from the ` +
        `.ldx summary and cannot be corroborated by the trace.`,
    })
  }

  if (isNum(summaryCount) && summaryCount !== timed.length) {
    flags.push({
      code: RECONCILE.LAP_COUNT_MISMATCH,
      severity: 'medium',
      label: 'LAP COUNT DISAGREES',
      detail:
        `The summary reports ${summaryCount} lap${summaryCount === 1 ? '' : 's'}, ` +
        `while the telemetry yields ${timed.length} complete timed ` +
        `lap${timed.length === 1 ? '' : 's'}.`,
    })
  }

  if (fastestLap && isNum(summaryS) && isNum(fastestLap.lap_time_s)) {
    const drift = Math.abs(summaryS - fastestLap.lap_time_s)
    if (drift > DRIFT_TOLERANCE_S) {
      flags.push({
        code: RECONCILE.FASTEST_TIME_DRIFT,
        severity: 'low',
        label: 'TIME SOURCES DIFFER',
        detail:
          `Summary says ${summaryS.toFixed(3)} s; the trace computes ` +
          `${Number(fastestLap.lap_time_s).toFixed(3)} s for the same lap ` +
          `(${drift.toFixed(3)} s apart). The summary value is used.`,
      })
    }
  }

  return { flags, fastestLap, timedCount: timed.length }
}

/**
 * Is this lap the session's fastest, per the authoritative `.ldx` summary?
 *
 * Replaces a bare `lap.lap_no === session.fastest_lap_no`, which marks an
 * out-lap or a non-existent lap as "best" when the summary and trace disagree.
 */
export function isFastestLap(lap, session, laps) {
  const { fastestLap } = reconcile(session, laps)
  return Boolean(fastestLap && lap && fastestLap.lap_no === lap.lap_no)
}

/**
 * The time to display for a lap. `.ldx` wins for the lap it identifies as
 * fastest — that is the whole point of preferring it — and every other lap
 * keeps its trace-computed time, since the `.ldx` carries no other per-lap
 * figure to substitute.
 */
export function displayLapTimeS(lap, session, laps) {
  const { fastestLap } = reconcile(session, laps)
  if (fastestLap && lap && fastestLap.lap_no === lap.lap_no) {
    const s = session?.fastest_lap_s
    if (s != null && Number.isFinite(Number(s))) return Number(s)
  }
  return lap?.lap_time_s ?? null
}
