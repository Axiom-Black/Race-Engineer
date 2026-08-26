// ByteCraft Racing — session overview (the landing view after opening a session).
//
// WHY THIS EXISTS. Until now, opening a session dropped a driver straight into
// a four-tab report: channel inventory, plots, track map. Everything was there
// and nothing led. Asked what he wanted and couldn't have, the owner said the
// dashboard should follow the original prototype — "visually it's difficult to
// read" (C5, 25 Aug 2026). The prototype has a view the app never had: an
// overview that answers "how did that session go?" before offering the detail.
//
// Ported from prototypes/ByteCraft_SessionDashboard.jsx — its identity bar and
// headline figures, over real persisted data rather than the prototype's
// inlined fixture. The four-tab report is unchanged and one click away.
import { C, font } from '../theme'
import { formatSessionDate } from '../lib/sessionTime'
import { headlineStats, sessionSubtitle, STAT } from '../lib/sessionOverview'
import { reconcile } from '../lib/lapReconciliation'
import SessionRuns from './SessionRuns'

// A dash with no explanation is indistinguishable from a bug. Every non-OK
// stat says which channel it came from and why it has no number — the
// "flagged, never hidden" bar applied to the figures a driver reads first.
const WHY = {
  [STAT.ABSENT]: 'not in this export',
  [STAT.EMPTY]: 'channel is empty',
  [STAT.UNRELIABLE]: 'channel flagged unreliable',
}

function Stat({ stat }) {
  const ok = stat.status === STAT.OK
  return (
    <div style={{ minWidth: 92 }}>
      <div style={{ fontSize: 8.5, letterSpacing: 1.2, color: C.dim, fontWeight: 700 }}>
        {stat.label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 900,
          lineHeight: 1.15,
          marginTop: 3,
          fontFamily: stat.key === 'laps' ? font.ui : font.mono,
          color: !ok ? C.dim : stat.accent ? C.pink : C.silver3,
        }}
      >
        {stat.text}
        {ok && stat.unit && (
          <span style={{ fontSize: 10, color: C.dim, fontWeight: 500, marginLeft: 3 }}>
            {stat.unit}
          </span>
        )}
      </div>
      {!ok && (
        <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }} title={stat.channelName ?? ''}>
          {stat.why ?? WHY[stat.status]}
        </div>
      )}
    </div>
  )
}

export default function SessionOverview({ session, laps, onOpenReport, onBack }) {
  if (!session) return null
  const channels = session.summary?.channels ?? []
  const stats = headlineStats(session, laps, channels)
  const subtitle = sessionSubtitle(session)
  const { flags } = reconcile(session, laps)
  const flagged = channels.filter((c) => c.allZero || c.reliable === false)

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: 'transparent',
          border: 'none',
          color: C.dim,
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: font.ui,
          padding: 0,
          marginBottom: 14,
        }}
      >
        ← Garage
      </button>

      {/* Identity bar: what this session was, then how it went. */}
      <div
        style={{
          background: C.panel2,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: C.silver3, lineHeight: 1.2 }}>
            {session.venue || 'Unknown venue'}
            {session.is_demo && (
              <span
                style={{ color: C.pink, fontSize: 10, fontWeight: 700, marginLeft: 9, letterSpacing: 0.5 }}
              >
                DEMO
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
            {subtitle ? `${subtitle} · ` : ''}
            {formatSessionDate(session.recorded_at) || '—'}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          {stats.map((s) => (
            <Stat key={s.key} stat={s} />
          ))}
        </div>
      </div>

      {/* Reconciliation flags stay on the landing view rather than being
          buried a tab deep — an unverified fastest lap is exactly the kind of
          thing a driver must see before quoting the number above it. */}
      {flags.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {flags.map((f) => (
            <div
              key={f.code}
              role="alert"
              style={{
                border: `1px solid ${(f.severity === 'high' ? C.danger : C.warn) + '55'}`,
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 10,
                padding: '10px 13px',
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 1.2,
                  fontWeight: 700,
                  color: f.severity === 'high' ? C.danger : C.warn,
                  marginBottom: 4,
                }}
              >
                ⚑ {f.label}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.55, color: C.text }}>{f.detail}</div>
            </div>
          ))}
        </div>
      )}

      {/* The v12 prototype's SESSION DATA DISPLAY: what a driver quotes when
          asked how the run went. It sits above the report link because a run
          average answers "how did that go?" and the four-tab report answers
          "why", which is the next question, not the first. */}
      <SessionRuns session={session} laps={laps} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          border: `1px solid ${C.line}`,
          background: C.panel,
          borderRadius: 12,
          padding: '15px 20px',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.silver3 }}>Full telemetry report</div>
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>
            {channels.length} channels · lap plots · track map
            {flagged.length > 0 && ` · ${flagged.length} flagged`}
          </div>
        </div>
        <button
          onClick={onOpenReport}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: `1px solid ${C.pinkBd}`,
            color: C.pink,
            borderRadius: 7,
            padding: '9px 17px',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: font.ui,
          }}
        >
          Open report →
        </button>
      </div>
    </div>
  )
}
