// ByteCraft Racing — SessionReport (S5 · Step 4).
// The full four-tab session view — Summary / Performance / Instruments /
// Track Map — driven by a single lap selector and a synced distance cursor,
// computed from REAL persisted data (lap summaries + the distance-resampled
// trace blob), not sample data. Replaces the first-pass SessionDetail
// stand-in. Ports the prototype's visual language onto honest data; empty/
// unreliable channels stay flagged, never hidden (standing bar).
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, font } from '../theme'
import { getSession, getSessionTrace } from '../lib/sessions'
import { deltaTrace, fmtDelta } from '../lib/delta'
import { formatSessionDateTime, formatSessionDate } from '../lib/sessionTime'

const TABS = ['Summary', 'Performance', 'Instruments', 'Track Map', 'Channels']


import { reconcile, isFastestLap, displayLapTimeS } from '../lib/lapReconciliation'
import FaultNotice from './FaultNotice'
import ChannelsTab from './ChannelsTab'
import InstrumentCluster from './InstrumentCluster'
import CircuitMap from './CircuitMap'
import { advanceCursor } from '../lib/gauges'
import { buildComparison } from '../lib/sessionCompare'
import { personalBest, thermalPeaks, tyreCompound, circuitHistory } from '../lib/sessionSummary'

// ── formatting ────────────────────────────────────────────────────
function fmtTime(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`
}
const n1 = (v) => (v == null ? '—' : v.toFixed(1))

/**
 * A lap segment is only a lap time if it is bounded by two line crossings.
 * The out-lap (recording start -> first crossing) and the trailing partial lap
 * are shown but never presented as lap times — showing the out-lap's raw
 * duration as "2:54.300" told the driver they set a lap they never set.
 * `kind` rides in the summary jsonb (see lib/ingest.js).
 */
function kindOf(l) {
  return l.summary?.kind ?? (l.valid ? 'timed' : 'partial')
}
/**
 * `session` and `laps` are needed because the fastest lap's time comes from the
 * .ldx summary, not the trace — see lib/lapReconciliation.js. Passing them lets
 * the lap row agree with the "Fastest lap" stat instead of contradicting it by
 * a few hundredths.
 */
function lapLabel(l, session, laps) {
  const k = kindOf(l)
  if (k === 'timed') return fmtTime(displayLapTimeS(l, session, laps))
  return k === 'out' ? 'out-lap — not timed' : 'partial — no finish crossing'
}
const n2 = (v) => (v == null ? '—' : v.toFixed(2))

// ── tiny UI atoms ─────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, ...style }}>
      {children}
    </div>
  )
}
function StatCell({ label, value, unit, color = C.silver3 }) {
  // A unit on an absent value ("— %") is a measurement label with nothing
  // behind it, and reads as a rendering fault rather than as missing data.
  const missing = value === '—' || value === null || value === undefined
  return (
    <div style={{ background: C.panel, padding: '13px 16px' }}>
      <div style={{ fontSize: 9, color: C.dim, letterSpacing: 1.5, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: missing ? C.dim : color, fontFamily: font.mono }}>
        {missing ? '—' : value}
        {unit && !missing ? <span style={{ fontSize: 10, color: C.dim, fontWeight: 400 }}> {unit}</span> : null}
      </div>
    </div>
  )
}

// ── per-lap metrics from the trace points ─────────────────────────
function lapMetrics(pts) {
  if (!pts || !pts.length) return null
  let topSpeed = 0
  let peakLatG = 0
  let peakLongG = 0
  let maxRpm = 0
  let fullThrottle = 0
  for (const p of pts) {
    if (p.s != null && p.s > topSpeed) topSpeed = p.s
    if (p.gl != null && Math.abs(p.gl) > peakLatG) peakLatG = Math.abs(p.gl)
    if (p.glo != null && Math.abs(p.glo) > peakLongG) peakLongG = Math.abs(p.glo)
    if (p.r != null && p.r > maxRpm) maxRpm = p.r
    if (p.t != null && p.t >= 99) fullThrottle++
  }
  return {
    topSpeed,
    peakLatG,
    peakLongG,
    maxRpm,
    fullThrottlePct: (fullThrottle / pts.length) * 100,
  }
}

/** Single-pass min/max — never spread a sample array onto the call stack. */
function extentOf(arrays) {
  let min = Infinity
  let max = -Infinity
  for (const arr of arrays) {
    if (!arr) continue
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]
      if (v == null) continue
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  return Number.isFinite(min) ? { min, max } : null
}

// ── SVG line plot vs distance, with a shared cursor ───────────────
// `refPts` draws a dimmed reference lap behind the selected one (S8). Both
// series share one y-scale, otherwise the overlay would lie about magnitude.
function Plot({ pts, refPts, pick, color, label, unit, cursor, onScrub, height = 92, zero = false }) {
  const W = 1000
  const H = height
  const vals = pts.map(pick)
  const refVals = refPts ? refPts.map(pick) : null
  const present = vals.filter((v) => v != null)
  if (!present.length) {
    return (
      <div style={{ marginBottom: 12 }}>
        <PlotLabel label={label} value="—" unit={unit} color={C.dim} />
        <div style={{ height, border: `1px solid ${C.line}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 11 }}>
          channel empty
        </div>
      </div>
    )
  }
  // One scale spanning both series so the overlay is comparable by eye.
  const ext = extentOf([vals, refVals])
  let lo = ext.min
  let hi = ext.max
  if (zero) lo = Math.min(0, lo)
  if (hi === lo) hi = lo + 1
  const x = (i) => (i / (pts.length - 1)) * W
  const y = (v) => H - 6 - ((v - lo) / (hi - lo)) * (H - 12)
  const toPath = (arr) =>
    arr
      .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ')
  const d = toPath(vals)
  const dRef = refVals ? toPath(refVals) : null
  const cx = x(cursor)
  const cVal = vals[cursor]
  return (
    <div style={{ marginBottom: 12 }}>
      <PlotLabel label={label} value={cVal == null ? '—' : (Number.isInteger(cVal) ? cVal : cVal.toFixed(1))} unit={unit} color={color} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, border: `1px solid ${C.line}`, borderRadius: 8, background: C.bg, display: 'block', cursor: 'crosshair' }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
          onScrub(Math.round(frac * (pts.length - 1)))
        }}
      >
        {zero && lo < 0 && (
          <line x1="0" y1={y(0)} x2={W} y2={y(0)} stroke={C.line} strokeWidth="1" />
        )}
        {dRef && (
          <polyline points={dRef} fill="none" stroke={C.silver2} strokeWidth="1.5" strokeOpacity="0.45"
            strokeDasharray="5 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
        <polyline points={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <line x1={cx} y1="0" x2={cx} y2={H} stroke={C.silver3} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        {cVal != null && <circle cx={cx} cy={y(cVal)} r="3" fill={color} />}
      </svg>
    </div>
  )
}
/**
 * Cumulative delta-time trace (S8). Each segment is coloured by sign, so a
 * driver reads WHERE time is won or lost, not just the final gap: below the
 * zero line (green) the selected lap is ahead of the reference, above it
 * (red) it is behind.
 */
function DeltaPlot({ delta, cursor, onScrub, refLabel }) {
  const W = 1000
  const H = 104
  const ext = extentOf([delta])
  // Symmetric scale around zero keeps "above/below the line" honest.
  const mag = Math.max(Math.abs(ext.min), Math.abs(ext.max), 0.05)
  const lo = -mag
  const hi = mag
  const x = (i) => (i / (delta.length - 1)) * W
  const y = (v) => H - 6 - ((v - lo) / (hi - lo)) * (H - 12)
  const final = delta[delta.length - 1]
  const cVal = delta[cursor]

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ fontSize: 10, letterSpacing: 1, color: C.dim, textTransform: 'uppercase' }}>
          Δ time vs {refLabel}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: cVal > 0 ? C.danger : C.good }}>
          {fmtDelta(cVal)}<span style={{ color: C.dim, fontWeight: 400 }}> s at cursor · finish {fmtDelta(final)} s</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: '100%', height: H, border: `1px solid ${C.line}`, borderRadius: 8, background: C.bg, display: 'block', cursor: 'crosshair' }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
          onScrub(Math.round(frac * (delta.length - 1)))
        }}
      >
        <line x1="0" y1={y(0)} x2={W} y2={y(0)} stroke={C.line} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {delta.slice(1).map((v, i) => (
          <line
            key={i}
            x1={x(i)} y1={y(delta[i])} x2={x(i + 1)} y2={y(v)}
            stroke={(delta[i] + v) / 2 > 0 ? C.danger : C.good}
            strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke"
          />
        ))}
        <line x1={x(cursor)} y1="0" x2={x(cursor)} y2={H} stroke={C.silver3} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <circle cx={x(cursor)} cy={y(cVal)} r="3" fill={cVal > 0 ? C.danger : C.good} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: C.dim, marginTop: 3 }}>
        <span>start of lap</span>
        <span style={{ color: C.good }}>below the line = gaining</span>
        <span style={{ color: C.danger }}>above = losing</span>
        <span>finish</span>
      </div>
    </div>
  )
}

function PlotLabel({ label, value, unit, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
      <span style={{ fontSize: 10, letterSpacing: 1, color: C.dim, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 12, color, fontWeight: 700 }}>
        {value}<span style={{ color: C.dim, fontWeight: 400 }}> {unit}</span>
      </span>
    </div>
  )
}

// ── GPS track map, colored by speed, with the cursor dot ──────────
// ── main ──────────────────────────────────────────────────────────
export default function SessionReport({ sessionId, sessions = [], onBack }) {
  const [state, setState] = useState({ loading: true, error: null, session: null, laps: [], trace: null })
  const [tab, setTab] = useState('Summary')
  const [lapNo, setLapNo] = useState(null)
  const [refLapNo, setRefLapNo] = useState(null) // S8: comparison lap ('' = none)
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { session, laps } = await getSession(sessionId)
        const trace = await getSessionTrace(session).catch(() => null)
        if (!active) return
        // Open on the fastest lap only if it actually exists in the trace. The
        // .ldx summary can name a lap the .ld does not contain (the seeded demo
        // does exactly this), and selecting it leaves the lap picker pointing at
        // nothing. See lib/lapReconciliation.js.
        const { fastestLap } = reconcile(session, laps)
        const firstLap =
          fastestLap?.lap_no ?? trace?.laps?.[0]?.lap ?? laps[0]?.lap_no ?? null
        setLapNo(firstLap)
        setState({ loading: false, error: null, session, laps, trace })
      } catch (err) {
        if (active) setState({ loading: false, error: err, session: null, laps: [], trace: null })
      }
    })()
    return () => {
      active = false
    }
  }, [sessionId])

  const traceLap = useMemo(() => {
    if (!state.trace) return null
    return state.trace.laps.find((l) => l.lap === lapNo) ?? state.trace.laps[0] ?? null
  }, [state.trace, lapNo])

  const refTraceLap = useMemo(() => {
    if (!state.trace || refLapNo == null || refLapNo === lapNo) return null
    return state.trace.laps.find((l) => l.lap === refLapNo) ?? null
  }, [state.trace, refLapNo, lapNo])

  const pts = useMemo(() => traceLap?.pts ?? [], [traceLap])
  const refPts = useMemo(() => refTraceLap?.pts ?? null, [refTraceLap])
  const metrics = useMemo(() => lapMetrics(pts), [pts])
  // null when either lap has no recorded time — no fabricated comparison.
  const delta = useMemo(() => deltaTrace(traceLap, refTraceLap), [traceLap, refTraceLap])

  // keep the cursor in range when the lap changes
  useEffect(() => {
    setCursor((c) => (pts.length ? Math.min(c, pts.length - 1) : 0))
  }, [pts.length])

  if (state.loading) return <div style={{ color: C.dim }}>Loading…</div>
  if (state.error) return <FaultNotice error={state.error} />

  const { session, laps, trace } = state
  const channels = session.summary?.channels ?? []
  const flagged = channels.filter((c) => c.allZero || !c.reliable)

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 13, marginBottom: 14, padding: 0, fontFamily: font.ui }}>
        ← Back to sessions
      </button>

      <h1 style={{ color: C.silver3, fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>
        {session.venue} — {session.car}
        {session.is_demo && (
          <span style={{ color: C.pink, fontSize: 11, fontWeight: 700, marginLeft: 10, letterSpacing: 0.5 }}>DEMO SESSION</span>
        )}
      </h1>
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 16px' }}>
        {session.car_class} · {session.ruleset} · {session.session_type} ·{' '}
        {formatSessionDateTime(session.recorded_at)}
      </p>

      {/* lap selector + tab bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: C.dim, letterSpacing: 1, textTransform: 'uppercase' }}>Lap</span>
          <select
            value={lapNo ?? ''}
            onChange={(e) => setLapNo(Number(e.target.value))}
            style={{ background: C.panel, color: C.silver3, border: `1px solid ${C.line}`, borderRadius: 6, padding: '5px 8px', fontFamily: font.mono, fontSize: 13 }}
          >
            {laps.map((l) => (
              <option key={l.id} value={l.lap_no}>
                Lap {l.lap_no}{isFastestLap(l, session, laps) ? ' ★' : ''} — {lapLabel(l, session, laps)}
              </option>
            ))}
          </select>
        </div>

        {/* S8 — reference lap for the overlay + delta trace. Only laps with a
            recorded time can be compared against; an in-progress lap has no
            duration to difference. */}
        {laps.length > 1 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.dim, letterSpacing: 1, textTransform: 'uppercase' }}>vs</span>
            <select
              value={refLapNo ?? ''}
              onChange={(e) => setRefLapNo(e.target.value === '' ? null : Number(e.target.value))}
              style={{ background: C.panel, color: refLapNo == null ? C.dim : C.silver3, border: `1px solid ${C.line}`, borderRadius: 6, padding: '5px 8px', fontFamily: font.mono, fontSize: 13 }}
            >
              <option value="">no comparison</option>
              {laps
                .filter((l) => l.valid && l.lap_time_s != null && l.lap_no !== lapNo)
                .map((l) => (
                  <option key={l.id} value={l.lap_no}>
                    Lap {l.lap_no}{session.fastest_lap_no === l.lap_no ? ' ★' : ''} — {fmtTime(l.lap_time_s)}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? C.pink : 'transparent',
                color: tab === t ? '#0A0A0C' : C.silver2,
                border: `1px solid ${tab === t ? C.pink : C.line}`,
                borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: font.ui,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Summary' && (
        <SummaryTab session={session} laps={laps} channels={channels} flagged={flagged} metrics={metrics} traceLap={traceLap} sessions={sessions} />
      )}
      {tab === 'Channels' && <ChannelsTab channels={channels} />}

      {tab === 'Performance' && (
        <PerformanceTab metrics={metrics} pts={pts} lapValid={!!traceLap} session={session} sessions={sessions} />
      )}
      {(tab === 'Instruments' || tab === 'Track Map') && !trace && (
        <div style={{ color: C.dim, fontSize: 13, padding: 20, border: `1px dashed ${C.line}`, borderRadius: 12 }}>
          Trace unavailable for this session (uploaded before trace capture, or still ingesting).
        </div>
      )}
      {tab === 'Instruments' && trace && (
        <InstrumentsTab
          pts={pts}
          refPts={refPts}
          delta={delta}
          refLabel={refTraceLap ? `lap ${refTraceLap.lap}` : null}
          cursor={cursor}
          setCursor={setCursor}
          lapSeconds={displayLapTimeS(laps.find((l) => l.lap_no === lapNo), session, laps)}
        />
      )}
      {tab === 'Track Map' && trace && (
        <TrackMapTab pts={pts} aspect={trace.aspect} cursor={cursor} setCursor={setCursor} />
      )}
    </div>
  )
}

// ── Summary ───────────────────────────────────────────────────────
function SummaryTab({ session, laps, channels, flagged, metrics, traceLap, sessions = [] }) {
  const pb = personalBest(sessions, session)
  const thermal = thermalPeaks(channels)
  const compound = tyreCompound(session.setup)
  const history = circuitHistory(sessions, session)
  const silhouette = traceLap?.pts?.filter((p) => p.x != null) ?? []
  const sw = 200
  const sh = Math.round(200 * (session.summary && silhouette.length ? 0.6 : 0.6))
  const sil = silhouette.map((p) => `${8 + p.x * (sw - 16)},${6 + (1 - p.y) * (sh - 12)}`).join(' ')
  return (
    <>
      <Card style={{ overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.silver3 }}>{(session.venue ?? '').toUpperCase()}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>
              {session.car} · <span style={{ color: C.pink }}>{session.car_class}</span> {session.ruleset}
            </div>
          </div>
          {sil && (
            <svg width={sw} height={sh} style={{ flexShrink: 0, opacity: 0.9 }}>
              <polyline points={sil} fill="none" stroke={C.silver3} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: C.line }}>
          <StatCell label="Circuit length" value={session.length_km ? session.length_km.toFixed(2) : '—'} unit="km" />
          <StatCell label="Laps this run" value={session.lap_count ?? laps.length} />
          <StatCell
            label={pb?.isCurrent ? 'Personal best (this run)' : 'Personal best'}
            value={pb ? fmtTime(pb.timeS) : '—'}
            color={C.pink}
          />
          <StatCell label="Full throttle" value={metrics ? n1(metrics.fullThrottlePct) : '—'} unit="%" color={C.warn} />
        </div>

        {/* Compound + thermals on the left, the circuit's history on the right —
            the prototype's lower band, over real persisted data. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(240px, 1.4fr)', gap: 1, background: C.line }}>
          <div style={{ background: C.panel, padding: '13px 16px' }}>
            <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1.5, marginBottom: 7 }}>TYRE COMPOUND</div>
            {compound ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${C.pink}`,
                               display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                               fontSize: 10, fontWeight: 800, color: C.pink }}>
                  {compound.compound.slice(0, 1).toUpperCase()}
                </span>
                <span style={{ fontSize: 12, color: C.silver2 }}>
                  {compound.compound}
                  {compound.uniform ? ' — all four corners' : ' — corners differ'}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.dim }}>Not in this setup export</div>
            )}

            <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1.5, margin: '12px 0 6px' }}>THERMAL PEAK</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {thermal.map((t) => (
                <span key={t.key} style={{ fontSize: 11, color: C.silver2, fontFamily: font.mono }}>
                  {t.label}{' '}
                  {t.value === null ? (
                    <b style={{ color: C.dim, fontWeight: 400 }}>—</b>
                  ) : (
                    <b style={{ color: t.key === 'brake' ? C.warn : C.good }}>{Math.round(t.value)}°</b>
                  )}
                </span>
              ))}
            </div>
          </div>

          <div style={{ background: C.panel, padding: '13px 16px' }}>
            <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1.5, marginBottom: 8 }}>
              SESSION HISTORY · THIS CIRCUIT
            </div>
            {history.length <= 1 ? (
              <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>
                This is your first session here in this car. The history builds as you upload more.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map((h) => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                                   background: h.isCurrent ? C.pinkBg : C.panel2,
                                   border: `1px solid ${h.isCurrent ? C.pinkBd : C.line}`,
                                   display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                   fontSize: 10, fontWeight: 800, color: h.isCurrent ? C.pink : C.silver2 }}>
                      {(h.sessionType ?? '?').slice(0, 1).toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: h.isCurrent ? C.silver3 : C.silver2, minWidth: 78 }}>
                      {h.sessionType ?? 'session'}{h.isCurrent ? ' (this)' : ''}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: font.mono, color: h.isCurrent ? C.pink : C.silver2 }}>
                      {h.timeS ? fmtTime(h.timeS) : '—'}
                    </span>
                    <span style={{ fontSize: 9, color: C.dim, marginLeft: 'auto' }}>
                      {formatSessionDate(h.recordedAt) || ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <ReconcileFlags session={session} laps={laps} />

      <h2 style={{ color: C.silver3, fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>Laps</h2>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        {laps.map((l) => {
          // Not `session.fastest_lap_no === l.lap_no`: on a session whose
          // summary names a lap the trace does not contain, that marks nothing
          // and explains nothing. See lib/lapReconciliation.js.
          const best = isFastestLap(l, session, laps)
          return (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: `1px solid ${C.line}`, background: best ? C.pinkBg : 'transparent', fontFamily: font.mono, fontSize: 13 }}>
              <span style={{ color: best ? C.pink : C.silver2 }}>
                Lap {l.lap_no} {best ? '★' : ''}
                {kindOf(l) !== 'timed' && (
                  <span style={{ marginLeft: 8, fontSize: 9, letterSpacing: 1, color: C.warn,
                                 border: `1px solid ${C.warn}55`, borderRadius: 4, padding: '1px 6px' }}>
                    {kindOf(l) === 'out' ? 'OUT-LAP' : 'PARTIAL'}
                  </span>
                )}
              </span>
              <span style={{ color: C.dim }}>{lapLabel(l, session, laps)}</span>
            </div>
          )
        })}
      </div>

      {/* The inventory moved to its own Channels tab (25 Aug 2026). It was 70
          rows below the lap table with no way to search it; Summary is a
          summary again, and the inventory got a search box worth having. */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '13px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: C.silver3, fontSize: 13, fontWeight: 700 }}>
            {channels.length} channels decoded
          </div>
          <div style={{ color: C.dim, fontSize: 11.5, marginTop: 2 }}>
            {flagged.length > 0
              ? `${flagged.length} flagged as empty or unreliable — listed, never hidden`
              : 'None flagged'}
          </div>
        </div>
        <span style={{ marginLeft: 'auto', color: C.dim, fontSize: 11.5 }}>
          See the <strong style={{ color: C.silver2 }}>Channels</strong> tab
        </span>
      </div>
    </>
  )
}
/**
 * Surfaces disagreements between the .ldx summary and the .ld trace.
 *
 * The .ldx wins — it is the more precise source and the reason we prefer it —
 * but a headline figure its own lap table cannot corroborate has to say so.
 * WORKING_PLAN §4: unreliable data is flagged, never hidden. Renders nothing
 * when the two sources agree, which is the normal case.
 */
function ReconcileFlags({ session, laps }) {
  const { flags } = reconcile(session, laps)
  if (flags.length === 0) return null

  const tone = {
    high: { fg: C.danger, bd: 'rgba(255,85,85,0.35)', bg: 'rgba(255,85,85,0.08)' },
    medium: { fg: C.warn, bd: 'rgba(232,194,74,0.35)', bg: 'rgba(232,194,74,0.08)' },
    low: { fg: C.silver2, bd: C.line, bg: 'rgba(255,255,255,0.02)' },
  }

  return (
    <div style={{ marginBottom: 14, display: 'grid', gap: 7 }}>
      {flags.map((f) => {
        const t = tone[f.severity] ?? tone.low
        return (
          <div
            key={f.code}
            style={{
              border: `1px solid ${t.bd}`,
              background: t.bg,
              borderRadius: 8,
              padding: '9px 12px',
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1.2,
                color: t.fg,
                marginBottom: 4,
              }}
            >
              ⚑ {f.label}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: C.dim }}>{f.detail}</div>
          </div>
        )
      })}
    </div>
  )
}


// ── Performance ───────────────────────────────────────────────────
/**
 * One metric's movement against a reference.
 *
 * The arrow always points the way the number MOVED; colour carries the
 * verdict. A driver reading ▼ never has to work out whether down is good here,
 * and a metric with no verdict (brake temp, RPM) simply is not coloured rather
 * than being assigned an opinion the telemetry does not support.
 */
function DeltaChip({ d, dp, hasVerdict }) {
  if (!d) return <span style={{ minWidth: 108 }} />
  const same = d.direction === 'same'
  const col = same || !hasVerdict ? C.dim : d.better ? C.good : C.danger
  const arrow = same ? '=' : d.direction === 'up' ? '▲' : '▼'
  return (
    <span style={{ minWidth: 108, textAlign: 'right', fontFamily: font.mono, fontSize: 11, color: col }}>
      {arrow} {same ? '0' : d.magnitude.toFixed(dp)}
    </span>
  )
}

/**
 * Session peaks against the driver's own history at this venue and car.
 *
 * Drawn from sessions.summary.channels, which the garage list already holds —
 * so this costs no extra query and no trace downloads. See lib/sessionCompare.
 */
function ComparisonPanel({ session, sessions }) {
  const rows = buildComparison(session, sessions)
  const anyHistory = rows.some((r) => r.history)

  return (
    <Card style={{ padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: C.silver3 }}>
          SESSION PEAKS · VS YOUR HISTORY
        </div>
        <div style={{ fontSize: 10.5, color: C.dim }}>
          {session.venue} · {session.car}
        </div>
      </div>
      <p style={{ fontSize: 11, color: C.dim, margin: '0 0 10px', lineHeight: 1.5 }}>
        {anyHistory
          ? 'Compared against your own previous sessions in the same car at this circuit.'
          : 'No previous session in this car at this circuit yet — the comparison appears once you have one.'}
      </p>
      {rows.map((r) => (
        <div
          key={r.key}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.line}` }}
        >
          <span style={{ fontSize: 12.5, color: C.silver2, flex: 1 }}>{r.label}</span>
          <DeltaChip d={r.vsHistory} dp={r.dp} hasVerdict={r.higherBetter !== null} />
          <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 800, color: C.pink, minWidth: 104, textAlign: 'right' }}>
            {r.value === null ? (
              <span style={{ color: C.dim, fontWeight: 400, fontSize: 12 }}>not in this export</span>
            ) : (
              <>
                {r.value.toFixed(r.dp)}
                <span style={{ fontSize: 10, color: C.dim, fontWeight: 400 }}> {r.unit}</span>
              </>
            )}
          </span>
        </div>
      ))}
      {anyHistory && (
        <div style={{ fontSize: 9.5, color: C.dim, marginTop: 8, fontStyle: 'italic' }}>
          History averaged over{' '}
          {Math.max(...rows.filter((r) => r.history).map((r) => r.history.n))} previous session(s).
          Seeded demo sessions are excluded.
        </div>
      )}
    </Card>
  )
}

function PerformanceTab({ metrics, pts, lapValid, session, sessions }) {
  // The comparison needs no trace at all — it reads persisted channel peaks —
  // so it must still render when the trace is missing. Previously this early
  // return blanked the whole tab.
  const comparison = session ? <ComparisonPanel session={session} sessions={sessions} /> : null
  if (!lapValid || !metrics) {
    return (
      <>
        {comparison}
        <div style={{ color: C.dim, fontSize: 13, padding: 20 }}>
          No trace for this lap — per-lap metrics need the trace blob.
        </div>
      </>
    )
  }
  // time-share in speed bands, computed from the lap's own points
  const bands = [
    { label: 'Low (< 100 km/h)', test: (s) => s < 100, col: C.pink },
    { label: 'Medium (100–200)', test: (s) => s >= 100 && s < 200, col: C.warn },
    { label: 'High (≥ 200 km/h)', test: (s) => s >= 200, col: C.blue },
  ]
  const total = pts.length || 1
  const bandPct = bands.map((b) => ({ ...b, pct: (pts.filter((p) => b.test(p.s ?? 0)).length / total) * 100 }))
  return (
    <>
    {comparison}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: C.silver3, marginBottom: 12 }}>CAR PERFORMANCE — THIS LAP</div>
        {[
          ['Top speed', n1(metrics.topSpeed), 'km/h', C.pink],
          ['Peak lateral G', n2(metrics.peakLatG), 'G', C.silver3],
          ['Peak longitudinal G', n2(metrics.peakLongG), 'G', C.silver3],
          ['Max RPM', metrics.maxRpm ? Math.round(metrics.maxRpm) : '—', 'rpm', C.silver3],
          ['Full-throttle share', n1(metrics.fullThrottlePct), '%', C.warn],
        ].map(([label, value, unit, col]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 12.5, color: C.silver2 }}>{label}</span>
            <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 800, color: col }}>{value}<span style={{ fontSize: 10, color: C.dim, fontWeight: 400 }}> {unit}</span></span>
          </div>
        ))}
      </Card>
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: C.silver3, marginBottom: 12 }}>SPEED PROFILE</div>
        {bandPct.map((b) => (
          <div key={b.label} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: b.col, letterSpacing: 0.5 }}>{b.label}</span>
              <span style={{ fontSize: 11, color: C.dim, fontFamily: font.mono }}>{b.pct.toFixed(0)}%</span>
            </div>
            <div style={{ height: 8, background: C.panel2, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${b.pct}%`, height: '100%', background: b.col, borderRadius: 4 }} />
            </div>
          </div>
        ))}
        <div style={{ fontSize: 9, color: C.dim, fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
          Share of the lap's distance-sampled points in each speed band, from the decoded Ground Speed channel.
        </div>
      </Card>
    </div>
    </>
  )
}

// ── Instruments ───────────────────────────────────────────────────
/**
 * Play/pause transport for the replay.
 *
 * Driven by requestAnimationFrame rather than an interval so playback tracks
 * real elapsed time: a dropped frame slows an interval-based replay
 * permanently, while rAF simply advances further on the next tick.
 *
 * The persisted trace indexes by DISTANCE fraction, not seconds, so the lap's
 * own time is what makes real-time playback possible at all.
 */
function useReplay(pointCount, lapSeconds, setCursor) {
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const frame = useRef(0)
  const last = useRef(0)
  const pos = useRef(0)

  const canPlay = pointCount > 1 && Number.isFinite(Number(lapSeconds)) && Number(lapSeconds) > 0

  useEffect(() => {
    if (!playing || !canPlay) return
    const tick = (ts) => {
      if (!last.current) last.current = ts
      const dt = (ts - last.current) / 1000
      last.current = ts
      pos.current = advanceCursor(pos.current, pointCount, dt, lapSeconds, rate)
      setCursor(Math.floor(pos.current))
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame.current)
      last.current = 0
    }
  }, [playing, rate, pointCount, lapSeconds, setCursor, canPlay])

  // Scrubbing by hand takes over: keep playback from snapping back to where
  // the animation had got to.
  const seek = (i) => {
    pos.current = i
    setCursor(i)
  }

  return { playing, setPlaying, rate, setRate, canPlay, seek }
}

function InstrumentsTab({ pts, refPts, delta, refLabel, cursor, setCursor, lapSeconds }) {
  const replay = useReplay(pts.length, lapSeconds, setCursor)
  if (!pts.length) return <div style={{ color: C.dim, padding: 20 }}>No trace for this lap.</div>
  const P = { pts, refPts, cursor, onScrub: replay.seek }
  return (
    <Card style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: C.silver3 }}>INSTRUMENTS — scrub by distance</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {refPts && (
            <span style={{ fontSize: 10, color: C.dim, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 16, height: 0, borderTop: `1.5px dashed ${C.silver2}`, opacity: 0.7 }} />
              {refLabel}
            </span>
          )}
          <span style={{ fontFamily: font.mono, fontSize: 12, color: C.pink }}>{(pts[cursor]?.d * 100).toFixed(1)}% of lap</span>
        </div>
      </div>
      {/* Transport + scrubber. Playing is disabled rather than hidden when the
          lap has no time: hiding it would leave a driver wondering where the
          control went, while a disabled control with a reason explains itself. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => replay.setPlaying(!replay.playing)}
          disabled={!replay.canPlay}
          title={replay.canPlay ? undefined : 'Replay needs a lap time — this lap has none'}
          style={{
            background: replay.playing ? C.pinkBg : C.panel2,
            border: `1px solid ${replay.playing ? C.pinkBd : C.line}`,
            color: !replay.canPlay ? C.dim : replay.playing ? C.pink : C.silver2,
            borderRadius: 7, padding: '6px 13px', fontSize: 11, fontWeight: 700,
            fontFamily: font.ui, cursor: replay.canPlay ? 'pointer' : 'not-allowed',
            opacity: replay.canPlay ? 1 : 0.55,
          }}
        >
          {replay.playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <div style={{ display: 'flex', gap: 3 }}>
          {[0.5, 1, 2].map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => replay.setRate(sp)}
              aria-pressed={replay.rate === sp}
              style={{
                background: replay.rate === sp ? C.pink : C.panel2,
                border: 'none', color: replay.rate === sp ? '#0A0A0C' : C.dim,
                borderRadius: 5, padding: '6px 9px', fontSize: 10, fontWeight: 700,
                fontFamily: font.mono, cursor: 'pointer',
              }}
            >
              {sp}x
            </button>
          ))}
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: C.dim, marginLeft: 'auto' }}>
          {pts.length} samples
        </span>
      </div>
      <input
        type="range" min={0} max={pts.length - 1} value={cursor}
        aria-label="Scrub the lap"
        onChange={(e) => {
          replay.setPlaying(false)
          replay.seek(Number(e.target.value))
        }}
        style={{ width: '100%', marginBottom: 14, accentColor: C.pink }}
      />

      <InstrumentCluster point={pts[Math.min(cursor, pts.length - 1)]} />
      {delta && <DeltaPlot delta={delta} cursor={cursor} onScrub={setCursor} refLabel={refLabel} />}
      {refPts && !delta && (
        <p style={{ fontSize: 11, color: C.warn, marginTop: 0, marginBottom: 12 }}>
          Traces overlaid, but no Δ-time trace: one of these laps has no recorded lap time.
        </p>
      )}
      <Plot {...P} pick={(p) => p.s} color={C.pink} label="Speed" unit="km/h" />
      <Plot {...P} pick={(p) => p.t} color={C.good} label="Throttle" unit="%" height={70} />
      <Plot {...P} pick={(p) => p.b} color={C.danger} label="Brake" unit="%" height={70} />
      <Plot {...P} pick={(p) => p.r} color={C.warn} label="Engine RPM" unit="rpm" height={70} />
      <Plot {...P} pick={(p) => p.g} color={C.blue} label="Gear" unit="" height={56} />
      <Plot {...P} pick={(p) => p.gl} color={C.silver2} label="Lateral G" unit="G" height={70} zero />
      <Plot {...P} pick={(p) => p.glo} color={C.silver3} label="Longitudinal G" unit="G" height={70} zero />
    </Card>
  )
}

// ── Track Map ─────────────────────────────────────────────────────
function TrackMapTab({ pts, aspect, cursor, setCursor }) {
  const cur = pts[cursor]
  return (
    <Card style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: C.silver3 }}>TRACK MAP — corners detected from this lap · hover to scrub</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, color: C.dim }}>
          <span>◔ min corner speed (km/h)</span>
          <span>⚙ gear at apex</span>
        </div>
      </div>
      <CircuitMap pts={pts} aspect={aspect} cursor={cursor} onScrub={setCursor} />
      <input
        type="range" min={0} max={pts.length - 1} value={cursor}
        onChange={(e) => setCursor(Number(e.target.value))}
        style={{ width: '100%', marginTop: 12, accentColor: C.pink }}
      />
      <div style={{ display: 'flex', gap: 18, marginTop: 8, fontFamily: font.mono, fontSize: 12, color: C.silver2, flexWrap: 'wrap' }}>
        <span>{(cur?.d * 100).toFixed(1)}% lap</span>
        <span>{n1(cur?.s)} km/h</span>
        <span>thr {n1(cur?.t)}%</span>
        <span>brk {n1(cur?.b)}%</span>
        <span>gear {cur?.g ?? '—'}</span>
        <span>GPS is game-world (relative positions exact)</span>
      </div>
    </Card>
  )
}
