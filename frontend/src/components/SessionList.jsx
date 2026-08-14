// ByteCraft Racing — session list (S5 back half).
import { C, font } from '../theme'
import { formatSessionDate } from '../lib/sessionTime'

function fmtTime(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const rest = (s % 60).toFixed(3).padStart(6, '0')
  return `${m}:${rest}`
}



export default function SessionList({ sessions, onSelect, onUploadClick }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h2 style={{ color: C.silver3, fontSize: 16, fontWeight: 700, margin: 0 }}>
          Sessions ({sessions.length})
        </h2>
        <button
          onClick={onUploadClick}
          style={{
            background: 'transparent',
            border: `1px solid ${C.pinkBd}`,
            color: C.pink,
            borderRadius: 6,
            padding: '7px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: font.ui,
          }}
        >
          + Upload session
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              border: `1px solid ${s.is_demo ? C.pinkBd : C.line}`,
              background: C.panel,
              borderRadius: 10,
              padding: '14px 18px',
              cursor: 'pointer',
              fontFamily: font.ui,
            }}
          >
            <div>
              <div style={{ color: C.silver3, fontWeight: 700, fontSize: 14 }}>
                {s.venue || 'Unknown venue'} — {s.car || 'Unknown car'}
                {s.is_demo && (
                  <span style={{ color: C.pink, fontSize: 10, fontWeight: 700, marginLeft: 8, letterSpacing: 0.5 }}>
                    DEMO
                  </span>
                )}
              </div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                {s.session_type} · {formatSessionDate(s.recorded_at)} · {s.car_class || ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: C.pink, fontFamily: font.mono, fontWeight: 700, fontSize: 14 }}>
                {fmtTime(s.fastest_lap_s)}
              </div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 3 }}>
                {s.lap_count ?? '—'} laps
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
