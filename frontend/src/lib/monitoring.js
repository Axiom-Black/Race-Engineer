// ByteCraft Racing — error monitoring (S7, Sentry free tier).
//
// THE GOVERNING CONSTRAINT: this app handles driver PII.
//
// A driver's real name is embedded in the `.ld` header, their email is their
// login, and every Storage path is prefixed with their `auth.uid()`. An error
// reporter is, by construction, a pipe that ships fragments of application
// state to a third party — so the default posture here is to send as little as
// possible and to redact what does go.
//
// Concretely:
//   * Monitoring is OFF unless VITE_SENTRY_DSN is set. No DSN, no SDK init, no
//     network call, no listeners. The pilot runs fine without it, so it is
//     deliberately NOT part of the Ring 5 build guard — a missing DSN degrades
//     observability, it does not break the product.
//   * `sendDefaultPii` stays false: no IP addresses, no cookies, no headers.
//   * Session Replay is NOT enabled. It would record the driver's screen,
//     including their own name in the session header. That is a bigger
//     disclosure than any bug report is worth.
//   * Every outgoing string passes through `redact()`, which strips emails,
//     UUIDs (Storage paths and user ids), and JWTs.
//   * Breadcrumbs for telemetry file reads are dropped entirely — a `.ld`
//     filename is often the driver's own name.
//
// Honest limitation, stated rather than implied: `redact()` is a denylist over
// the shapes we know appear in this app. It cannot catch an arbitrary driver
// name embedded in an arbitrary error string. It reduces exposure; it does not
// make disclosure impossible. Treat the Sentry project as containing
// potentially-identifying data and keep its access list short.
//
// WHY THE SDK IS LOADED DYNAMICALLY.
//
// A static `import * as Sentry from '@sentry/react'` costs this app
// **461.64 kB → 938.82 kB** (132 → 289 kB gzipped) — the SDK is larger than
// the entire product, and that weight is paid on first paint by every driver
// whether or not monitoring is even configured. The pilot runs on a free tier
// where page weight is the user-visible cost.
//
// So the SDK is behind `import()`: no DSN means the chunk is never fetched,
// and when a DSN is set it loads out of band, after the app is interactive.
// The trade-off is real and accepted: errors thrown in the first few hundred
// milliseconds, before the chunk resolves, are buffered by `pending` below and
// flushed on load — but an error that kills the page *during* that window can
// still be lost. Full fidelity from the first byte would cost 156 kB gzipped
// on every visit, which is the wrong trade for this product.

// Resolved SDK namespace once loaded; null until then.
let sdk = null
// Errors captured before the SDK finished loading, replayed on arrival.
// Bounded so a crash loop cannot grow it without limit.
const pending = []
const PENDING_MAX = 20

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
// Three dot-separated base64url runs — a JWT. Supabase access tokens ride in
// URLs and headers, and one in a bug report is a live credential.
const JWT = /\beyJ[\w-]*\.[\w-]+\.[\w-]+/g

/**
 * Strip the identifying shapes this app is known to produce.
 * Order matters: JWTs before UUIDs, since a token can contain one.
 */
export function redact(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(JWT, '[jwt]')
    .replace(EMAIL, '[email]')
    .replace(UUID, '[uuid]')
}

/** Walk an object graph and redact every string, bounded against cycles. */
export function redactDeep(input, seen = new WeakSet()) {
  if (typeof input === 'string') return redact(input)
  if (input === null || typeof input !== 'object') return input
  if (seen.has(input)) return '[circular]'
  seen.add(input)
  if (Array.isArray(input)) return input.map((v) => redactDeep(v, seen))
  const out = {}
  for (const [k, v] of Object.entries(input)) out[k] = redactDeep(v, seen)
  return out
}

// A breadcrumb naming a telemetry file is likely naming a person: MoTeC
// exports are commonly saved as "<driver> <track>.ld".
const TELEMETRY_FILE = /\.(ld|ldx|svm)\b/i

export function scrubBreadcrumb(crumb) {
  if (!crumb) return null
  const url = crumb.data?.url
  if (typeof url === 'string' && TELEMETRY_FILE.test(url)) return null
  if (typeof crumb.message === 'string' && TELEMETRY_FILE.test(crumb.message)) return null
  return redactDeep(crumb)
}

export function scrubEvent(event) {
  if (!event) return null
  // Drop the request payload wholesale rather than trying to sanitise it: for
  // this app a request body is a telemetry upload or a session row.
  if (event.request) delete event.request.data
  return redactDeep(event)
}

/** True when monitoring is configured. Exported so callers can branch. */
export function isMonitoringEnabled() {
  return Boolean(import.meta.env?.VITE_SENTRY_DSN)
}

/**
 * Initialise error monitoring. Safe to call unconditionally: with no DSN it is
 * a no-op that resolves false and never touches the network. Resolves true
 * once the SDK has loaded and initialised.
 */
export async function initMonitoring() {
  const dsn = import.meta.env?.VITE_SENTRY_DSN
  if (!dsn) return false
  if (sdk) return true

  try {
    const mod = await import('@sentry/react')
    mod.init({
      dsn,
      environment: import.meta.env?.MODE ?? 'production',
      sendDefaultPii: false,
      // Free tier is 5k errors/month. Errors are always sent; traces are
      // sampled thinly — they are the high-volume event type and the pilot is
      // not doing performance work.
      tracesSampleRate: 0.05,
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    })
    sdk = mod
    // Flush anything that failed while the chunk was in flight.
    while (pending.length) {
      const { error, context } = pending.shift()
      mod.captureException(error, context)
    }
    return true
  } catch {
    // A blocked or failed chunk fetch (ad blockers routinely block Sentry)
    // must never take the app down with it.
    return false
  }
}

/**
 * Report an error. No-ops when monitoring is unconfigured; buffers when the
 * SDK is still loading. Never throws — a failure in the reporter must not
 * become a second failure in the app.
 */
export function captureException(error, context) {
  try {
    if (sdk) {
      sdk.captureException(error, context)
      return
    }
    if (isMonitoringEnabled() && pending.length < PENDING_MAX) {
      pending.push({ error, context })
    }
  } catch {
    // Deliberately silent.
  }
}

/** Test seam: reset module state between cases. */
export function __resetMonitoringForTests() {
  sdk = null
  pending.length = 0
}
