// ByteCraft Racing — top-level app navigation.
// Ported from the prototype's tab-bar pattern (ByteCraft_v12_Merged.jsx
// DriverApp: SESSIONS / RACE ENGINEER / PROGRESSION / LIBRARIES) per the
// referenced navigation workflow.
//
// RACE ENGINEER IS LIVE, THE ANALYSIS IS NOT. The tab opens the Engineering Run
// workspace (EngineeringRunTab.jsx), which checks a driver's export against
// what each of the ten agents reads. It runs no analysis and says so — the
// agent stays dark in the pilot by decision. Libraries is still genuinely
// disabled: there is nothing behind it yet, and a tab that opens onto a promise
// is worse than one that says "Phase 3".
import { C, font } from '../theme'

const TABS = [
  { id: 'sessions', label: 'SESSIONS' },
  { id: 'progression', label: 'PROGRESSION' },
  { id: 'engineer', label: 'RACE ENGINEER' },
  { id: 'libraries', label: 'LIBRARIES', disabled: true, phase: 'Phase 3' },
]

export default function TabBar({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '0 22px', borderBottom: `1px solid ${C.line}`, background: C.panel }}>
      {TABS.map((t) => {
        const isActive = active === t.id
        return (
          <div
            key={t.id}
            onClick={() => { if (!t.disabled) onChange(t.id) }}
            title={t.disabled ? `Coming in ${t.phase} — dark by design in the pilot` : undefined}
            style={{
              cursor: 'pointer',
              padding: '12px 14px',
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 1.2,
              color: t.disabled ? C.dim : isActive ? C.pink : C.silver2,
              borderBottom: `2px solid ${isActive ? C.pink : 'transparent'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: font.ui,
              opacity: t.disabled ? 0.6 : 1,
            }}
          >
            {t.label}
            {t.phase && (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: C.dim,
                  border: `1px solid ${C.line}`,
                  borderRadius: 3,
                  padding: '1px 4px',
                }}
              >
                {t.phase}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
