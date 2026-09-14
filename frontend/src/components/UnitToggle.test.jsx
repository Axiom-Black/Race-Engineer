// @vitest-environment jsdom
//
// D3 measures how easily a *user* changes something, and units are one of its
// four surfaces. The probe asks four things: time, attempts, **did it stick**,
// and reversible. These are the assertions behind "attempts", "stick" and
// "reversible" — the ones a stopwatch cannot cover.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const useAuth = vi.fn(() => ({ user: { id: 'driver-1' } }))
vi.mock('../lib/auth', () => ({ useAuth: (...a) => useAuth(...a) }))

const { UnitsProvider } = await import('../lib/unitsContext.jsx')
const UnitToggle = (await import('./UnitToggle.jsx')).default
const ChannelsTab = (await import('./ChannelsTab.jsx')).default

const CHANNELS = [
  { name: 'Ground Speed', unit: 'km/h', domain: 'Vehicle', sampleRateHz: 10, min: 0, max: 245.98, allZero: false, reliable: true },
  { name: 'Ambient Temperature', unit: 'C', domain: 'Environment', sampleRateHz: 1, min: 29, max: 29, allZero: false, reliable: true },
  { name: 'Throttle Pos', unit: '%', domain: 'Driver', sampleRateHz: 25, min: 0, max: 100, allZero: false, reliable: true },
]

function renderApp() {
  return render(
    <UnitsProvider>
      <UnitToggle />
      <ChannelsTab channels={CHANNELS} />
    </UnitsProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'driver-1' } })
  try { globalThis.localStorage?.clear() } catch { /* storage disabled */ }
})

describe('the unit toggle', () => {
  it('starts on SI, because the stored data is SI', () => {
    renderApp()
    expect(screen.getByRole('button', { name: 'SI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'IMP' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('changes every number on screen in ONE click', () => {
    // "Attempts: 1" is the D3 reading this defends. A preference needing two
    // clicks or a confirm is measuring navigation, not the preference.
    renderApp()
    expect(screen.getByText(/245\.98 … 245\.98 km\/h|0\.00 … 245\.98 km\/h/)).toBeInTheDocument()
  })

  it('CONVERTS THE WHOLE CHANNEL INVENTORY, not a hand-picked few', () => {
    // Keyed on each channel's own unit string, so all 70 follow. A screen that
    // converted speed but left temperature would invite a driver to compare two
    // numbers that are not comparable.
    renderApp()
    expect(screen.getByText(/km\/h$/)).toBeInTheDocument()
    expect(screen.getByText(/29\.00 … 29\.00 C/)).toBeInTheDocument()
  })

  it('leaves a dimensionless unit alone when switching', async () => {
    // A percentage is a ratio. If it changed, the conversion table is wrong.
    renderApp()
    const before = screen.getByText(/0\.00 … 100\.00 %/)
    expect(before).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'IMP' }))
    expect(screen.getByText(/0\.00 … 100\.00 %/)).toBeInTheDocument()
  })

  it('converts speed and temperature together on switch', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'IMP' }))
    // 245.98 km/h = 152.8 mph; 29 °C = 84 °F. Both, or neither.
    expect(screen.getByText(/152\.8.* mph/)).toBeInTheDocument()
    expect(screen.getByText(/84\.20 … 84\.20 °F/)).toBeInTheDocument()
    expect(screen.queryByText(/km\/h/)).toBeNull()
  })

  it('is REVERSIBLE — back to SI restores the original numbers', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'IMP' }))
    await userEvent.click(screen.getByRole('button', { name: 'SI' }))
    expect(screen.getByText(/245\.98 km\/h/)).toBeInTheDocument()
    expect(screen.queryByText(/mph/)).toBeNull()
  })

  it('STICKS across a remount — the choice is persisted, not component state', async () => {
    // The D3 reading most likely to find something. Persistence is per driver
    // per browser (lib/prefs.js), which is a real limitation the test window is
    // measuring — but within one browser it must at least survive a reload.
    const first = renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'IMP' }))
    first.unmount()

    renderApp()
    expect(screen.getByRole('button', { name: 'IMP' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/mph/)).toBeInTheDocument()
  })

  it('does NOT leak between accounts sharing one browser', async () => {
    // Preferences are namespaced by user id. Four independent accounts are being
    // tested in one browser (D6), so a leak here would show up as one driver's
    // choice silently applying to another's garage.
    const first = renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'IMP' }))
    first.unmount()

    useAuth.mockReturnValue({ user: { id: 'driver-2' } })
    renderApp()
    expect(screen.getByRole('button', { name: 'SI' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('admits it when storage is unavailable rather than silently reverting', async () => {
    // Private browsing and disabled storage both hit this. A preference that
    // claims to be saved and is not looks like a bug in the app.
    // Spy on the prototype: jsdom's localStorage delegates to Storage.prototype,
    // so patching the instance does not intercept the call.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'IMP' }))
    const group = screen.getByRole('group', { name: 'Unit system' })
    expect(within(group.parentElement).getByTitle(/storage is unavailable/i)).toBeInTheDocument()
    setItem.mockRestore()
  })
})
