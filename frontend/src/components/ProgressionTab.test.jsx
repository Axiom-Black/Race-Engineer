// @vitest-environment jsdom
//
// The rollup maths is covered in lib/progression.test.js. This covers what that
// cannot: that the figures reach the screen, that the three facet filters
// actually narrow the list, and — the one that matters most — that the column
// is labelled for what it measures. The prototype this layout comes from says
// "gap to ideal"; there is no ideal-lap library, and shipping that label would
// be a claim about data we do not have.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const listSessions = vi.fn()
vi.mock('../lib/sessions', () => ({ listSessions: (...a) => listSessions(...a) }))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'driver-1' } }) }))

const ProgressionTab = (await import('./ProgressionTab.jsx')).default

/**
 * The rows region. Track names repeat in the filter's <option>s and tier names
 * repeat in the legend, so a bare getByText would match the wrong one — and
 * would keep passing if the row stopped rendering entirely.
 */
const rows = () => screen.getByRole('list', { name: 'Progression by combination' })
const inRows = () => within(rows())

const sess = (over = {}) => ({
  venue: 'COTA',
  car: 'Ferrari 488 GTE',
  car_class: 'GTE',
  session_type: 'Practice',
  fastest_lap_s: 100,
  created_at: '2026-08-01T00:00:00Z',
  is_demo: false,
  ...over,
})

const HISTORY = [
  sess({ fastest_lap_s: 104, created_at: '2026-08-01T00:00:00Z' }),
  sess({ fastest_lap_s: 102, created_at: '2026-08-02T00:00:00Z' }),
  sess({ fastest_lap_s: 100, created_at: '2026-08-03T00:00:00Z' }),
  sess({ venue: 'Spa', car: 'Porsche 963', car_class: 'Hypercar', session_type: 'Race', fastest_lap_s: 130 }),
  sess({ venue: 'Spa', car: 'Porsche 963', car_class: 'Hypercar', session_type: 'Race', fastest_lap_s: 134, created_at: '2026-08-04T00:00:00Z' }),
]

beforeEach(() => {
  vi.clearAllMocks()
  try { globalThis.localStorage?.clear() } catch { /* storage disabled */ }
  listSessions.mockResolvedValue(HISTORY)
})

describe('Progression', () => {
  it('rolls sessions into one row per track × class × session', async () => {
    render(<ProgressionTab />)
    expect(await screen.findByText('2 of 2 shown')).toBeInTheDocument()
    expect(inRows().getByText('COTA')).toBeInTheDocument()
    expect(inRows().getByText('Spa')).toBeInTheDocument()
  })

  it('measures the gap against YOUR best, and says so', async () => {
    // The prototype says "GAP TO IDEAL". There is no curated ideal-lap library
    // in Phase 1, and that label would be a claim about data we do not have.
    render(<ProgressionTab />)
    await screen.findByText('2 of 2 shown')
    expect(inRows().getAllByText('GAP TO YOUR BEST')).toHaveLength(2)
    expect(screen.queryByText(/GAP TO IDEAL/)).toBeNull()
  })

  it('shows the gap as a percentage, which compares across circuits', async () => {
    // COTA's latest run IS the best: 0.00%. Spa's latest is 134 against a best
    // of 130 — 3.08% off, and the same 4 seconds would be a smaller percentage
    // on a longer lap, which is the point of the unit.
    render(<ProgressionTab />)
    expect(await screen.findByText('0.00%')).toBeInTheDocument()
    expect(inRows().getByText('3.08%')).toBeInTheDocument()
  })

  it('names the tier, and shows which way the gap is going', async () => {
    render(<ProgressionTab />)
    await screen.findByText('2 of 2 shown')
    // "Elite" also names a legend chip above; the row is the claim under test.
    expect(inRows().getByText('Elite')).toBeInTheDocument()
    expect(inRows().getByText(/improving/)).toBeInTheDocument()
    expect(inRows().getByText(/slipping/)).toBeInTheDocument()
  })

  it('draws a sparkline once there is more than one session', async () => {
    render(<ProgressionTab />)
    expect(await screen.findByLabelText('Gap trend over 3 sessions')).toBeInTheDocument()
  })

  it('narrows on a facet, and offers a way back', async () => {
    render(<ProgressionTab />)
    await screen.findByText('2 of 2 shown')
    await userEvent.selectOptions(screen.getByLabelText('Class'), 'Hypercar')
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument()
    expect(inRows().queryByText('COTA')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'CLEAR' }))
    expect(screen.getByText('2 of 2 shown')).toBeInTheDocument()
    expect(inRows().getByText('COTA')).toBeInTheDocument()
  })

  it('says nothing matches rather than showing an empty page', async () => {
    render(<ProgressionTab />)
    await screen.findByText('2 of 2 shown')
    await userEvent.selectOptions(screen.getByLabelText('Track'), 'Spa')
    await userEvent.selectOptions(screen.getByLabelText('Class'), 'GTE')
    expect(screen.getByText(/No sessions match these filters/)).toBeInTheDocument()
  })

  it('hides the tier thresholds until asked, then edits them in place', async () => {
    render(<ProgressionTab />)
    await screen.findByText('2 of 2 shown')
    expect(screen.queryByLabelText('ELITE threshold')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Configure tiers' }))
    const elite = screen.getByLabelText('ELITE threshold')
    expect(elite).toHaveValue(0.5)

    // Spa is 3.08% off and reads Developing at the default 0.5% Elite cutoff.
    // Loosen Elite past it and BOTH rows must read Elite — an editor that
    // saves a number without re-tiering the rows is a decorative one.
    await userEvent.clear(elite)
    await userEvent.type(elite, '5')
    expect(inRows().getAllByText('Elite')).toHaveLength(2)
  })

  it('will not rank a combo with a single session', async () => {
    // The gap is measured against the driver's own best, so one session has a
    // gap of exactly zero — every first upload would otherwise read Elite.
    listSessions.mockResolvedValue([sess()])
    render(<ProgressionTab />)
    expect(await screen.findByText('1 of 1 shown')).toBeInTheDocument()
    expect(inRows().getByText('Unranked')).toBeInTheDocument()
    expect(inRows().getByText('one session')).toBeInTheDocument()
  })

  it('tells a driver with no history what to do next', async () => {
    listSessions.mockResolvedValue([])
    render(<ProgressionTab />)
    expect(await screen.findByText(/Upload at least one session/)).toBeInTheDocument()
  })

  it('excludes the seeded demo session from the rollup', async () => {
    // Standing bar: sample data must never contaminate a driver's numbers.
    listSessions.mockResolvedValue([sess({ venue: 'Demo Park', is_demo: true }), ...HISTORY])
    render(<ProgressionTab />)
    await screen.findByText('2 of 2 shown')
    expect(inRows().queryByText('Demo Park')).toBeNull()
  })

  it('surfaces a load failure instead of an endless spinner', async () => {
    listSessions.mockRejectedValue(new Error('network down'))
    render(<ProgressionTab />)
    expect(await screen.findByText(/network down/)).toBeInTheDocument()
  })

  it('carries the class and car on the row, so a tier is attributable', async () => {
    render(<ProgressionTab />)
    await screen.findByText('2 of 2 shown')
    expect(inRows().getByText('GTE · Ferrari 488 GTE · Practice')).toBeInTheDocument()
  })
})
