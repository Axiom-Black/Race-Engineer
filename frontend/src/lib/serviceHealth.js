// ByteCraft Racing — turn infrastructure failures into something a driver can act on.
//
// WHY THIS EXISTS.
//
// The pilot runs on Supabase's free tier, which has two failure modes that are
// *expected operating conditions*, not bugs:
//
//   1. **The project pauses after ~1 week of inactivity.** Every request then
//      fails until someone opens the Supabase dashboard. A pilot user hitting a
//      paused project sees a broken app.
//   2. **Storage caps at 1 GB** (~1,100 raw sessions). At the cap, uploads fail.
//
// Before this module every error surface rendered `err.message` raw, so both of
// those reached the driver as `TypeError: Failed to fetch` — indistinguishable
// from a bug, and impossible to act on. A driver who reads "failed to fetch"
// concludes the product is broken; one who reads "the service is asleep, try
// again in a minute" waits and comes back.
//
// HONEST LIMITATION ON DETECTION.
//
// Supabase does not hand the browser a distinguishable "this project is paused"
// signal — a paused project, a network drop, and a platform outage all surface
// as a failed fetch or a 5xx. So this module does **not** claim to know which
// one happened. It groups them as *temporarily unavailable* and says what to
// do. Guessing "your project is paused" and being wrong would be worse than
// saying "something upstream is down".
//
// Everything here is pure: it classifies, it does not fetch or retry.

export const FAULT = {
  OFFLINE: 'offline',
  UNAVAILABLE: 'unavailable',
  SESSION_EXPIRED: 'session-expired',
  STORAGE_FULL: 'storage-full',
  PERMISSION: 'permission',
  UNKNOWN: 'unknown',
}

function textOf(err) {
  if (!err) return ''
  return [err.message, err.error_description, err.error, err.hint, err.details]
    .filter((v) => typeof v === 'string')
    .join(' ')
    .toLowerCase()
}

function statusOf(err) {
  const s = err?.status ?? err?.statusCode ?? err?.originalError?.status
  return typeof s === 'number' ? s : null
}

/**
 * Classify a Supabase/fetch error.
 *
 * @returns {{code: string, title: string, message: string, retryable: boolean}}
 */
export function classifyFault(err) {
  const text = textOf(err)
  const status = statusOf(err)
  const pgCode = err?.code

  // Browser is offline. Checked first: navigator.onLine is the one signal that
  // is actually authoritative, and it changes the advice completely.
  const online = globalThis.navigator?.onLine
  if (online === false) {
    return {
      code: FAULT.OFFLINE,
      title: "You're offline",
      message: 'Your device has no internet connection. Reconnect and try again.',
      retryable: true,
    }
  }

  // Storage quota. Checked before the generic 4xx handling because 413 is
  // otherwise indistinguishable from a client error.
  if (
    status === 413 ||
    /exceeded the maximum|quota|storage limit|payload too large|entity too large/.test(text)
  ) {
    return {
      code: FAULT.STORAGE_FULL,
      title: 'Storage is full',
      message:
        'This session could not be saved because the telemetry store has hit its limit. ' +
        'Existing sessions are unaffected. Delete an old session to free space, or contact ' +
        'ByteCraft if you need more room.',
      retryable: false,
    }
  }

  // Expired or missing auth. RLS makes an expired token look like "no data"
  // rather than an error in some paths, so this catches the explicit cases.
  if (
    status === 401 ||
    /jwt expired|invalid jwt|token is expired|refresh token not found|not authenticated/.test(text)
  ) {
    return {
      code: FAULT.SESSION_EXPIRED,
      title: 'Your sign-in expired',
      message: 'Sign in again to keep going. Nothing was lost.',
      retryable: false,
    }
  }

  // RLS rejection. Should be unreachable in normal use — a driver only ever
  // touches their own rows — so it means a real bug, and saying "you may not"
  // is more honest than "try again".
  if (pgCode === '42501' || /row-level security|violates row-level/.test(text)) {
    return {
      code: FAULT.PERMISSION,
      title: 'Not permitted',
      message:
        'That action was refused by the database. This is unexpected — please report it, ' +
        'because it means something is wrong on our side rather than yours.',
      retryable: false,
    }
  }

  // Failed fetch / 5xx / paused free-tier project — grouped, because the
  // browser cannot tell them apart.
  if (
    (status !== null && status >= 500) ||
    status === 0 ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|econnrefused|service unavailable|timeout/.test(
      text,
    )
  ) {
    return {
      code: FAULT.UNAVAILABLE,
      title: 'Service temporarily unavailable',
      message:
        "We couldn't reach the telemetry service. It may be waking from idle — free-tier " +
        'projects sleep after a period of inactivity. Wait a moment and try again; your data ' +
        'is safe.',
      retryable: true,
    }
  }

  return {
    code: FAULT.UNKNOWN,
    title: 'Something went wrong',
    message: err?.message || 'An unexpected error occurred. Try again.',
    retryable: true,
  }
}

/** One-line form for compact surfaces. */
export function faultLine(err) {
  const f = classifyFault(err)
  return `${f.title} — ${f.message}`
}
