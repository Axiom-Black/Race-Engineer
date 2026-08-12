// ByteCraft Racing — session detail, first pass (S5 back half).
// Header + lap table + the full 70-channel inventory with reliability/
// all-zero flags RENDERED (not just carried in data) — closing the gap the
// prototype review found: earlier mockups had these flags in their sample
// data but no UI ever surfaced them. The tabbed Summary/Performance/
// Instruments/Track Map dashboard (replay, G-force plots, the distance-
// resampled trace blob, track map) is Step 4 of the S5 plan — this view
// proves the pipeline end-to-end honestly first.
import { useEffect, useState } from 'react'
import { C, font } from '../theme'
import { getSession } from '../lib/sessions'

function fmtTime(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const rest = (s % 60).toFixed(3).padStart(6, '0')
  return `${m}:${rest}`
}

function Flag({ kind, children }) {
  const map = {
    empty: { fg: C.warn, bd: 'rgba(232,194,74,0.35)', bg: 'rgba(232,194,74,0.1)' },
    unreliable: { fg: C.danger, bd: 'rgba(255,85,85,0.35)', bg: 'rgba(255,85,85,0.1)' },
  }[kind]
  return (
    <span
      style={{
        display: 'inline-block',
        border: `1px solid ${map.bd}`,
        background: map.bg,
        color: map.fg,
        borderRadius: 4,
        padding: '1px 6px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        marginLeft: 6,
      }}
    >
      {children}
    </span>
  )
}

export default function SessionDetail({ sessionId, onBack }) {
  const [state, setState] = useState({ loading: true, error: '', session: null, laps: [] })

  useEffect(() => {
    let active = true
    getSession(sessionId)
      .then(({ session, laps }) => active && setState({ loading: false, error: '', session, laps }))
      .catch((err) => active && setState({ loading: false, error: err.message, session: null, laps: [] }))
    return () => {
      active = false
    }
  }, [sessionId])

  if (state.loading) return <div style={{ color: C.dim }}>Loading…</div>
  if (state.error) return <div style={{ color: C.danger }}>{state.error}</div>

  const { session, laps } = state
  const channels = session.summary?.channels ?? []
  const flagged = channels.filter((c) => c.allZero || !c.reliable)

  return (
    <div>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0, fontFamily: font.ui }}
      >
        ← Back to sessions
      </button>

      <h1 style={{ color: C.silver3, fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
        {session.venue} — {session.car}
        {session.is_demo && (
          <span style={{ color: C.pink, fontSize: 11, fontWeight: 700, marginLeft: 10, letterSpacing: 0.5 }}>
            DEMO SESSION
          </span>
        )}
      </h1>
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 20px' }}>
        {session.car_class} · {session.ruleset} · {session.session_type} ·{' '}
        {session.recorded_at ? new Date(session.recorded_at).toLocaleString() : '—'}
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {[
          ['Fastest lap', fmtTime(session.fastest_lap_s)],
          ['Total laps', session.lap_count ?? '—'],
          ['Length', session.length_km ? `${session.length_km.toFixed(2)} km` : '—'],
          ['Energy', session.energy_scheme],
          ['Channels', `${channels.length} (${flagged.length} flagged)`],
        ].map(([label, value]) => (
          <div key={label} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: '12px 16px', flex: 1 }}>
            <div style={{ color: C.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ color: C.silver3, fontSize: 16, fontWeight: 700, marginTop: 4, fontFamily: font.mono }}>{value}</div>
          </div>
        ))}
      </div>

      <h2 style={{ color: C.silver3, fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>Laps</h2>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        {laps.map((l) => {
          const isBest = session.fastest_lap_no != null && l.lap_no === session.fastest_lap_no
          return (
            <div
              key={l.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 14px',
                borderBottom: `1px solid ${C.line}`,
                background: isBest ? C.pinkBg : 'transparent',
                fontFamily: font.mono,
                fontSize: 13,
              }}
            >
              <span style={{ color: isBest ? C.pink : C.silver2 }}>
                Lap {l.lap_no} {isBest ? '★' : ''}
              </span>
              <span style={{ color: C.dim }}>
                {l.valid ? fmtTime(l.lap_time_s) : 'in progress at export'}
              </span>
            </div>
          )
        })}
      </div>

      <h2 style={{ color: C.silver3, fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>
        Channel inventory
      </h2>
      <p style={{ color: C.dim, fontSize: 12, margin: '0 0 10px' }}>
        Every decoded channel, honestly — known-empty and unreliable channels are flagged, never hidden.
      </p>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }}>
        {channels.map((c) => (
          <div
            key={c.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 14px',
              borderBottom: `1px solid ${C.line}`,
              fontSize: 12,
            }}
          >
            <span style={{ color: C.silver2 }}>
              {c.name}
              {c.allZero && <Flag kind="empty">EMPTY</Flag>}
              {!c.reliable && <Flag kind="unreliable">UNRELIABLE</Flag>}
            </span>
            <span style={{ color: C.dim, fontFamily: font.mono }}>
              {c.allZero ? '—' : `${c.min?.toFixed(2)} … ${c.max?.toFixed(2)} ${c.unit}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
