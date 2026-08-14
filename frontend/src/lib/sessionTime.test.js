// A .ld header's date/time is a wall clock with no timezone. These tests pin
// that we render it back verbatim rather than converting it into the viewer's
// zone — the bug that made a 19:32 session read "3:32 PM" in US Eastern.
import { describe, it, expect } from 'vitest'
import { formatSessionDateTime, formatSessionDate } from './sessionTime.js'

// The real COTA export: header said 30/06/2026 19:32:27.
const ISO = '2026-06-30T19:32:27Z'

describe('session timestamp rendering', () => {
  it('renders the wall clock the .ld header actually recorded', () => {
    const out = formatSessionDateTime(ISO)
    expect(out).toContain('7:32:27 PM')
    expect(out).toContain('Jun 30, 2026')
  })

  it('does NOT shift into a local timezone — the bug this replaced', () => {
    // Demonstrate the error the naive approach produces, so the test fails
    // loudly if anyone reverts to toLocaleString().
    const easternWouldSay = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
    }).format(new Date(ISO))
    expect(easternWouldSay).toBe('3:32 PM') // 4h off — what a driver would have seen
    expect(formatSessionDateTime(ISO)).not.toContain('3:32')
  })

  it('renders a date-only form from the same instant', () => {
    expect(formatSessionDate(ISO)).toBe('Jun 30, 2026')
  })

  it('does not cross a date boundary in a western zone', () => {
    // A late-evening session is the case where local conversion would also
    // move the DATE, not just the clock.
    const late = '2026-06-30T23:40:00Z'
    expect(formatSessionDate(late)).toBe('Jun 30, 2026')
  })

  it('handles missing and malformed values without throwing', () => {
    expect(formatSessionDateTime(null)).toBe('—')
    expect(formatSessionDateTime('')).toBe('—')
    expect(formatSessionDateTime('not-a-date')).toBe('—')
    expect(formatSessionDate(null)).toBe('—')
    expect(formatSessionDate('nonsense')).toBe('—')
  })
})
