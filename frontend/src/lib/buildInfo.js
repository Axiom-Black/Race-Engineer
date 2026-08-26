// ByteCraft Racing — which build is this, and which build made that record?
//
// WHY THIS EXISTS. On 26 Aug a driver reported the track map showing 14 corners
// where the detector finds 20. It took three exchanges to establish that the
// detector was fine and the *session* was stale — parsed by an older bundle,
// because parsing happens client-side at upload and derived data is written
// once, at that moment.
//
// Nothing on screen could answer either half of the question:
//
//   1. "Which bundle is my browser running?"  — a deploy may not have landed,
//      or the page may be a cached older one.
//   2. "Which bundle parsed THIS session?"    — the record may predate a change
//      to ingest, in which case its derived data is old however new the page is.
//
// Those are different questions with different fixes (reload vs re-upload), and
// without both answers a stale record is indistinguishable from a broken
// feature. During Iteration 5's frozen test window that distinction is the
// difference between a real finding and a wasted day, which is why this ships
// before the window opens rather than after.
//
// HOW THE VALUES GET HERE. Vite substitutes `__BUILD_SHA__` and `__BUILD_TIME__`
// at build time (see vite.config.js) — they are not read at runtime, so there is
// no request and nothing to fail. On Vercel the SHA comes from
// VERCEL_GIT_COMMIT_SHA; locally from `git rev-parse`; and when neither is
// available it is honestly `unknown` rather than a plausible-looking blank.

/* global __BUILD_SHA__, __BUILD_TIME__ */

/** Vite replaces these at build time; the guards are for the test runner. */
const RAW_SHA = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'unknown'
const RAW_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''

/**
 * The build this bundle was produced from.
 *
 * `sha` is the full commit where known. `short` is what the UI shows — seven
 * characters is enough to identify a commit by eye and to search for, and it is
 * the length git itself abbreviates to.
 */
export const BUILD = Object.freeze({
  sha: RAW_SHA,
  short: RAW_SHA === 'unknown' ? 'unknown' : RAW_SHA.slice(0, 7),
  builtAt: RAW_TIME || null,
  known: RAW_SHA !== 'unknown',
})

/**
 * The stamp recorded on a session when it is parsed.
 *
 * Deliberately a small flat object rather than a bare string: a session outlives
 * many builds, and when one turns out to be wrong the useful question is "what
 * else was parsed by that build?" — which needs the value to be comparable, not
 * just displayable.
 *
 * `parsedAt` is the ingest moment, which is NOT the session's `recorded_at`
 * (when it was driven) nor the build's `builtAt`. All three differ and all three
 * matter: a session driven in June, parsed in August, by a bundle built in July.
 */
export function ingestStamp(now = new Date()) {
  return {
    build: BUILD.sha,
    buildShort: BUILD.short,
    parsedAt: now.toISOString(),
  }
}

/**
 * Is a record's build the one currently running?
 *
 * Returns `null` — not `false` — when either side is unknown. "I cannot tell"
 * and "no" lead to different advice, and telling a driver to re-upload on a
 * guess is worse than saying nothing.
 */
export function isCurrentBuild(stamp) {
  const recorded = stamp?.build
  if (!recorded || recorded === 'unknown' || !BUILD.known) return null
  return recorded === BUILD.sha
}

/** Short label for a recorded stamp, for the session page. */
export function stampLabel(stamp) {
  const short = stamp?.buildShort || (stamp?.build ? String(stamp.build).slice(0, 7) : null)
  return short && short !== 'unknown' ? short : null
}
