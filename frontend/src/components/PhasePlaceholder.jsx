// ByteCraft Racing — honest "not yet" screens for Phase 2/3 nav slots.
// CLAUDE.md: "resist shipping the agent early" + standing bar "no faked
// capability" — these tabs exist in the nav (matching the product's real
// shape from RaceEngineeringAgent_v2.jsx / ByteCraft_v12_Merged.jsx) but
// render nothing that pretends to work.
import { C } from '../theme'

const RACE_ENGINEER_DOMAINS = [
  ['AERODYNAMICS', 'Wing & ride-height settings, downforce/drag trade-off'],
  ['TIRE', 'Compound, wear rate, temps, slip behaviour'],
  ['POWERTRAIN', 'Fuel/energy deployment, influence on lap performance'],
  ['TELEMETRY', 'Braking points, G-traces, speed & wheel-rotation patterns'],
  ['STRATEGY', 'Run plans, session targets vs your baseline'],
  ['ENVIRONMENT', 'Weather, time of day, track condition'],
]

const LIBRARIES = [
  ['Track Notes', 'ByteCraft corner dossiers, published per track & class'],
  ['Ideal Session Data', 'Reference targets per session type'],
  ['Vehicle Dynamics', 'Published theoretical frameworks'],
]

function Card({ title, sub }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: 13 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.silver3, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 10.5, color: C.dim, lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}

export function RaceEngineerPlaceholder() {
  return (
    <div>
      <h2 style={{ color: C.silver3, fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
        Race Engineer — Phase 2
      </h2>
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 20px', maxWidth: 560, lineHeight: 1.6 }}>
        A ten-agent system that reasons about the car and the session, not just the driver — deliberately
        dark in the Tier 1 Pilot. Strategy: launch the telemetry product first, defer per-run inference
        cost until there's revenue to support it, then bring the agent server-side. Six of the ten domain
        specialists it will orchestrate:
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {RACE_ENGINEER_DOMAINS.map(([t, s]) => (
          <Card key={t} title={t} sub={s} />
        ))}
      </div>
    </div>
  )
}

export function LibrariesPlaceholder() {
  return (
    <div>
      <h2 style={{ color: C.silver3, fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
        Knowledge Libraries — Phase 3
      </h2>
      <p style={{ color: C.dim, fontSize: 13, margin: '0 0 20px', maxWidth: 560, lineHeight: 1.6 }}>
        Curated, admin-governed reference data the Race Engineer agent draws on. Publishing pipeline and
        content arrive with the corner-dossier system in Phase 3.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {LIBRARIES.map(([t, s]) => (
          <Card key={t} title={t} sub={s} />
        ))}
      </div>
    </div>
  )
}
