// ByteCraft Racing — top-level error boundary (S7).
//
// Without this, an uncaught render error unmounts the tree and the driver gets
// a blank page — indistinguishable from the hollow-bundle failure Ring 5 now
// guards against. Two failure modes that look identical to a user are two
// failure modes you cannot triage from a screenshot, so this one gets a face.
//
// Deliberately hand-rolled rather than Sentry's ErrorBoundary: the SDK is
// dynamically imported (see lib/monitoring.js — it more than doubles the
// bundle), so the boundary must work with the SDK absent, blocked, or still in
// flight. It reports through `captureException`, which no-ops or buffers as
// appropriate.
import { Component } from 'react'
import { C, font } from '../theme'
import { captureException } from '../lib/monitoring'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // componentStack names the component path — no driver data — so it is
    // useful and safe to attach. It still passes through the scrubbers.
    captureException(error, { extra: { componentStack: info?.componentStack } })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          color: C.text,
          fontFamily: font.ui,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 1.5,
              fontWeight: 700,
              color: C.pink,
              marginBottom: 8,
            }}
          >
            SOMETHING BROKE
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.silver3, margin: '0 0 10px' }}>
            The dashboard hit an error
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: C.dim, margin: '0 0 18px' }}>
            Your sessions are safe — this is a display fault, not a data one. Nothing was
            deleted. Reloading usually clears it.
          </p>
          {/* The message can contain arbitrary text, so it is shown only on
              deliberate expansion rather than splashed across the page. */}
          <details style={{ marginBottom: 18 }}>
            <summary style={{ fontSize: 11, color: C.dim, cursor: 'pointer' }}>
              Technical detail
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 6,
                fontSize: 11,
                fontFamily: font.mono,
                color: C.silver2,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 180,
                overflow: 'auto',
              }}
            >
              {String(this.state.error?.message ?? this.state.error)}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: C.pinkBg,
              border: `1px solid ${C.pinkBd}`,
              color: C.pink,
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: font.ui,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
