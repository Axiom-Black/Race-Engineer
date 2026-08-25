import { describe, it, expect } from 'vitest'
import { domainsOf, filterChannels, channelStats, formatRange, formatRate } from './channels.js'

// Shapes and values from the real fixture inventory.
const CH = [
  { name: 'Ground Speed', unit: 'km/h', domain: 'Telemetry', sampleRateHz: 50, min: 0, max: 245.98, allZero: false, reliable: true },
  { name: 'Brake Pos', unit: '%', domain: 'Telemetry', sampleRateHz: 50, min: 0, max: 100, allZero: false, reliable: true },
  { name: 'Brake Temp FL', unit: 'C', domain: 'Brakes', sampleRateHz: 10, min: 62.5, max: 410.25, allZero: false, reliable: true },
  { name: 'Tyre Load FL', unit: 'N', domain: 'Tire', sampleRateHz: 10, min: 0, max: 0, allZero: true, reliable: true },
  { name: 'Grip Fract FL', unit: '', domain: 'Tire', sampleRateHz: 10, min: 0, max: 0, allZero: false, reliable: false },
]

describe('domainsOf', () => {
  it('puts All first, then the rest alphabetically', () => {
    expect(domainsOf(CH)).toEqual(['All', 'Brakes', 'Telemetry', 'Tire'])
  })
  it('does not invent domains from malformed rows', () => {
    expect(domainsOf([{ name: 'x' }, null])).toEqual(['All'])
  })
  it('tolerates a missing inventory', () => {
    expect(domainsOf(undefined)).toEqual(['All'])
  })
})

describe('filterChannels', () => {
  it('returns everything by default', () => {
    expect(filterChannels(CH)).toHaveLength(5)
  })

  it('filters by domain', () => {
    expect(filterChannels(CH, { domain: 'Tire' }).map((c) => c.name))
      .toEqual(['Tyre Load FL', 'Grip Fract FL'])
  })

  it('matches a name substring case-insensitively', () => {
    // The point of the search: "brake" finds all three, not just an exact hit.
    expect(filterChannels(CH, { query: 'brake' }).map((c) => c.name))
      .toEqual(['Brake Pos', 'Brake Temp FL'])
  })

  it('combines domain and query', () => {
    expect(filterChannels(CH, { domain: 'Brakes', query: 'temp' }).map((c) => c.name))
      .toEqual(['Brake Temp FL'])
  })

  it('treats whitespace-only input as no query, not as a search for a space', () => {
    // Otherwise the list empties the moment someone types then deletes, and
    // reads as a broken filter.
    expect(filterChannels(CH, { query: '   ' })).toHaveLength(5)
  })

  it('returns an empty list, not everything, when nothing matches', () => {
    expect(filterChannels(CH, { query: 'zzz' })).toEqual([])
  })

  it('never hides a flagged channel that matches — flagged, not filtered out', () => {
    const names = filterChannels(CH, { query: 'fl' }).map((c) => c.name)
    expect(names).toContain('Tyre Load FL')
    expect(names).toContain('Grip Fract FL')
  })

  it('survives null input and malformed rows', () => {
    expect(filterChannels(null)).toEqual([])
    expect(filterChannels([null, undefined], { query: 'a' })).toEqual([])
  })
})

describe('channelStats', () => {
  it('counts empty and unreliable separately', () => {
    expect(channelStats(CH)).toEqual({ total: 5, empty: 1, unreliable: 1, flagged: 2 })
  })

  it('counts a doubly-flagged channel ONCE', () => {
    // flagged is a union, not a sum — otherwise the header can claim more
    // flagged channels than the export contains.
    const both = [{ name: 'x', allZero: true, reliable: false }]
    expect(channelStats(both)).toEqual({ total: 1, empty: 1, unreliable: 1, flagged: 1 })
  })

  it('is zero everywhere for an empty or absent inventory', () => {
    expect(channelStats([])).toEqual({ total: 0, empty: 0, unreliable: 0, flagged: 0 })
    expect(channelStats(null)).toEqual({ total: 0, empty: 0, unreliable: 0, flagged: 0 })
  })
})

describe('formatRange', () => {
  it('renders min … max with the unit', () => {
    expect(formatRange(CH[0])).toBe('0.00 … 245.98 km/h')
  })
  it('omits a blank unit rather than leaving a trailing space', () => {
    expect(formatRange({ min: 1, max: 2, unit: '' })).toBe('1.00 … 2.00')
  })
  it('returns null for an all-zero channel instead of "0.00 … 0.00"', () => {
    // Printing the range invites reading a measurement where there is none.
    expect(formatRange(CH[3])).toBeNull()
  })
  it('returns null on a non-finite extent rather than rendering NaN', () => {
    expect(formatRange({ min: null, max: 5 })).toBeNull()
    expect(formatRange(null)).toBeNull()
  })
})

describe('formatRate', () => {
  it('renders hertz', () => {
    expect(formatRate(CH[0])).toBe('50 Hz')
  })
  it('returns null when the rate is absent or nonsensical', () => {
    expect(formatRate({ sampleRateHz: 0 })).toBeNull()
    expect(formatRate({})).toBeNull()
    expect(formatRate(null)).toBeNull()
  })
})
