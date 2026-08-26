// ByteCraft Racing — the Track Map's own instrument panel.
//
// WHY IT IS NOT THE FULL CLUSTER. The Instruments tab shows everything the car
// was doing; this panel shows what a POSITION ON TRACK explains. Engine RPM and
// wheel slip belong to the powertrain and the tyres, and a driver reading them
// is not reading the map — so they stay on the tab that owns them. What is left
// is where the car is, how fast, in what gear, on which pedal, and under what
// cornering load: the five readings that answer "what was I doing here".
//
// The corner readout is the panel's reason to exist. The map draws a badge per
// corner with its minimum speed and gear at apex; this says which of those
// corners the cursor is inside right now, and how the reading under the cursor
// compares to the apex the driver eventually reached.
import { C, font } from '../theme'
import { RadialGauge, PedalBar, GForceCross } from './InstrumentCluster'
import { gearLabel } from '../lib/gauges'
import { strictNum } from '../lib/num'

function Readout({ label, value, unit }) {
  const missing = value === null || value === undefined || value === '—'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 8.5, letterSpacing: 1.4, color: C.dim, fontWeight: 700 }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 800, color: missing ? C.dim : C.silver3 }}>
        {missing ? '—' : value}
        {unit && !missing ? <span style={{ fontSize: 9, color: C.dim, fontWeight: 400 }}> {unit}</span> : null}
      </span>
    </div>
  )
}

/**
 * @param {object} props
 * @param {object|null} props.point    the trace point under the cursor
 * @param {object|null} props.corner   the corner the cursor is inside, or null
 * @param {number|null} props.lengthKm circuit length, for a distance in metres
 */
export default function MapInstruments({ point, corner, lengthKm, maxSpeed = 260 }) {
  if (!point) {
    return (
      <div style={{ color: C.dim, fontSize: 12, padding: '16px 4px' }}>No sample under the cursor.</div>
    )
  }

  const d = strictNum(point.d)
  const km = strictNum(lengthKm)
  const metres = Number.isFinite(d) && Number.isFinite(km) ? Math.round(d * km * 1000) : null

  return (
    <div
      style={{
        display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap',
        padding: '14px 4px', borderTop: `1px solid ${C.line}`, marginTop: 12,
      }}
    >
      {/* Where on track. The corner chip is pink when inside a corner and grey
          on a straight, so the state is readable without parsing the words. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 150 }}>
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
            background: corner ? C.pinkBg : C.panel2,
            border: `1px solid ${corner ? C.pinkBd : C.line}`,
            borderRadius: 8, padding: '5px 12px',
          }}
        >
          <span style={{ fontSize: 8.5, letterSpacing: 1.4, color: C.dim, fontWeight: 700 }}>SECTION</span>
          <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 900, color: corner ? C.pink : C.silver2 }}>
            {corner ? `T${String(corner.n).padStart(2, '0')}` : 'STRAIGHT'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <Readout label="LAP" value={Number.isFinite(d) ? (d * 100).toFixed(1) : null} unit="%" />
          <Readout label="DISTANCE" value={metres} unit="m" />
        </div>
        {corner && (
          // The apex figures are the corner's, not the cursor's — labelled so,
          // because a driver comparing them to the live speed above needs to
          // know which one moves as they scrub.
          <div style={{ display: 'flex', gap: 18 }}>
            <Readout label="APEX SPEED" value={corner.minSpeed} unit="km/h" />
            <Readout label="APEX GEAR" value={corner.gearAtApex} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <RadialGauge value={point.s} max={maxSpeed} label="SPEED" unit="KM/H" color={C.pink} size={104} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.panel2, borderRadius: 8, padding: '3px 13px' }}>
          <span style={{ fontSize: 8.5, color: C.dim, letterSpacing: 1.2, fontWeight: 700 }}>GEAR</span>
          <span style={{ fontSize: 17, fontWeight: 900, color: C.blue, fontFamily: font.mono }}>
            {gearLabel(point.g)}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <PedalBar value={point.t} label="THR" color={C.good} height={86} />
        <PedalBar value={point.b} label="BRK" color={C.danger} height={86} />
        <GForceCross lat={point.gl} long={point.glo} size={100} />
      </div>
    </div>
  )
}
