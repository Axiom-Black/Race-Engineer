// Tripwire for the UNRELIABLE channel hook.
//
// UNRELIABLE_CHANNELS is intentionally EMPTY: the temperature channels that
// once lived there turned out to be our own dropped-`scale` decode bug, not an
// LMU defect (reclassified 10 Aug 2026). The hook is kept — the Python
// reference keeps it too, and `reliable` is part of the golden-master contract
// — for a genuinely simulator-corrupted channel found in a future export.
//
// The consequence is that the UNRELIABLE badge in SessionReport is currently
// UNREACHABLE. That is fine while the set is empty, and a trap the moment it
// isn't: these tests fail if anyone adds an entry without also confirming the
// flag still propagates to the UI.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { UNRELIABLE_CHANNELS, KNOWN_EMPTY_FOR_SOME_CARS, parseLd, decodeAll } from './ld.js'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../../../fixtures')
const ldBytes = new Uint8Array(readFileSync(join(FIXTURES, 'cota_gte_sanitized.ld')))
const golden = JSON.parse(readFileSync(join(FIXTURES, 'golden_master_ld.json'), 'utf-8'))

describe('UNRELIABLE channel hook', () => {
  it('is empty — no LMU channel is currently classified unreliable', () => {
    // If this fails you have added a channel. Before changing it: verify the
    // UNRELIABLE badge actually renders in SessionReport (it has never been
    // exercised), and update the golden masters, which record `reliable`.
    expect(UNRELIABLE_CHANNELS.size).toBe(0)
  })

  it('matches the golden master: every fixture channel is reliable', () => {
    const ld = parseLd(ldBytes)
    decodeAll(ldBytes, ld)
    for (const [name, ch] of Object.entries(ld.channels)) {
      expect(ch.reliable, name).toBe(golden.channels[name].reliable)
      expect(ch.reliable, name).toBe(true)
    }
  })

  it('keeps "unreliable" and "empty" as separate concepts', () => {
    // Emptiness is per-session data absence; unreliability would be corrupted
    // values. Conflating them would let a populated-but-wrong channel through.
    const ld = parseLd(ldBytes)
    decodeAll(ldBytes, ld)
    const empties = Object.values(ld.channels).filter((c) => c.allZero)
    expect(empties.length).toBeGreaterThan(0)
    for (const c of empties) expect(c.reliable).toBe(true)
    for (const n of KNOWN_EMPTY_FOR_SOME_CARS) expect(UNRELIABLE_CHANNELS.has(n)).toBe(false)
  })
})
