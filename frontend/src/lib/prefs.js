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
import { coerceSystem, DEFAULT_SYSTEM } from './units.js'

const TIER_KEYS = ['elite', 'competitive', 'developing']
// Versioned: v1 stored thresholds in SECONDS. They are a percentage of the
// driver's best lap now (see progression.js), and reading an old "0.5 seconds"
// back as "0.5 percent" would silently reinterpret a setting a driver chose.
// A new key means they get the new defaults instead of a wrong number.
const NS = 'bytecraft.tiers.v2'

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

// ---------------------------------------------------------------------------
// Unit system (imperial / SI)
//
// Same storage decision as the tiers, and for the same reason: this changes how
// a number is RENDERED, never what is stored. Canonical SI stays in the
// database (see lib/units.js), so a preference change is a re-render and cannot
// corrupt anything.
//
// THE LIMITATION IS DELIBERATE, AND IS ITSELF UNDER TEST. Like the tiers, this
// is per browser rather than per account — namespaced by user id, so two drivers
// sharing a browser do not inherit each other's choice, but a driver signing in
// on a second device silently gets the default back.
//
// A `user_preferences` table would fix that and cost a migration, an RLS policy
// and an owner-side apply. It is deliberately NOT built yet: Iteration 5's D3
// probe asks "did the change stick across sign-out and another device?", and
// building the table first would answer that question by assumption instead of
// by measurement. If the test says it matters, this module is the single seam to
// swap — every caller goes through loadUnits/saveUnits.

const UNITS_NS = 'bytecraft.units'

function unitsKeyFor(userId) {
  return `${UNITS_NS}.${userId || 'anon'}`
}

/** This driver's unit system, or the default. Never throws. */
export function loadUnits(userId) {
  return coerceSystem(safeGet(unitsKeyFor(userId)) ?? DEFAULT_SYSTEM)
}

/**
 * Persist this driver's unit system. Returns whether the write landed, so the
 * caller can tell "saved" from "storage unavailable" rather than claiming a
 * save that did not happen.
 */
export function saveUnits(userId, system) {
  return safeSet(unitsKeyFor(userId), coerceSystem(system))
}
