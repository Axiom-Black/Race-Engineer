// @vitest-environment jsdom
//
// The Channels tab is where the "flagged, never hidden" bar is most visible: a
// driver who cannot find `Tyre Load FL` would reasonably conclude the parser
// missed it. These tests pin that a flagged channel stays listed and badged
// under every filter, not just the default view.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChannelsTab from './ChannelsTab.jsx'

const CH = [
  { name: 'Ground Speed', unit: 'km/h', domain: 'Telemetry', sampleRateHz: 50, min: 0, max: 245.98, allZero: false, reliable: true },
  { name: 'Brake Pos', unit: '%', domain: 'Telemetry', sampleRateHz: 50, min: 0, max: 100, allZero: false, reliable: true },
  { name: 'Brake Temp FL', unit: 'C', domain: 'Brakes', sampleRateHz: 10, min: 62.5, max: 410.25, allZero: false, reliable: true },
  { name: 'Tyre Load FL', unit: 'N', domain: 'Tire', sampleRateHz: 10, min: 0, max: 0, allZero: true, reliable: true },
]

describe('the inventory', () => {
  it('lists every channel and counts the flagged ones', () => {
    render(<ChannelsTab channels={CH} />)
    expect(screen.getByText(/Channel inventory · 4/)).toBeInTheDocument()
    expect(screen.getByText(/\(1 flagged\)/)).toBeInTheDocument()
    expect(screen.getByText('Ground Speed')).toBeInTheDocument()
    expect(screen.getByText('Tyre Load FL')).toBeInTheDocument()
  })

  it('shows the range and the logging rate', () => {
    render(<ChannelsTab channels={CH} />)
    expect(screen.getByText('0.00 … 245.98 km/h')).toBeInTheDocument()
    expect(screen.getAllByText('50 Hz')).toHaveLength(2)
  })

  it('badges an empty channel and refuses to print its range as a measurement', () => {
    render(<ChannelsTab channels={CH} />)
    expect(screen.getByText('EMPTY')).toBeInTheDocument()
    expect(screen.queryByText('0.00 … 0.00 N')).not.toBeInTheDocument()
  })
})

describe('finding a channel', () => {
  it('matches a substring across names', async () => {
    render(<ChannelsTab channels={CH} />)
    await userEvent.type(screen.getByLabelText('Find a channel'), 'brake')
    expect(screen.getByText('Brake Pos')).toBeInTheDocument()
    expect(screen.getByText('Brake Temp FL')).toBeInTheDocument()
    expect(screen.queryByText('Ground Speed')).not.toBeInTheDocument()
  })

  it('reports how many of the total are showing', async () => {
    render(<ChannelsTab channels={CH} />)
    expect(screen.getByText('Showing 4 of 4')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Find a channel'), 'brake')
    expect(screen.getByText('Showing 2 of 4')).toBeInTheDocument()
  })

  it('says so when nothing matches, rather than showing a blank panel', async () => {
    render(<ChannelsTab channels={CH} />)
    await userEvent.type(screen.getByLabelText('Find a channel'), 'zzz')
    expect(screen.getByText(/No channel matches/)).toBeInTheDocument()
  })

  it('still finds a flagged channel — flagged is not filtered out', async () => {
    render(<ChannelsTab channels={CH} />)
    await userEvent.type(screen.getByLabelText('Find a channel'), 'tyre')
    expect(screen.getByText('Tyre Load FL')).toBeInTheDocument()
    expect(screen.getByText('EMPTY')).toBeInTheDocument()
  })
})

describe('filtering by domain', () => {
  it('narrows to one domain and marks the active chip', async () => {
    render(<ChannelsTab channels={CH} />)
    await userEvent.click(screen.getByRole('button', { name: 'Brakes' }))
    expect(screen.getByRole('button', { name: 'Brakes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Brake Temp FL')).toBeInTheDocument()
    expect(screen.queryByText('Brake Pos')).not.toBeInTheDocument() // Telemetry
  })

  it('combines with the search box', async () => {
    render(<ChannelsTab channels={CH} />)
    await userEvent.click(screen.getByRole('button', { name: 'Telemetry' }))
    await userEvent.type(screen.getByLabelText('Find a channel'), 'brake')
    expect(screen.getByText('Brake Pos')).toBeInTheDocument()
    expect(screen.queryByText('Brake Temp FL')).not.toBeInTheDocument() // Brakes
  })

  it('offers All plus each domain present, and returns to everything', async () => {
    render(<ChannelsTab channels={CH} />)
    for (const d of ['All', 'Brakes', 'Telemetry', 'Tire']) {
      expect(screen.getByRole('button', { name: d })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('button', { name: 'Tire' }))
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByText('Showing 4 of 4')).toBeInTheDocument()
  })
})

describe('edge cases', () => {
  it('renders an empty inventory without throwing', () => {
    render(<ChannelsTab channels={[]} />)
    expect(screen.getByText(/Channel inventory · 0/)).toBeInTheDocument()
    expect(screen.getByText(/No channel matches/)).toBeInTheDocument()
  })

  it('survives a missing inventory', () => {
    expect(() => render(<ChannelsTab channels={undefined} />)).not.toThrow()
  })
})
