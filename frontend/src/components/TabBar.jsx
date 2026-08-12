// ByteCraft Racing — top-level app navigation.
// Ported from the prototype's tab-bar pattern (ByteCraft_v12_Merged.jsx
// DriverApp: SESSIONS / RACE ENGINEER / PROGRESSION / LIBRARIES) per the
// referenced navigation workflow. Race Engineer and Libraries are genuinely
// disabled, not faked — Phase 2/3 concepts CLAUDE.md keeps dark in the pilot
// (standing bar: no faked capability). Their tabs exist so the navigation
// vocabulary matches the eventual product; clicking them explains why.
import { C, font } from '../theme'

const TABS = [
  { id: 'sessions', label: 'SESSIONS' },
  { id: 'progression', label: 'PROGRESSION' },
  { id: 'engineer', label: 'RACE ENGINEER', disabled: true, phase: 'Phase 2' },
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
            onClick={() => onChange(t.id)}
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
