import { describe, it, expect } from 'vitest'
import {
  AGENTS, RUN_TIERS, readiness, rosterReadiness, tierById, tierReadiness, tierRuns,
} from './agents.js'

const ch = (name, allZero = false) => ({ name, allZero })
const agent = (channels) => ({ id: 'x', name: 'X', code: 'XXX', purpose: '', channels })

describe('the roster', () => {
  it('is the ten agents, each with a unique id and code', () => {
    expect(AGENTS).toHaveLength(10)
    expect(new Set(AGENTS.map((a) => a.id)).size).toBe(10)
    expect(new Set(AGENTS.map((a) => a.code)).size).toBe(10)
  })

  it('declares inputs for every agent that reads telemetry', () => {
    // An agent with no declared inputs cannot be checked, and would silently
    // report ready for a session that cannot feed it. Only the two derived
    // agents are allowed to have none.
    const derived = AGENTS.filter((a) => a.channels.length === 0).map((a) => a.id)
    expect(derived).toEqual(['synth', 'user'])
  })
})

describe('readiness', () => {
  const a = agent(['Ground Speed', 'Tyre Load FL', 'Delta Best'])

  it('separates logged, empty and missing — three different problems', () => {
    const r = readiness(a, [ch('Ground Speed'), ch('Tyre Load FL', true)])
    expect(r.present).toEqual(['Ground Speed'])
    expect(r.empty).toEqual(['Tyre Load FL'])
    expect(r.missing).toEqual(['Delta Best'])
    expect(r.state).toBe('partial')
  })

  it('treats an all-zero channel as unusable, not as present', () => {
    // Standing bar: unreliable data is flagged, never hidden. LMU ships GTE
    // with Tyre Load permanently empty — counting it would tell a driver the
    // Tire agent is fed when it is not.
    const r = readiness(agent(['Tyre Load FL']), [ch('Tyre Load FL', true)])
    expect(r.state).toBe('blocked')
    expect(r.coverage).toBe(0)
  })

  it('is ready only when every input carries data', () => {
    const r = readiness(a, [ch('Ground Speed'), ch('Tyre Load FL'), ch('Delta Best')])
    expect(r.state).toBe('ready')
    expect(r.coverage).toBe(1)
  })

  it('does not call a mostly-fed agent blocked', () => {
    // Three of four inputs still has something to say; calling that blocked
    // tells a driver to fix an export that is fine.
    const r = readiness(agent(['a', 'b', 'c', 'd']), [ch('a'), ch('b'), ch('c')])
    expect(r.state).toBe('partial')
    expect(r.coverage).toBeCloseTo(0.75, 6)
  })

  it('reports an input-less agent as derived, never as ready', () => {
    // "Ready" would be a claim about data that was never examined.
    const r = readiness(agent([]), [ch('Ground Speed')])
    expect(r.state).toBe('derived')
    expect(r.coverage).toBeNull()
  })

  it('survives a session with no channel summary at all', () => {
    expect(readiness(a, null).state).toBe('blocked')
    expect(readiness(a, [null, undefined]).missing).toHaveLength(3)
  })
})

describe('rosterReadiness', () => {
  it('answers for every agent, keyed by id', () => {
    const r = rosterReadiness([ch('Ambient Temperature'), ch('Track Temperature')])
    expect(Object.keys(r).sort()).toEqual(AGENTS.map((a) => a.id).sort())
    // The Environment agent reads exactly those two.
    expect(r.env.state).toBe('ready')
    expect(r.tire.state).toBe('blocked')
  })

  it('reproduces the real GTE fixture shape: Tire is partial, not ready', () => {
    // LMU ships GTE with Tyre Load and Grip Fract all-zero. The Tire agent has
    // temps, pressures and wear, so it is partial — the point of the tab is
    // that a driver sees exactly which eight names are the empty ones.
    const channels = AGENTS.find((a) => a.id === 'tire').channels.map((n) =>
      ch(n, n.startsWith('Tyre Load') || n.startsWith('Grip Fract')),
    )
    const r = rosterReadiness(channels)
    expect(r.tire.state).toBe('partial')
    expect(r.tire.empty).toHaveLength(8)
  })
})

describe('run tiers', () => {
  it('names three depths, deepest running the whole roster', () => {
    expect(RUN_TIERS.map((t) => t.id)).toEqual(['quick', 'standard', 'deep'])
    expect(tierById('deep').agents).toHaveLength(AGENTS.length)
  })

  it('only names agents that exist', () => {
    const ids = new Set(AGENTS.map((a) => a.id))
    for (const t of RUN_TIERS) for (const id of t.agents) expect(ids.has(id)).toBe(true)
  })

  it('falls back to Standard for an unknown depth', () => {
    expect(tierById('nonsense').id).toBe('standard')
    expect(tierById(undefined).id).toBe('standard')
  })

  it('says whether a depth runs a given agent', () => {
    expect(tierRuns(tierById('quick'), 'tire')).toBe(false)
    expect(tierRuns(tierById('deep'), 'tire')).toBe(true)
    expect(tierRuns(null, 'tire')).toBe(false)
  })
})

describe('tierReadiness', () => {
  it('counts only the agents the chosen depth actually runs', () => {
    // A Quick run is not held back by the Tire agent's empty GTE channels,
    // because a Quick run never calls it.
    const roster = rosterReadiness([])
    const quick = tierReadiness(tierById('quick'), roster)
    const deep = tierReadiness(tierById('deep'), roster)
    expect(quick.checked).toBeLessThan(deep.checked)
  })

  it('excludes derived agents from the count — they have nothing to check', () => {
    const roster = rosterReadiness([])
    const quick = tierReadiness(tierById('quick'), roster)
    // Quick is data + user; only 'data' reads telemetry.
    expect(quick.checked).toBe(1)
  })

  it('adds up: ready + partial + blocked is everything checked', () => {
    const roster = rosterReadiness([ch('Ground Speed'), ch('Throttle Pos'), ch('Brake Pos')])
    const t = tierReadiness(tierById('deep'), roster)
    expect(t.ready + t.partial.length + t.blocked.length).toBe(t.checked)
  })
})
