// ByteCraft Racing — shared UI atoms for the onboarding spine.
// Small, dependency-free primitives so the auth screen and app shell read the
// same. S5's design system will absorb/replace these; keep them minimal.
import { C, font } from '../theme'

export function Wordmark({ size = 18 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, userSelect: 'none' }}>
      <span
        style={{
          color: C.pink,
          fontWeight: 800,
          letterSpacing: 2,
          fontSize: size,
          fontFamily: font.ui,
        }}
      >
        BYTECRAFT
      </span>
      <span
        style={{
          color: C.silver2,
          fontWeight: 600,
          letterSpacing: 4,
          fontSize: size * 0.62,
        }}
      >
        RACING
      </span>
    </div>
  )
}

export function Field({ label, type = 'text', value, onChange, placeholder, autoComplete, disabled }) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          letterSpacing: 1,
          color: C.dim,
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: C.bg,
          border: `1px solid ${C.line}`,
          borderRadius: 6,
          padding: '11px 12px',
          color: C.silver3,
          fontSize: 14,
          fontFamily: font.ui,
          outline: 'none',
        }}
        onFocus={(e) => (e.target.style.borderColor = C.pinkBd)}
        onBlur={(e) => (e.target.style.borderColor = C.line)}
      />
    </label>
  )
}

export function Button({ children, onClick, disabled, variant = 'primary', type = 'button' }) {
  const styles = {
    primary: { bg: C.pink, fg: '#0A0A0C', bd: C.pink },
    ghost: { bg: 'transparent', fg: C.silver2, bd: C.line },
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        background: styles.bg,
        color: styles.fg,
        border: `1px solid ${styles.bd}`,
        borderRadius: 6,
        padding: '11px 14px',
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: 0.3,
        fontFamily: font.ui,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'opacity .15s',
      }}
    >
      {children}
    </button>
  )
}

export function Banner({ kind = 'info', children }) {
  if (!children) return null
  const map = {
    error: { fg: C.danger, bd: 'rgba(255,85,85,0.3)', bg: 'rgba(255,85,85,0.08)' },
    success: { fg: C.good, bd: 'rgba(91,214,160,0.3)', bg: 'rgba(91,214,160,0.08)' },
    info: { fg: C.silver2, bd: C.line, bg: C.panel2 },
  }[kind]
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      style={{
        border: `1px solid ${map.bd}`,
        background: map.bg,
        color: map.fg,
        borderRadius: 6,
        padding: '10px 12px',
        fontSize: 13,
        lineHeight: 1.5,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  )
}
