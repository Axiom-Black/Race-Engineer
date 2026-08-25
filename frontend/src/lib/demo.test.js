// The bug these cover, from a real account (mindofamiddlechild@gmail.com,
// 21 Aug 2026): a driver signed up, the demo seed failed before anything
// persisted, they landed on an empty garage, and never came back. The
// diagnostic found no session row and no storage objects — so the failure was
// in the fixture fetch or parse, ahead of the first insert.
//
// The .ld alone is ~853 KB, fetched during a driver's first thirty seconds.
// That is both the likeliest moment for a transient failure and the moment
// that decides whether they return.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./sessions', () => ({
  uploadSession: vi.fn(async () => 'seeded-session-id'),
}))

const { seedDemoSession } = await import('./demo.js')
const { uploadSession } = await import('./sessions.js')

function okResponse() {
  return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2, 3])]) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('demo fixture fetching', () => {
  it('fetches all three files and uploads them as a demo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()))
    await seedDemoSession()
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    expect(uploadSession).toHaveBeenCalledOnce()
    expect(uploadSession.mock.calls[0][2]).toEqual({ isDemo: true })
  })

  it('survives a transient failure — the whole point of the fix', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++
        // Every first attempt fails; the retry succeeds.
        if (calls <= 3) throw new TypeError('Failed to fetch')
        return okResponse()
      }),
    )
    await expect(seedDemoSession()).resolves.toBe('seeded-session-id')
    expect(uploadSession).toHaveBeenCalledOnce()
  })

  it('gives up after exhausting its attempts rather than hanging forever', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await expect(seedDemoSession()).rejects.toThrow('Failed to fetch')
    // 3 files x 3 attempts, and no upload attempted.
    expect(globalThis.fetch).toHaveBeenCalledTimes(9)
    expect(uploadSession).not.toHaveBeenCalled()
  })

  it('does NOT retry a 404 — a missing file will not appear on attempt three', async () => {
    // This is a build/deploy problem, not a network one. Retrying makes the
    // driver wait out three round trips to reach the same answer.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    await expect(seedDemoSession()).rejects.toThrow('missing from this deploy')
    // One attempt per file (the three fetch in parallel) — NOT the 9 that
    // retrying would cost. That difference is the assertion.
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
  })

  it('retries a 5xx, which is transient', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++
        return calls <= 3 ? { ok: false, status: 503 } : okResponse()
      }),
    )
    await expect(seedDemoSession()).resolves.toBe('seeded-session-id')
  })
})
