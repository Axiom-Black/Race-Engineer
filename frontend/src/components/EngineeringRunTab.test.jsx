// @vitest-environment jsdom
//
// The readiness maths is covered in lib/agents.test.js. This covers the thing
// that actually matters about this tab: that it does NOT claim to run an
// analysis. The agent is dark in the pilot by decision, and a page that grew a
// working-looking Run button would break the standing bar against faked
// capability — so the disabled button and the "nothing here is generated" line
// are assertions, not comments.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const listSessions = vi.fn()
const getSession = vi.fn()
vi.mock('../lib/sessions', () => ({
  listSessions: (...a) => listSessions(...a),
  getSession: (...a) => getSession(...a),
}))

const EngineeringRunTab = (await import('./EngineeringRunTab.jsx')).default

const ROW = {
  id: 's1', venue: 'COTA', car: 'Ferrari 488 GTE', car_class: 'GTE',
  session_type: 'Practice', recorded_at: '2026-06-30T19:32:27Z',
}

// A GTE session as LMU really exports one: Ambient/Track logged, Tyre Load and
// Grip Fract present but all-zero, Delta Best absent.
const CHANNELS = [
  { name: 'Ambient Temperature', allZero: false },
  { name: 'Track Temperature', allZero: false },
  { name: 'Ground Speed', allZero: false },
  { name: 'Lap Number', allZero: false },
  { name: 'Beacon', allZero: false },
  { name: 'Session Elapsed Time', allZero: false },
  { name: 'Tyre Load FL', allZero: true },
  { name: 'Grip Fract FL', allZero: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  listSessions.mockResolvedValue([ROW])
  getSession.mockResolvedValue({ session: { ...ROW, summary: { channels: CHANNELS } }, laps: [] })
})

const roster = () => within(screen.getByRole('list', { name: 'Agent team' }))
// The active agent's name appears twice — once in the roster, once as the
// detail heading — so waiting on the name would be ambiguous from the start.
const ready = () => screen.findByRole('list', { name: 'Agent team' })

describe('Engineering Run', () => {
  it('lists the ten agents', async () => {
    render(<EngineeringRunTab />)
    await ready()
    expect(roster().getAllByRole('button')).toHaveLength(10)
    expect(roster().getByText('Data Analytics')).toBeInTheDocument()
  })

  it('cannot run an analysis, and says why', async () => {
    // The single most important assertion in this file. If this ever passes
    // with an enabled button, the pilot is shipping a promise.
    render(<EngineeringRunTab />)
    const run = await screen.findByRole('button', { name: 'Run analysis' })
    expect(run).toBeDisabled()
    expect(run).toHaveAttribute('title', expect.stringMatching(/Phase 2/))
    expect(screen.getByText(/Nothing on this page is generated/)).toBeInTheDocument()
  })

  it("reports which of an agent's inputs this export can actually feed", async () => {
    render(<EngineeringRunTab />)
    await ready()
    await userEvent.click(roster().getByRole('button', { name: /Environment/ }))
    // Environment reads Ambient + Track Temperature, both logged.
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText(/LOGGED · 2/)).toBeInTheDocument()
  })

  it('separates an EMPTY channel from a MISSING one', async () => {
    // They are different problems: empty means LMU exported zeros (a fact about
    // the sim), missing means the export never carried it (a fact about the
    // upload). Collapsing them would send a driver chasing the wrong fix.
    render(<EngineeringRunTab />)
    await ready()
    await userEvent.click(roster().getByRole('button', { name: /Tire/ }))
    expect(screen.getByText(/EMPTY — LOGGED, ALL ZERO/)).toBeInTheDocument()
    expect(screen.getByText(/NOT IN THIS EXPORT/)).toBeInTheDocument()
  })

  it('will not call the Synthesizer ready — it reads no telemetry', async () => {
    render(<EngineeringRunTab />)
    await ready()
    await userEvent.click(roster().getByRole('button', { name: /Synthesizer/ }))
    expect(screen.getByText('DERIVED')).toBeInTheDocument()
    expect(screen.getByText(/Reads the specialists, not the telemetry/)).toBeInTheDocument()
  })

  it('changes what a run depth covers without hiding the agents it skips', async () => {
    // A driver choosing a depth should see what that choice costs them.
    render(<EngineeringRunTab />)
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Quick' }))
    expect(screen.getByText(/QUICK RUN/)).toBeInTheDocument()
    expect(roster().getAllByRole('button')).toHaveLength(10)
    await userEvent.click(roster().getByRole('button', { name: /Tire/ }))
    expect(screen.getByText('not run at this depth')).toBeInTheDocument()
  })

  it('works on the session the driver picks', async () => {
    render(<EngineeringRunTab />)
    expect(await screen.findByLabelText('Session')).toBeInTheDocument()
    expect(getSession).toHaveBeenCalledWith('s1')
  })

  it('tells a driver with no uploads what to do first', async () => {
    listSessions.mockResolvedValue([])
    render(<EngineeringRunTab />)
    expect(await screen.findByText(/Upload a session/)).toBeInTheDocument()
  })

  it('surfaces a load failure instead of an endless spinner', async () => {
    listSessions.mockRejectedValue(new Error('network down'))
    render(<EngineeringRunTab />)
    expect(await screen.findByText(/network down/)).toBeInTheDocument()
  })
})
