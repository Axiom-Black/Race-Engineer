// ByteCraft Racing — the imperial/SI switch.
//
// In the header rather than behind a settings page, because Iteration 5's D3
// probe measures *time to make the change* and a preference buried two clicks
// deep measures the navigation, not the preference. It is also the only setting
// this app has, so a page for it would be a page with one control on it.
import { C, font } from '../theme'
import { useUnits } from '../lib/useUnits'
import { IMPERIAL, SI } from '../lib/units'

const OPTIONS = [
  { id: SI, label: 'SI', title: 'Metric — km/h, °C, kPa, litres' },
  { id: IMPERIAL, label: 'IMP', title: 'Imperial — mph, °F, psi, gallons' },
]

export default function UnitToggle() {
  const { system, choose, storageFailed } = useUnits()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <div
        role="group"
        aria-label="Unit system"
        style={{ display: 'flex', gap: 2, background: C.panel2, borderRadius: 6, padding: 2 }}
      >
        {OPTIONS.map((o) => {
          const on = system === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => choose(o.id)}
              aria-pressed={on}
              title={o.title}
              style={{
                background: on ? C.pink : 'transparent',
                border: 'none',
                color: on ? '#0A0A0C' : C.dim,
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.8,
                fontFamily: font.mono,
                cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {/* A preference that claims to be saved and is not is worse than one that
          admits it cannot be — private browsing and disabled storage both hit
          this, and silently reverting on reload looks like a bug in the app. */}
      {storageFailed && (
        <span
          title="Browser storage is unavailable, so this resets on reload."
          style={{ fontSize: 11, color: C.warn, cursor: 'default' }}
        >
          ⚑
        </span>
      )}
    </div>
  )
}
