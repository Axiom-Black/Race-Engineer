// ByteCraft Racing — the build this page is running.
//
// Deliberately small and quiet. It answers one question, once, for anyone who
// needs it — "is my browser on the build I think it is?" — and otherwise stays
// out of the way. See lib/buildInfo.js for why that question turned out to be
// worth screen space.
import { C, font } from '../theme'
import { BUILD } from '../lib/buildInfo'

/** Absolute UTC, because a build time in a viewer's local zone is unquotable. */
function formatBuiltAt(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export default function BuildMarker() {
  const builtAt = formatBuiltAt(BUILD.builtAt)
  // An unknown build is still worth showing. "unknown" tells a driver the page
  // was not built by our pipeline — a local dev server, or a build where git was
  // unavailable — which is itself the answer to "why does this look wrong?".
  const title = [
    BUILD.known ? `Build ${BUILD.sha}` : 'Build identity unavailable',
    builtAt ? `Built ${builtAt}` : null,
    'Parsing happens at upload, so a session can be older than this page.',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <span
      title={title}
      aria-label={`Application build ${BUILD.short}`}
      style={{
        fontFamily: font.mono,
        fontSize: 9.5,
        letterSpacing: 0.5,
        color: C.dim,
        border: `1px solid ${C.line}`,
        borderRadius: 5,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
        cursor: 'default',
      }}
    >
      {BUILD.short}
    </span>
  )
}
