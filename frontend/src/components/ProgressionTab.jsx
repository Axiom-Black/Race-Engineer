// ByteCraft Racing — Progression (S6 front half, pulled forward per the
// referenced navigation workflow — ByteCraft_v12_Merged.jsx's PROGRESSION
// tab). Real rollup from persisted sessions, not a placeholder: groups by
// venue+car+session_type, shows best/gap/trend per combo.
//
// One honest difference from the prototype: v12_Merged computes "gap to
// IDEAL" against a curated reference-lap-time library. That library is a
// Phase 2+ concept (docs/S5_IMPLEMENTATION_PLAN.md's "Ideal Session Data")
// that doesn't exist yet — faking a target time would violate the standing
// bar against faked capability. This shows "gap to YOUR best" instead: a
// real, computable metric from data that actually exists.
import { useEffect, useState } from 'react'
import { C, font } from '../theme'
import { listSessions } from '../lib/sessions'

const DEFAULT_TIERS = { elite: 0.5, competitive: 1.5, developing: 3.0 }

function fmtGap(g) {
  if (g == null) return '—'
  return g <= 0.0005 ? '★ best' : `+${g.toFixed(3)}s`
}

function tierFor(gap, tiers) {
  if (gap == null) return { name: 'UNRANKED', color: C.dim }
  if (gap <= tiers.elite) return { name: 'ELITE', color: C.warn }
  if (gap <= tiers.competitive) return { name: 'COMPETITIVE', color: C.silver3 }
  if (gap <= tiers.developing) return { name: 'DEVELOPING', color: C.pink }
  return { name: 'FOUNDATION', color: C.dim }
}

function groupCombos(sessions) {
  const map = new Map()
  for (const s of sessions) {
    // The seeded demo session is sample data — it must not count toward a
    // driver's real gap/trend/best (standing bar: don't mix fabricated-looking
    // data into honest stats). It still shows in the Sessions list.
    if (s.is_demo) continue
    if (s.fastest_lap_s == null) continue
    const key = `${s.venue}|${s.car}|${s.session_type}`
    if (!map.has(key)) map.set(key, { venue: s.venue, car: s.car, sessionType: s.session_type, runs: [] })
    map.get(key).runs.push(s)
  }
  return Array.from(map.values()).map((c) => {
    const runs = c.runs.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const bests = runs.map((r) => r.fastest_lap_s)
    const bestEver = Math.min(...bests)
    const latest = bests[bests.length - 1]
    const gap = Number((latest - bestEver).toFixed(4))
    const trend = bests.length > 1 ? bests[bests.length - 1] - bests[bests.length - 2] : null
    return { ...c, bests, bestEver, gap, trend, count: runs.length }
  })
}

export default function ProgressionTab() {
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState('')
  const [tiers, setTiers] = useState(DEFAULT_TIERS)

  useEffect(() => {
    listSessions().then(setSessions).catch((e) => setError(e.message))
  }, [])

  if (error) return <p style={{ color: C.danger, fontSize: 13 }}>{error}</p>
  if (sessions === null) return <p style={{ color: C.dim }}>Loading…</p>

  const combos = groupCombos(sessions)

  if (combos.length === 0) {
    return (
      <div>
        <h2 style={{ color: C.silver3, fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Progression</h2>
        <p style={{ color: C.dim, fontSize: 13, maxWidth: 480, lineHeight: 1.6 }}>
          Upload at least one session with a fastest-lap time to start tracking progress. Trends need two
          sessions of the same venue, car, and session type.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ color: C.silver3, fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Progression</h2>
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 16px' }}>
        Venue × car × session type — best lap, gap to your own best, and trend.
      </p>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: '13px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 9, letterSpacing: 1, fontWeight: 700, color: C.pink, marginBottom: 10 }}>
          TIER THRESHOLDS · GAP TO YOUR BEST (SECONDS)
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            ['ELITE ≤', 'elite'],
            ['COMPETITIVE ≤', 'competitive'],
            ['DEVELOPING ≤', 'developing'],
          ].map(([lab, key]) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 8, color: C.dim, letterSpacing: 1, fontWeight: 700 }}>{lab}</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={tiers[key]}
                onChange={(e) => setTiers((p) => ({ ...p, [key]: Math.max(0, Number(e.target.value) || 0) }))}
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
        </div>
      </div>

      <div style={{ display: 'grid', gap: 11 }}>
        {combos.map((c) => {
          const tier = tierFor(c.gap, tiers)
          const gapPct = Math.max(0, Math.min(100, 100 - (c.gap / tiers.developing) * 100))
          return (
            <div key={`${c.venue}|${c.car}|${c.sessionType}`} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 11 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.silver3 }}>{c.venue} · {c.sessionType}</div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>
                    {c.car} · {c.count} session{c.count > 1 ? 's' : ''}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: tier.color, border: `1px solid ${tier.color}55`, borderRadius: 5, padding: '3px 9px' }}>
                  {tier.name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 22, alignItems: 'center', marginBottom: 11 }}>
                <div>
                  <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>YOUR BEST</div>
                  <div style={{ fontSize: 14, color: C.silver3, fontFamily: font.mono }}>
                    {Math.floor(c.bestEver / 60)}:{(c.bestEver % 60).toFixed(3).padStart(6, '0')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>LATEST GAP</div>
                  <div style={{ fontSize: 14, color: c.gap <= 0.0005 ? C.good : C.pink, fontFamily: font.mono }}>{fmtGap(c.gap)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>TREND</div>
                  <div style={{ fontSize: 14, color: c.trend == null ? C.dim : c.trend < 0 ? C.good : C.danger, fontFamily: font.mono }}>
                    {c.trend == null ? '—' : `${c.trend < 0 ? '▼' : '▲'} ${Math.abs(c.trend).toFixed(3)}s`}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1.5, fontWeight: 700, marginBottom: 5 }}>CLOSENESS</div>
              <div style={{ height: 6, background: C.line, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${gapPct}%`, height: '100%', background: `linear-gradient(90deg, ${C.pink}, ${C.warn})`, transition: 'width .4s' }} />
              </div>
              {c.bests.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 34, marginTop: 12 }}>
                  {c.bests.map((b, i) => {
                    const lo = Math.min(...c.bests)
                    const hi = Math.max(...c.bests)
                    const h = hi === lo ? 100 : 25 + ((hi - b) / (hi - lo)) * 75
                    return (
                      <div
                        key={i}
                        title={`${Math.floor(b / 60)}:${(b % 60).toFixed(3)}`}
                        style={{ flex: 1, height: `${h}%`, background: i === c.bests.length - 1 ? C.pink : C.dim, borderRadius: 2 }}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
