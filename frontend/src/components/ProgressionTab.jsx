// ByteCraft Racing — Progression (S6). Real rollup from persisted sessions,
// not a placeholder: groups by venue+car+session_type, shows best/gap/trend
// per combo, filterable by car, with tier thresholds that persist per driver.
//
// One honest difference from the prototype: v12_Merged computes "gap to
// IDEAL" against a curated reference-lap-time library. That library is a
// Phase 2+ concept (docs/s5-implementation-plan.md's "Ideal Session Data")
// that doesn't exist yet — faking a target time would violate the standing
// bar against faked capability. This shows "gap to YOUR best" instead: a
// real, computable metric from data that actually exists. The prototype's
// sparkline scales its floor against `ideal`; with no ideal, ours scales
// against the driver's own best, which is the same shape over real data.
import { useEffect, useMemo, useState } from 'react'
import { C, font } from '../theme'
import { listSessions } from '../lib/sessions'
import { useAuth } from '../lib/auth'
import { loadTiers, saveTiers } from '../lib/prefs'
import {
  ALL_CARS,
  DEFAULT_TIERS,
  carsOf,
  closenessPct,
  filterByCar,
  fmtGap,
  fmtLap,
  groupCombos,
  minMax,
  tierNameFor,
} from '../lib/progression'

// Tier colours live here, not in the domain module — the rollup decides which
// tier a gap falls in; the view decides what that looks like.
const TIER_COLORS = {
  UNRANKED: C.dim,
  ELITE: C.warn,
  COMPETITIVE: C.silver3,
  DEVELOPING: C.pink,
  FOUNDATION: C.dim,
}

const LABEL = { fontSize: 8, color: C.dim, letterSpacing: 1 }

function Sparkline({ bests }) {
  const { lo, hi } = minMax(bests)
  return (
    <>
      <div
        style={{
          fontSize: 8,
          color: C.dim,
          letterSpacing: 1.5,
          fontWeight: 700,
          marginTop: 12,
          marginBottom: 5,
        }}
      >
        TREND
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 34 }}>
        {bests.map((b, i) => {
          // Taller = faster. Floor at 25% so the slowest bar stays visible.
          const h = hi === lo ? 100 : 25 + ((hi - b) / (hi - lo)) * 75
          return (
            <div
              key={i}
              title={fmtLap(b)}
              style={{
                flex: 1,
                // Cap the width so a two-session history reads as a trend and
                // not as two slabs the width of the card. flex:1 alone (the
                // prototype's rule) only looks right at higher session counts.
                maxWidth: 34,
                height: `${h}%`,
                background: i === bests.length - 1 ? C.pink : C.silver2,
                borderRadius: 2,
              }}
            />
          )
        })}
      </div>
    </>
  )
}

export default function ProgressionTab() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState('')
  const [car, setCar] = useState(ALL_CARS)
  const [tiers, setTiers] = useState(DEFAULT_TIERS)
  const [storageWarning, setStorageWarning] = useState(false)

  useEffect(() => {
    listSessions().then(setSessions).catch((e) => setError(e.message))
  }, [])

  // Thresholds are per driver: re-read whenever the signed-in user changes,
  // so switching accounts in one browser doesn't inherit the other's setup.
  useEffect(() => {
    setTiers(loadTiers(user?.id))
    setStorageWarning(false)
  }, [user?.id])

  function updateTier(key, value) {
    const next = { ...tiers, [key]: Math.max(0, Number(value) || 0) }
    setTiers(next)
    // saveTiers reports a failed write (private browsing, storage disabled)
    // rather than throwing — surface it instead of silently losing the edit.
    setStorageWarning(!saveTiers(user?.id, next))
  }

  const combos = useMemo(() => groupCombos(sessions ?? []), [sessions])
  const cars = useMemo(() => carsOf(combos), [combos])
  const shown = useMemo(() => filterByCar(combos, car), [combos, car])

  // A car filter can outlive the car it points at (last session of that car
  // deleted). Fall back to ALL rather than rendering a confusing empty list.
  useEffect(() => {
    if (car !== ALL_CARS && !cars.includes(car)) setCar(ALL_CARS)
  }, [cars, car])

  if (error) return <p style={{ color: C.danger, fontSize: 13 }}>{error}</p>
  if (sessions === null) return <p style={{ color: C.dim }}>Loading…</p>

  const heading = (
    <h2 style={{ color: C.silver3, fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
      Progression
    </h2>
  )

  if (combos.length === 0) {
    return (
      <div>
        {heading}
        <p style={{ color: C.dim, fontSize: 13, maxWidth: 480, lineHeight: 1.6 }}>
          Upload at least one session with a fastest-lap time to start tracking progress. Trends
          need two sessions of the same venue, car, and session type.
        </p>
      </div>
    )
  }

  return (
    <div>
      {heading}
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 16px' }}>
        Venue × car × session type — best lap, gap to your own best, and trend.
      </p>

      {/* Car filter — only earns its space once there's more than one car. */}
      {cars.length > 1 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ ...LABEL, alignSelf: 'center', letterSpacing: 1.5, fontWeight: 700 }}>
            CAR
          </span>
          {[ALL_CARS, ...cars].map((c) => {
            const active = car === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCar(c)}
                aria-pressed={active}
                style={{
                  background: active ? C.pinkBg : 'transparent',
                  border: `1px solid ${active ? C.pinkBd : C.line}`,
                  color: active ? C.pink : C.dim,
                  borderRadius: 999,
                  padding: '4px 12px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  fontFamily: font.ui,
                  cursor: 'pointer',
                }}
              >
                {c === ALL_CARS ? `ALL (${combos.length})` : c}
              </button>
            )
          })}
        </div>
      )}

      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.line}`,
          borderRadius: 10,
          padding: '13px 16px',
          marginBottom: 16,
        }}
      >
        <div
          style={{ fontSize: 9, letterSpacing: 1, fontWeight: 700, color: C.pink, marginBottom: 10 }}
        >
          TIER THRESHOLDS · GAP TO YOUR BEST (SECONDS)
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {[
            ['ELITE ≤', 'elite', C.warn],
            ['COMPETITIVE ≤', 'competitive', C.silver3],
            ['DEVELOPING ≤', 'developing', C.pink],
          ].map(([lab, key, col]) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 8, color: col, letterSpacing: 1, fontWeight: 700 }}>
                {lab}
              </span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={tiers[key]}
                onChange={(e) => updateTier(key, e.target.value)}
                style={{
                  width: 80,
                  background: C.bg,
                  border: `1px solid ${C.line}`,
                  borderRadius: 6,
                  padding: '6px 9px',
                  color: C.silver3,
                  fontSize: 12,
                  fontFamily: font.mono,
                }}
              />
            </label>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 8, color: C.silver2, letterSpacing: 1, fontWeight: 700 }}>
              BEYOND →
            </span>
            <span style={{ fontSize: 11, color: C.silver2, padding: '6px 0' }}>FOUNDATION</span>
          </div>
        </div>
        <div style={{ fontSize: 9, color: C.dim, marginTop: 9, fontStyle: 'italic' }}>
          Saved to this browser. Gap bar fills relative to the Developing cutoff.
        </div>
        {storageWarning && (
          <div style={{ fontSize: 9, color: C.warn, marginTop: 5 }}>
            Couldn’t save — browser storage is unavailable, so these reset on reload.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 11 }}>
        {shown.map((c) => {
          const tierName = tierNameFor(c.gap, tiers, c.count)
          const tierColor = TIER_COLORS[tierName]
          const gapPct = closenessPct(c.gap, tiers)
          return (
            <div
              key={`${c.venue}|${c.car}|${c.sessionType}`}
              style={{
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 11,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.silver3 }}>
                    {c.venue} · {c.sessionType}
                  </div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>
                    {c.car} · {c.count} session{c.count > 1 ? 's' : ''}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    color: tierColor,
                    border: `1px solid ${tierColor}55`,
                    borderRadius: 5,
                    padding: '3px 9px',
                  }}
                >
                  {tierName}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 22, alignItems: 'center', marginBottom: 11 }}>
                <div>
                  <div style={LABEL}>YOUR BEST</div>
                  <div style={{ fontSize: 14, color: C.silver3, fontFamily: font.mono }}>
                    {fmtLap(c.bestEver)}
                  </div>
                </div>
                <div>
                  <div style={LABEL}>LATEST GAP</div>
                  <div
                    style={{
                      fontSize: 14,
                      color: c.gap <= 0.0005 ? C.good : C.pink,
                      fontFamily: font.mono,
                    }}
                  >
                    {fmtGap(c.gap)}
                  </div>
                </div>
                <div>
                  <div style={LABEL}>TREND</div>
                  <div
                    style={{
                      fontSize: 14,
                      color: c.trend == null ? C.dim : c.trend < 0 ? C.good : C.danger,
                      fontFamily: font.mono,
                    }}
                  >
                    {c.trend == null ? '—' : `${c.trend < 0 ? '▼' : '▲'} ${Math.abs(c.trend).toFixed(3)}s`}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: 8,
                  color: C.dim,
                  letterSpacing: 1.5,
                  fontWeight: 700,
                  marginBottom: 5,
                }}
              >
                CLOSENESS
              </div>
              <div style={{ height: 6, background: C.line, borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${gapPct}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${C.pink}, ${C.warn})`,
                    transition: 'width .4s',
                  }}
                />
              </div>
              {c.bests.length > 1 && <Sparkline bests={c.bests} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
