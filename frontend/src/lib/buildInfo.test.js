import { describe, it, expect } from 'vitest'
import { BUILD, ingestStamp, isCurrentBuild, stampLabel } from './buildInfo.js'

// NOTE ON WHAT IS ASSERTED HERE. Vite's `define` applies under the test runner
// too, so BUILD.sha is the real commit this suite is running from. That means
// the value CANNOT be asserted — it changes with every commit — so everything
// below asserts behaviour and shape, and derives its expectations from BUILD
// rather than hard-coding a sha. A test that pinned the value would fail on its
// own commit.

describe('BUILD', () => {
  it('abbreviates to seven characters, the length git itself uses', () => {
    expect(BUILD.short).toBe(BUILD.sha.slice(0, 7))
    if (BUILD.known) expect(BUILD.short).toHaveLength(7)
  })

  it('reports whether it knows its own build, rather than implying it does', () => {
    expect(BUILD.known).toBe(BUILD.sha !== 'unknown')
  })

  it('carries a build time or an explicit null — never an empty string', () => {
    // An empty string is falsy but still renders as a blank in a template. Null
    // is what a consumer can branch on.
    expect(BUILD.builtAt === null || typeof BUILD.builtAt === 'string').toBe(true)
    expect(BUILD.builtAt).not.toBe('')
  })

  it('is frozen — build identity is not something code should edit', () => {
    expect(Object.isFrozen(BUILD)).toBe(true)
  })
})

describe('ingestStamp', () => {
  it('records the running build and the moment of parsing', () => {
    const at = new Date('2026-08-26T18:00:00.000Z')
    expect(ingestStamp(at)).toEqual({
      build: BUILD.sha,
      buildShort: BUILD.short,
      parsedAt: '2026-08-26T18:00:00.000Z',
    })
  })

  it('keeps parsedAt distinct from when the session was driven or built', () => {
    // Three different times exist and all three matter: driven in June, parsed
    // in August, by a bundle built in July. Collapsing any two loses the ability
    // to answer "what else did that build parse?".
    const stamp = ingestStamp(new Date('2026-08-26T18:00:00.000Z'))
    expect(stamp.parsedAt).not.toBe(BUILD.builtAt)
    expect(stamp).not.toHaveProperty('recordedAt')
  })

  it('stores the FULL sha, so it is comparable and not just displayable', () => {
    // "Which other sessions did that bad build parse?" has to be a query.
    expect(ingestStamp().build).toBe(BUILD.sha)
  })
})

describe('isCurrentBuild', () => {
  it('says "cannot tell" rather than "no" when the stamp is missing or unknown', () => {
    // THE ASSERTION THAT MATTERS. "I cannot tell" and "no" lead to different
    // advice, and telling a driver to re-upload on a guess is worse than saying
    // nothing. Returning false here would label every pre-stamping session
    // stale, and a label on everything means nothing.
    expect(isCurrentBuild({ build: 'unknown' })).toBeNull()
    expect(isCurrentBuild({})).toBeNull()
    expect(isCurrentBuild(null)).toBeNull()
    expect(isCurrentBuild(undefined)).toBeNull()
  })

  it('recognises its own build', () => {
    expect(isCurrentBuild(ingestStamp())).toBe(BUILD.known ? true : null)
  })

  it('recognises a different build as different — but only when it knows its own', () => {
    const other = { build: '0000000000000000000000000000000000000000' }
    expect(isCurrentBuild(other)).toBe(BUILD.known ? false : null)
  })
})

describe('stampLabel', () => {
  it('abbreviates a full sha when only the long form was stored', () => {
    expect(stampLabel({ build: 'a1b2c3d4e5f6a7b8' })).toBe('a1b2c3d')
  })

  it('prefers the short form already recorded', () => {
    expect(stampLabel({ build: 'a1b2c3d4e5f6', buildShort: 'zzzzzzz' })).toBe('zzzzzzz')
  })

  it('returns null for an unknown or absent stamp, so the UI can stay silent', () => {
    expect(stampLabel({ build: 'unknown' })).toBeNull()
    expect(stampLabel({})).toBeNull()
    expect(stampLabel(null)).toBeNull()
  })
})
