// ByteCraft Racing — the run averages and the lap-by-lap strip.
//
// The block prototypes/ByteCraft_v12_Merged.jsx calls SESSION DATA DISPLAY, and
// the one the app never had: best 3 / 5 / 7 / 10-lap averages, the stints they
// were taken from, and every lap laid out so the shape of the session is
// visible at a glance.
//
// A RUN IS A STINT, and the maths lives in lib/runs.js with the reasoning. What
// matters here is what the view does with an ABSENT figure. The prototype
// printed "n/a · need 10 laps". This says which stint fell short — "needs 10
// consecutive laps; longest stint was 3" — because on a short practice session
// every figure above 3 is absent, and four identical dashes read as a broken
// panel rather than as an honest answer.
//
// The figures are never approximated downward. "Best five-lap average" means
// five laps in a row; falling back to the best three would answer a different
// question in the same box.
import { useMemo } from 'react'
import { C, font } from '../theme'
import { runAverages, stintSummary, lapTime } from '../lib/runs'
import { displayLapTimeS } from '../lib/lapReconciliation'
import { fmtLap } from '../lib/progression'

const LABEL = { fontSize: 8.5, letterSpacing: 1.4, color: C.dim, fontWeight: 700 }
const SECTION = { fontSize: 9, letterSpacing: 2, color: C.pink, fontWeight: 700, marginBottom: 10 }

function RunCell({ run }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        padding: '11px 13px',
        opacity: run.available ? 1 : 0.55,
      }}
    >
      <div style={LABEL}>BEST {run.size}-LAP AVG</div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 16,
          fontWeight: 800,
          marginTop: 3,
          color: run.available ? C.pink : C.dim,
        }}
      >
        {run.available ? fmtLap(run.avgS) : '—'}
      </div>
      <div style={{ fontSize: 9, color: C.dim, marginTop: 3, lineHeight: 1.4 }}>
        {run.available
          ? `laps ${run.startLapNo}–${run.endLapNo}`
          : `needs ${run.size} consecutive laps; longest stint was ${run.longestStint}`}
      </div>
    </div>
  )
}

export default function SessionRuns({ session, laps }) {
  // RECONCILED FIRST, then averaged. The fastest lap's authoritative time comes
  // from the .ldx summary, not the .ld trace, and the two differ by tens of
  // milliseconds (see lib/lapReconciliation.js). Averaging the raw times would
  // put 2:15.500 in the lap strip directly under a headline reading 2:15.475 —
  // the overview contradicting itself on one screen, which is worse than
  // either number being slightly off.
  const reconciled = useMemo(
    () => (laps ?? []).map((l) => ({ ...l, lap_time_s: displayLapTimeS(l, session, laps) })),
    [laps, session],
  )
  const runs = runAverages(reconciled)
  const stints = stintSummary(reconciled)
  const timed = reconciled.filter(
    (l) => lapTime(l) !== null && (l.summary?.kind ?? (l.valid ? 'timed' : null)) === 'timed',
  )
  const best = timed.length ? Math.min(...timed.map(lapTime)) : null

  if (!timed.length) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={SECTION}>RUN AVERAGES</div>
        <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 16, color: C.dim, fontSize: 12.5 }}>
          No completed laps in this session — an out-lap and a trailing partial are not run material.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={SECTION}>RUN AVERAGES · BEST CONSECUTIVE LAPS</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 9,
          marginBottom: 16,
        }}
      >
        {runs.map((r) => (
          <RunCell key={r.size} run={r} />
        ))}
      </div>

      {/* The stints themselves. Without them, "longest stint was 3" is a claim
          a driver cannot check against anything. */}
      <div style={SECTION}>STINTS</div>
      <ul
        aria-label="Stints in this session"
        style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        {stints.map((s) => (
          <li
            key={s.index}
            style={{
              background: C.panel,
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              padding: '9px 13px',
              minWidth: 132,
            }}
          >
            <div style={LABEL}>
              STINT {s.index} · {s.lapCount} LAP{s.lapCount > 1 ? 'S' : ''}
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 13, color: C.silver3, marginTop: 3 }}>
              {fmtLap(s.avgS)}
              <span style={{ fontSize: 9, color: C.dim, fontWeight: 400 }}> avg</span>
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 9.5, color: C.dim, marginTop: 2 }}>
              laps {s.startLapNo}–{s.endLapNo} · best {fmtLap(s.bestS)}
            </div>
          </li>
        ))}
      </ul>

      <div style={SECTION}>LAP BY LAP</div>
      <ul
        aria-label="Lap times"
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 5, flexWrap: 'wrap' }}
      >
        {timed.map((l) => {
          const t = lapTime(l)
          const isBest = t === best
          return (
            <li
              key={l.lap_no}
              style={{
                background: isBest ? C.pinkBg : C.panel,
                border: `1px solid ${isBest ? C.pink : C.line}`,
                borderRadius: 6,
                padding: '6px 9px',
              }}
            >
              <div style={{ fontSize: 7.5, color: C.dim, letterSpacing: 0.8 }}>L{l.lap_no}</div>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11.5,
                  color: isBest ? C.pink : C.silver2,
                  fontWeight: isBest ? 700 : 400,
                }}
              >
                {fmtLap(t)}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
