// ByteCraft Racing — the one way an infrastructure failure is shown to a driver.
//
// Every error surface used to render `err.message` raw, which meant the free
// tier's two expected conditions — a project asleep after a week idle, and a
// full 1 GB bucket — reached the driver as "TypeError: Failed to fetch".
// classifyFault turns those into a title, an explanation, and whether retrying
// is worth their time. See lib/serviceHealth.js.
import { C, font } from '../theme'
import { classifyFault, FAULT } from '../lib/serviceHealth'

const TONE = {
  [FAULT.OFFLINE]: C.warn,
  [FAULT.UNAVAILABLE]: C.warn,
  [FAULT.STORAGE_FULL]: C.warn,
  [FAULT.SESSION_EXPIRED]: C.blue,
  [FAULT.PERMISSION]: C.danger,
  [FAULT.UNKNOWN]: C.danger,
}

/**
 * `title` and `context` let a caller say what failed in ITS terms without
 * losing what classifyFault worked out about WHY. A demo seed that fails needs
 * to say "the demo is missing, your account is fine" — but the driver still
 * benefits from "you appear to be offline" underneath it. Overriding the whole
 * message would throw that away.
 */
export default function FaultNotice({ error, onRetry, style, title, context }) {
  if (!error) return null
  const f = classifyFault(error)
  const fg = TONE[f.code] ?? C.danger

  return (
    <div
      role="alert"
      style={{
        border: `1px solid ${fg}55`,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 10,
        padding: '12px 14px',
        maxWidth: 520,
        ...style,
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: 1.2, fontWeight: 700, color: fg, marginBottom: 5 }}>
        ⚑ {(title ?? f.title).toUpperCase()}
      </div>
      {context && (
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.text, marginBottom: 6 }}>
          {context}
        </div>
      )}
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: context ? C.dim : C.text }}>
        {f.message}
      </div>
      {f.retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 10,
            background: 'transparent',
            border: `1px solid ${C.line}`,
            color: C.silver3,
            borderRadius: 7,
            padding: '6px 14px',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: font.ui,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      )}
    </div>
  )
}
