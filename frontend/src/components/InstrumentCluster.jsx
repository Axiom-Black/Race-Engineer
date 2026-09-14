// ByteCraft Racing — the instrument cluster at the replay cursor.
//
// Ported from prototypes/ByteCraft_SessionReport.jsx. Its visual grammar is
// kept because it is the right one for telemetry: **the number carries the
// data, colour carries the state**. A gauge that only sweeps an arc forces a
// driver to estimate; a gauge that also prints the value does not.
//
// Everything here reads one trace point. The geometry lives in lib/gauges.js
// so this file is layout only.
//
// RadialGauge / PedalBar / GForceCross are exported because the Track Map's
// own panel (MapInstruments.jsx) shows the subset of these that a position on
// track explains. Two sets of dials that looked almost the same would be worse
// than one set used twice.
import { C, font } from '../theme'
import { useUnits } from '../lib/useUnits'
import {
  gaugeFraction, arcPath, polar, gearLabel, slipSeverity, gCrossPosition,
} from '../lib/gauges'

const SWEEP_START = -135
const SWEEP_END = 135

/**
 * A radial gauge.
 *
 * `unit` is the CANONICAL SI unit ('km/h', 'rpm') and is displayed uppercased,
 * so the conversion table can key on it. The needle fraction stays in SI:
 * `value` and `max` are both stored units, and for the linear quantities a
 * gauge shows, the ratio is identical after conversion — converting both would
 * be work that moved nothing.
 */
export function RadialGauge({ value, max, label, unit, color, size = 118 }) {
  const { format } = useUnits()
  const r = size / 2 - 9
  const c = size / 2
  const f = gaugeFraction(value, max)
  const shown = unit ? format(value, unit, 0) : null
  const track = arcPath(c, c, r, SWEEP_START, SWEEP_END, 1)
  const fill = arcPath(c, c, r, SWEEP_START, SWEEP_END, f ?? 0)
  const tip = f === null ? null : polar(c, c, r, SWEEP_START + (SWEEP_END - SWEEP_START) * f)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} role="img" aria-label={`${label} gauge`}>
        <path d={track} fill="none" stroke={C.line} strokeWidth="7" strokeLinecap="round" />
        {fill && <path d={fill} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" />}
        {tip && <circle cx={tip.x} cy={tip.y} r="3.5" fill={color} />}
        <text
          x={c} y={c + 2} textAnchor="middle"
          style={{ fontFamily: font.mono, fontSize: 21, fontWeight: 800, fill: f === null ? C.dim : C.silver3 }}
        >
          {f === null ? '—' : (shown ? shown.text : Math.round(Number(value)))}
        </text>
        <text
          x={c} y={c + 18} textAnchor="middle"
          style={{ fontFamily: font.ui, fontSize: 8.5, letterSpacing: 1.2, fill: C.dim }}
        >
          {(shown ? shown.unit : unit).toUpperCase()}
        </text>
      </svg>
      <span style={{ fontSize: 9, letterSpacing: 1.2, color: C.dim, fontWeight: 700 }}>{label}</span>
    </div>
  )
}

export function PedalBar({ value, label, color, height = 96 }) {
  const f = gaugeFraction(value, 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div
        style={{ width: 16, height, background: C.panel2, borderRadius: 8, overflow: 'hidden',
                 display: 'flex', alignItems: 'flex-end', border: `1px solid ${C.line}` }}
        role="img"
        aria-label={`${label} ${f === null ? 'no reading' : `${Math.round(Number(value))} percent`}`}
      >
        <div style={{ width: '100%', height: `${(f ?? 0) * 100}%`, background: color }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: font.mono, color: f === null ? C.dim : C.silver2 }}>
        {f === null ? '—' : `${Math.round(Number(value))}%`}
      </span>
      <span style={{ fontSize: 8.5, letterSpacing: 1.2, color: C.dim, fontWeight: 700 }}>{label}</span>
    </div>
  )
}

const G_MAX = 2.5

export function GForceCross({ lat, long, size = 112 }) {
  const pos = gCrossPosition(lat, long, G_MAX)
  const c = size / 2
  const r = c - 8
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <svg width={size} height={size} role="img" aria-label="G force">
        <circle cx={c} cy={c} r={r} fill="none" stroke={C.line} strokeWidth="1" />
        <circle cx={c} cy={c} r={r / 2} fill="none" stroke={C.line} strokeWidth="1" strokeDasharray="3 3" />
        <line x1={c - r} y1={c} x2={c + r} y2={c} stroke={C.line} strokeWidth="1" />
        <line x1={c} y1={c - r} x2={c} y2={c + r} stroke={C.line} strokeWidth="1" />
        {pos && (
          // SIGN CONVENTION, measured from the real export rather than assumed
          // (25 Aug 2026): in LMU, BRAKING gives POSITIVE `G Force Long` —
          // mean +1.63 G with brake > 70%, versus -0.24 G off the brakes.
          // Subtracting therefore puts braking at the TOP of the cross, which
          // is the motorsport convention and how a driver pictures the load.
          // Do not "fix" this to an addition without re-measuring.
          <circle cx={c + pos.x * r} cy={c - pos.y * r} r="5" fill={C.pink} />
        )}
      </svg>
      <span style={{ fontSize: 10, fontFamily: font.mono, color: pos ? C.silver2 : C.dim }}>
        {pos ? `${Number(lat).toFixed(2)} / ${Number(long).toFixed(2)} G` : '—'}
      </span>
      <span style={{ fontSize: 8.5, letterSpacing: 1.2, color: C.dim, fontWeight: 700 }}>LAT / LONG</span>
    </div>
  )
}

const SLIP_COLOR = { ok: C.good, warn: C.warn, high: C.danger, unknown: C.dim }
const CORNERS = ['FL', 'FR', 'RL', 'RR']

function SlipGrid({ slip }) {
  const values = Array.isArray(slip) ? slip : []
  return (
    <div style={{ minWidth: 168 }}>
      <div style={{ fontSize: 8.5, color: C.dim, letterSpacing: 1.4, marginBottom: 7, fontWeight: 700 }}>
        WHEEL SLIP · FROM ROT SPEED
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {CORNERS.map((corner, i) => {
          const v = values[i]
          const sev = slipSeverity(v)
          const col = SLIP_COLOR[sev]
          const pct = gaugeFraction(Math.abs(Number(v) || 0), 20) ?? 0
          return (
            <div key={corner} style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: C.dim }}>{corner}</span>
                <span style={{ fontSize: 11, fontFamily: font.mono, fontWeight: 700, color: col }}>
                  {sev === 'unknown' ? '—' : `${Number(v).toFixed(1)}%`}
                </span>
              </div>
              <div style={{ height: 3, background: C.line, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', background: col }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The whole cluster for one trace point. */
export default function InstrumentCluster({ point, maxSpeed = 260, maxRpm = 8000, redline = 7200 }) {
  if (!point) return null
  const rpm = Number(point.r)
  const overRedline = Number.isFinite(rpm) && rpm > redline

  return (
    <div
      style={{
        display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap',
        padding: '14px 4px', borderBottom: `1px solid ${C.line}`, marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <RadialGauge value={point.s} max={maxSpeed} label="SPEED" unit="km/h" color={C.pink} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.panel2, borderRadius: 8, padding: '3px 13px' }}>
          <span style={{ fontSize: 8.5, color: C.dim, letterSpacing: 1.2, fontWeight: 700 }}>GEAR</span>
          <span style={{ fontSize: 19, fontWeight: 900, color: C.blue, fontFamily: font.mono }}>
            {gearLabel(point.g)}
          </span>
        </div>
      </div>

      <RadialGauge
        value={point.r}
        max={maxRpm}
        label="ENGINE"
        unit="rpm"
        // Shift light: the cluster's one piece of judgement, and it is a fact
        // about the engine rather than about the driving.
        color={overRedline ? C.danger : C.warn}
        size={104}
      />

      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <PedalBar value={point.t} label="THR" color={C.good} />
        <PedalBar value={point.b} label="BRK" color={C.danger} />
        <GForceCross lat={point.gl} long={point.glo} />
      </div>

      <SlipGrid slip={point.sl} />
    </div>
  )
}
