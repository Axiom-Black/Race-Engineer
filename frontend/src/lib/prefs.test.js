// Preferences are the one place a corrupt or hostile stored value can reach
// the render path, so the tests lean on the failure cases rather than the
// happy path.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  loadTiers,
  saveTiers,
  sanitizeTiers,
  isDemoDismissed,
  markDemoDismissed,
} from './prefs.js'
import { DEFAULT_TIERS } from './progression.js'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  }
}

describe('tier preferences', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns defaults for a driver who has never saved', () => {
    expect(loadTiers('user-1')).toEqual(DEFAULT_TIERS)
  })

  it('round-trips a saved set', () => {
    expect(saveTiers('user-1', { elite: 0.25, competitive: 1, developing: 2 })).toBe(true)
    expect(loadTiers('user-1')).toEqual({ elite: 0.25, competitive: 1, developing: 2 })
  })

  it('keeps two drivers on one browser profile separate', () => {
    saveTiers('user-1', { elite: 0.1, competitive: 1, developing: 2 })
    saveTiers('user-2', { elite: 0.9, competitive: 2, developing: 5 })
    expect(loadTiers('user-1').elite).toBe(0.1)
    expect(loadTiers('user-2').elite).toBe(0.9)
  })

  it('falls back to defaults on a corrupt entry rather than throwing', () => {
    localStorage.setItem('bytecraft.tiers.user-1', '{not json')
    expect(loadTiers('user-1')).toEqual(DEFAULT_TIERS)
  })

  it('never lets NaN into the tier cascade', () => {
    // NaN is the dangerous one: every comparison against it is false, so a
    // single bad value would silently label every combo FOUNDATION.
    const s = sanitizeTiers({ elite: 'abc', competitive: NaN, developing: Infinity })
    expect(s).toEqual(DEFAULT_TIERS)
    for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true)
  })

  it('rejects negative thresholds but keeps valid siblings', () => {
    const s = sanitizeTiers({ elite: -5, competitive: 2.5, developing: 4 })
    expect(s.elite).toBe(DEFAULT_TIERS.elite)
    expect(s.competitive).toBe(2.5)
    expect(s.developing).toBe(4)
  })

  it('accepts zero as a legitimate threshold', () => {
    expect(sanitizeTiers({ elite: 0 }).elite).toBe(0)
  })

  it('survives storage being unavailable, and reports the failed write', () => {
    // Safari private browsing / storage disabled by policy: these THROW,
    // they do not return null.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(loadTiers('user-1')).toEqual(DEFAULT_TIERS)
    expect(saveTiers('user-1', DEFAULT_TIERS)).toBe(false)
  })

  it('does not mutate the frozen defaults between callers', () => {
    const a = loadTiers('user-1')
    a.elite = 99
    expect(loadTiers('user-1').elite).toBe(DEFAULT_TIERS.elite)
    expect(DEFAULT_TIERS.elite).toBe(0.5)
  })
})

// The bug this guards: the demo seeds whenever an account holds zero sessions,
// and deleting the demo produces exactly that state — so without a dismissal
// record the demo comes back on the next sign-in and the app looks broken.
describe('demo dismissal', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports not-dismissed for a driver who has never deleted it', () => {
    expect(isDemoDismissed('user-1')).toBe(false)
  })

  it('remembers the dismissal', () => {
    expect(markDemoDismissed('user-1')).toBe(true)
    expect(isDemoDismissed('user-1')).toBe(true)
  })

  it('is namespaced per driver — one dismissal does not suppress another', () => {
    markDemoDismissed('user-1')
    expect(isDemoDismissed('user-2')).toBe(false)
  })

  it('does not collide with the tier key for the same driver', () => {
    markDemoDismissed('user-1')
    expect(loadTiers('user-1')).toEqual(DEFAULT_TIERS)
    saveTiers('user-1', { elite: 0.25, competitive: 1, developing: 2 })
    expect(isDemoDismissed('user-1')).toBe(true)
  })

  it('treats unavailable storage as not-dismissed rather than throwing', () => {
    // Private browsing: the demo reappearing is a mild surprise; a thrown
    // error in the seeding effect would take out the whole Sessions tab.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(isDemoDismissed('user-1')).toBe(false)
    expect(markDemoDismissed('user-1')).toBe(false)
  })
})
