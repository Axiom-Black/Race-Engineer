// ByteCraft Racing — "this database is missing schema this build needs".
//
// Presentational: it takes a comparison result and renders it. The rules live
// in lib/migrations.js and are tested without a database.
//
// WHERE IT SITS AND WHY. Above the app, not inside a feature — because the
// failure it describes is not a feature's fault and cannot be diagnosed from
// inside one. When track_notes was missing, the symptom appeared in the notes
// panel as a PostgREST error, which made it look like a bug in notes; the cause
// was that the whole database was a migration behind. A banner at the top says
// the true thing once, instead of every affected feature saying a confusing
// thing separately.
//
// IT SAYS NOTHING WHEN THERE IS NOTHING TO SAY. Silent on OK, and silent on
// UNKNOWN — an undiagnosable check must not become a permanent badge that
// trains the reader to ignore banners. UNKNOWN is visible in the tooltip of the
// build marker instead, where someone looking for it will find it.
import { useState } from 'react'
import { C, font } from '../theme'
import { driftMessage, ledgerBackfillSql, BEHIND } from '../lib/migrations'

export default function SchemaDriftNotice({ result }) {
  const [showDetail, setShowDetail] = useState(false)
  const msg = driftMessage(result)
  if (!msg) return null

  const warn = msg.tone === 'warn'
  const accent = warn ? C.warn : C.dim
  const backfill = result?.status === BEHIND ? ledgerBackfillSql(result.missing) : null

  return (
    <div
      role={warn ? 'alert' : 'status'}
      style={{
        border: `1px solid ${warn ? C.warn : C.line}`,
        background: warn ? 'rgba(232,194,74,0.07)' : C.panel,
        borderRadius: 8,
        padding: '10px 13px',
        marginBottom: 12,
        fontSize: 12,
        color: C.silver2,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ color: accent, fontSize: 12 }}>{msg.title}</strong>
        <span style={{ color: C.dim }}>{msg.detail}</span>
        {msg.files && (
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            style={{
              background: 'none', border: 'none', color: C.pink, fontSize: 11,
              cursor: 'pointer', padding: 0, marginLeft: 'auto', textDecoration: 'underline',
            }}
          >
            {showDetail ? 'hide' : 'how to fix'}
          </button>
        )}
      </div>

      {showDetail && msg.files && (
        <div style={{ marginTop: 9 }}>
          <div style={{ fontSize: 10, letterSpacing: 1, color: C.dim, fontWeight: 700 }}>MISSING</div>
          <ul style={{ margin: '3px 0 9px', paddingLeft: 16 }}>
            {msg.files.map((f) => (
              <li key={f} style={{ fontFamily: font.mono, fontSize: 11, color: C.silver2 }}>{f}</li>
            ))}
          </ul>

          <div style={{ fontSize: 10, letterSpacing: 1, color: C.dim, fontWeight: 700 }}>APPLY THEM</div>
          <pre style={{
            margin: '3px 0 9px', padding: 8, background: C.bg, borderRadius: 6,
            fontFamily: font.mono, fontSize: 11, color: C.silver3, overflowX: 'auto',
          }}>{msg.fix}</pre>

          {/* The ledger's sharp edge, surfaced exactly where someone hits it.
              `supabase db push` writes a ledger row; pasting SQL into the
              dashboard editor does not — so a migration applied by hand shows
              as missing here forever, with its tables sitting right there in
              the database. Saying that only in a code comment would leave a
              reader staring at a banner they cannot clear. */}
          {backfill && (
            <>
              <div style={{ fontSize: 10, letterSpacing: 1, color: C.dim, fontWeight: 700 }}>
                ALREADY APPLIED BY HAND?
              </div>
              <p style={{ margin: '3px 0', fontSize: 11, color: C.dim }}>
                Pasting SQL into the dashboard editor applies the change but does not record it.
                If these are already in the database, tell the ledger so:
              </p>
              <pre style={{
                margin: '3px 0 0', padding: 8, background: C.bg, borderRadius: 6,
                fontFamily: font.mono, fontSize: 10.5, color: C.silver3, overflowX: 'auto',
              }}>{backfill}</pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
