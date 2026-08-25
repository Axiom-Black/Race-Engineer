// ByteCraft Racing — session list (S5 back half).
import { useState } from 'react'
import { C, font } from '../theme'
import { formatSessionDate } from '../lib/sessionTime'

function fmtTime(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const rest = (s % 60).toFixed(3).padStart(6, '0')
  return `${m}:${rest}`
}

/** Human label for a session, used in the delete controls' accessible names so
 *  a screen reader announces which session is about to be lost — "Delete" alone
 *  is ambiguous when every card has one. Kept local: exporting a non-component
 *  from a component file breaks fast refresh. */
function sessionLabel(s) {
  const venue = s.venue || 'Unknown venue'
  const car = s.car || 'Unknown car'
  const when = formatSessionDate(s.recorded_at)
  return when ? `${venue} — ${car} (${when})` : `${venue} — ${car}`
}

export default function SessionList({ sessions, onSelect, onUploadClick, onDelete }) {
  // Which card is asking for confirmation, and which is mid-delete. Two-step
  // in place rather than window.confirm(): it is testable, it names the session
  // being deleted, and it does not blur the tab.
  const [confirmingId, setConfirmingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  async function handleDelete(session) {
    setDeletingId(session.id)
    try {
      await onDelete(session)
      // On success the list refreshes and this card unmounts, so there is
      // nothing to reset. On failure we fall through to the finally below.
    } finally {
      setDeletingId(null)
      setConfirmingId(null)
    }
  }

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
        {sessions.map((s) => {
          const confirming = confirmingId === s.id
          const deleting = deletingId === s.id
          return (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                border: `1px solid ${confirming ? C.pinkBd : s.is_demo ? C.pinkBd : C.line}`,
                background: C.panel,
                borderRadius: 10,
                overflow: 'hidden',
                fontFamily: font.ui,
              }}
            >
              <button
                onClick={() => onSelect(s.id)}
                disabled={confirming || deleting}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: 'none',
                  background: 'transparent',
                  padding: '14px 18px',
                  cursor: confirming || deleting ? 'default' : 'pointer',
                  fontFamily: font.ui,
                  opacity: confirming || deleting ? 0.45 : 1,
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

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 14px',
                  borderLeft: `1px solid ${C.line}`,
                }}
              >
                {confirming ? (
                  <>
                    <span style={{ color: C.dim, fontSize: 12 }}>
                      {deleting ? 'Deleting…' : 'Delete permanently?'}
                    </span>
                    <button
                      onClick={() => setConfirmingId(null)}
                      disabled={deleting}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${C.line}`,
                        color: C.silver2,
                        borderRadius: 6,
                        padding: '5px 10px',
                        fontSize: 12,
                        cursor: deleting ? 'default' : 'pointer',
                        fontFamily: font.ui,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      disabled={deleting}
                      aria-label={`Confirm delete ${sessionLabel(s)}`}
                      style={{
                        background: 'transparent',
                        border: '1px solid #C0392B',
                        color: '#E74C3C',
                        borderRadius: 6,
                        padding: '5px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: deleting ? 'default' : 'pointer',
                        fontFamily: font.ui,
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmingId(s.id)}
                    aria-label={`Delete ${sessionLabel(s)}`}
                    title="Delete this session"
                    style={{
                      background: 'transparent',
                      border: `1px solid ${C.line}`,
                      color: C.dim,
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: font.ui,
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
