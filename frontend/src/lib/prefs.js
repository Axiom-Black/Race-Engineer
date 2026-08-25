// ByteCraft Racing — per-driver display preferences (Phase 1).
//
// WHY localStorage AND NOT POSTGRES.
//
// Tier thresholds are a *display* convenience: they change how a gap is
// labelled (ELITE / COMPETITIVE / DEVELOPING / FOUNDATION), never what is
// measured or stored. They are not driver telemetry, so the "tenant isolation
// lives in the database" bar does not reach them — there is nothing here
// another tenant could read that would matter, because it never leaves the
// device.
//
// A `user_preferences` table would cost a migration, an RLS policy, and an
// owner-side apply step, to persist three numbers. WORKING_PLAN §4: "every
// increment is payable". This isn't.
//
// The honest limitation, stated rather than hidden: these do NOT follow a
// driver to a second device. When there is a real preferences surface worth
// syncing (Phase 2, alongside garage accounts), this module is the single
// seam to swap — every caller goes through loadTiers/saveTiers, so the
// upgrade is a body change here, not a hunt through components.
//
// Keys are namespaced per user id so two drivers sharing a browser profile
// don't inherit each other's thresholds.

// Thresholds are domain values, not a storage concern — they live with the
// rollup that interprets them, and this module only persists them.
import { DEFAULT_TIERS } from './progression.js'

const TIER_KEYS = ['elite', 'competitive', 'developing']
const NS = 'bytecraft.tiers'

function keyFor(userId) {
  return `${NS}.${userId || 'anon'}`
}

// localStorage throws rather than returning null in several real conditions:
// Safari private browsing, storage disabled by policy, and quota exhaustion.
// A preference read must never be able to take down the Progression tab.
function safeGet(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function safeSet(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * Coerce arbitrary stored/typed input into a usable tier set.
 * Anything missing, non-finite, or negative falls back to its default rather
 * than poisoning the tier cascade with NaN (NaN comparisons are always false,
 * which would silently label every combo FOUNDATION).
 */
export function sanitizeTiers(raw) {
  const out = { ...DEFAULT_TIERS }
  if (!raw || typeof raw !== 'object') return out
  for (const k of TIER_KEYS) {
    const n = Number(raw[k])
    if (Number.isFinite(n) && n >= 0) out[k] = n
  }
  return out
}

/** Read this driver's saved thresholds, or the defaults. Never throws. */
export function loadTiers(userId) {
  const stored = safeGet(keyFor(userId))
  if (!stored) return { ...DEFAULT_TIERS }
  try {
    return sanitizeTiers(JSON.parse(stored))
  } catch {
    // Corrupt entry (hand-edited, or a half-written value from a crashed
    // tab). Defaults are always a valid answer.
    return { ...DEFAULT_TIERS }
  }
}

/**
 * Persist this driver's thresholds. Returns whether the write landed, so a
 * caller can tell the difference between "saved" and "storage unavailable"
 * instead of claiming a save that didn't happen.
 */
export function saveTiers(userId, tiers) {
  return safeSet(keyFor(userId), JSON.stringify(sanitizeTiers(tiers)))
}

// ---------------------------------------------------------------------------
// Demo dismissal
//
// The demo session seeds whenever an account is found holding zero sessions.
// Once a driver can delete sessions, that rule resurrects the demo the next
// time they sign in — they delete it, it comes back, and the app looks broken.
//
// This flag records that they have already dismissed it. It lives here rather
// than in Postgres for the same reason the tiers do: it is a display
// convenience, not driver telemetry, and a `user_preferences` table for one
// boolean is not payable (WORKING_PLAN §4).
//
// The honest limitation: like the tiers, it does not follow a driver to
// another browser or device, so the demo can reappear there. That is a mild
// surprise rather than data loss — the demo is seeded from the public fixture,
// not from anything of theirs — and the same swap that moves tiers to a real
// preferences surface in Phase 2 moves this with them.

const DEMO_NS = 'bytecraft.demoDismissed'

function demoKeyFor(userId) {
  return `${DEMO_NS}.${userId || 'anon'}`
}

/** Has this driver already deleted the seeded demo session? Never throws. */
export function isDemoDismissed(userId) {
  return safeGet(demoKeyFor(userId)) === '1'
}

/** Record that the demo was deleted, so it is not seeded again. */
export function markDemoDismissed(userId) {
  return safeSet(demoKeyFor(userId), '1')
}
