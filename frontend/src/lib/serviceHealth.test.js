// The free tier's two expected failure modes — a paused project and a full
// bucket — used to reach the driver as "TypeError: Failed to fetch". These
// tests pin that they now arrive as something actionable.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { classifyFault, faultLine, FAULT } from './serviceHealth.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function online(is) {
  vi.stubGlobal('navigator', { onLine: is })
}

describe('offline', () => {
  it('takes precedence — it is the one authoritative signal', () => {
    online(false)
    // Even a message that looks like a server fault: if the device is offline,
    // that is the actionable truth.
    expect(classifyFault(new Error('failed to fetch')).code).toBe(FAULT.OFFLINE)
  })

  it('tells the driver to reconnect rather than retry blindly', () => {
    online(false)
    expect(classifyFault(new Error('x')).message).toMatch(/no internet connection/i)
  })
})

describe('service unavailable — paused project, outage, or dropped network', () => {
  it('classifies a failed fetch', () => {
    online(true)
    expect(classifyFault(new TypeError('Failed to fetch')).code).toBe(FAULT.UNAVAILABLE)
  })

  it('classifies 5xx', () => {
    online(true)
    for (const status of [500, 502, 503, 504, 544]) {
      expect(classifyFault({ status, message: 'boom' }).code).toBe(FAULT.UNAVAILABLE)
    }
  })

  it('mentions idle sleep without claiming to know the project is paused', () => {
    online(true)
    const f = classifyFault({ status: 503 })
    // The browser cannot distinguish paused from outage, so the copy must not
    // assert which one happened.
    expect(f.message).toMatch(/sleep after a period of inactivity/i)
    expect(f.message).not.toMatch(/your project is paused/i)
    expect(f.retryable).toBe(true)
  })

  it('reassures that data is safe — the common fear on a read failure', () => {
    online(true)
    expect(classifyFault({ status: 503 }).message).toMatch(/data is safe/i)
  })
})

describe('storage full — the 1 GB free-tier cap', () => {
  it('classifies 413', () => {
    online(true)
    expect(classifyFault({ status: 413 }).code).toBe(FAULT.STORAGE_FULL)
  })

  it('classifies quota wording from Supabase Storage', () => {
    online(true)
    for (const m of [
      'The object exceeded the maximum allowed size',
      'storage limit reached',
      'quota exceeded',
      'Payload too large',
    ]) {
      expect(classifyFault({ message: m }).code).toBe(FAULT.STORAGE_FULL)
    }
  })

  it('is not retryable, and says existing sessions are unaffected', () => {
    online(true)
    const f = classifyFault({ status: 413 })
    expect(f.retryable).toBe(false)
    expect(f.message).toMatch(/existing sessions are unaffected/i)
  })
})

describe('expired sign-in', () => {
  it('classifies 401 and JWT wording', () => {
    online(true)
    expect(classifyFault({ status: 401 }).code).toBe(FAULT.SESSION_EXPIRED)
    expect(classifyFault({ message: 'JWT expired' }).code).toBe(FAULT.SESSION_EXPIRED)
    expect(classifyFault({ message: 'Refresh Token Not Found' }).code).toBe(FAULT.SESSION_EXPIRED)
  })

  it('says nothing was lost — the driver just uploaded something', () => {
    online(true)
    expect(classifyFault({ status: 401 }).message).toMatch(/nothing was lost/i)
  })
})

describe('RLS rejection', () => {
  it('classifies the Postgres code and the message', () => {
    online(true)
    expect(classifyFault({ code: '42501' }).code).toBe(FAULT.PERMISSION)
    expect(classifyFault({ message: 'new row violates row-level security policy' }).code).toBe(
      FAULT.PERMISSION,
    )
  })

  it('owns the fault rather than blaming the driver', () => {
    online(true)
    // A driver only ever touches their own rows, so this means OUR bug.
    const f = classifyFault({ code: '42501' })
    expect(f.message).toMatch(/wrong on our side/i)
    expect(f.retryable).toBe(false)
  })
})

describe('fallback', () => {
  it('preserves an unrecognised message instead of hiding it', () => {
    online(true)
    const f = classifyFault(new Error('something very specific broke'))
    expect(f.code).toBe(FAULT.UNKNOWN)
    expect(f.message).toBe('something very specific broke')
  })

  it('handles null/undefined without throwing', () => {
    online(true)
    expect(() => classifyFault(null)).not.toThrow()
    expect(classifyFault(null).code).toBe(FAULT.UNKNOWN)
    expect(classifyFault(undefined).message).toBeTruthy()
  })

  it('works when navigator is absent entirely (SSR/worker)', () => {
    vi.stubGlobal('navigator', undefined)
    expect(() => classifyFault(new Error('x'))).not.toThrow()
    // navigator.onLine unknown must not be read as "offline".
    expect(classifyFault(new Error('x')).code).toBe(FAULT.UNKNOWN)
  })

  it('reads Supabase-shaped errors that put detail outside message', () => {
    online(true)
    expect(classifyFault({ error: 'Service Unavailable' }).code).toBe(FAULT.UNAVAILABLE)
    expect(classifyFault({ hint: 'quota exceeded' }).code).toBe(FAULT.STORAGE_FULL)
  })
})

describe('faultLine', () => {
  it('joins title and message for compact surfaces', () => {
    online(true)
    expect(faultLine({ status: 503 })).toMatch(/^Service temporarily unavailable — /)
  })
})
