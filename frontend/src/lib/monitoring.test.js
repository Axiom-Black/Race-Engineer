// Monitoring is a pipe to a third party in an app that holds driver PII, so
// these tests are weighted toward what must NOT escape.
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  redact,
  redactDeep,
  scrubEvent,
  scrubBreadcrumb,
  isMonitoringEnabled,
  initMonitoring,
  captureException,
  __resetMonitoringForTests,
} from './monitoring.js'

afterEach(() => {
  vi.unstubAllEnvs()
  __resetMonitoringForTests()
})

describe('redaction', () => {
  it('strips email addresses', () => {
    expect(redact('login failed for driver@axiomblack.com')).toBe('login failed for [email]')
  })

  it('strips UUIDs — these are user ids and Storage path prefixes', () => {
    const path = 'telemetry/2f1c8a9e-1111-4b2c-9d3e-aabbccddeeff/s1/trace.json'
    expect(redact(path)).toBe('telemetry/[uuid]/s1/trace.json')
  })

  it('strips JWTs, which are live credentials if leaked', () => {
    const t = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-def_123'
    const out = redact(t)
    expect(out).toBe('Bearer [jwt]')
    expect(out).not.toContain('eyJ')
  })

  it('handles a string carrying several kinds at once', () => {
    const out = redact('a@b.co 2f1c8a9e-1111-4b2c-9d3e-aabbccddeeff eyJx.y.z')
    expect(out).toBe('[email] [uuid] [jwt]')
  })

  it('passes non-strings through untouched', () => {
    expect(redact(42)).toBe(42)
    expect(redact(null)).toBeNull()
    expect(redact(undefined)).toBeUndefined()
  })
})

describe('redactDeep', () => {
  it('reaches nested objects and arrays', () => {
    const out = redactDeep({
      a: 'me@example.com',
      b: { c: ['2f1c8a9e-1111-4b2c-9d3e-aabbccddeeff', 'safe'] },
    })
    expect(out.a).toBe('[email]')
    expect(out.b.c[0]).toBe('[uuid]')
    expect(out.b.c[1]).toBe('safe')
  })

  it('survives a cycle rather than blowing the stack', () => {
    const o = { name: 'a@b.co' }
    o.self = o
    const out = redactDeep(o)
    expect(out.name).toBe('[email]')
    expect(out.self).toBe('[circular]')
  })

  it('preserves non-string values', () => {
    const out = redactDeep({ n: 1, t: true, z: null })
    expect(out).toEqual({ n: 1, t: true, z: null })
  })
})

describe('event scrubbing', () => {
  it('drops the request body wholesale — it would be a telemetry upload', () => {
    const ev = scrubEvent({ request: { url: 'https://x/api', data: { ld: 'binary…' } } })
    expect(ev.request.data).toBeUndefined()
    expect(ev.request.url).toBe('https://x/api')
  })

  it('redacts identifying strings anywhere in the event', () => {
    const ev = scrubEvent({
      message: 'upload failed for driver@axiomblack.com',
      extra: { path: '2f1c8a9e-1111-4b2c-9d3e-aabbccddeeff/s1/session.ld' },
    })
    expect(ev.message).toBe('upload failed for [email]')
    expect(ev.extra.path).toBe('[uuid]/s1/session.ld')
  })

  it('returns null for a missing event', () => {
    expect(scrubEvent(null)).toBeNull()
  })
})

describe('breadcrumb scrubbing', () => {
  it('drops any breadcrumb naming a telemetry file — the filename is often the driver', () => {
    // MoTeC exports are commonly saved as "<driver name> <track>.ld".
    expect(scrubBreadcrumb({ data: { url: '/uploads/Jane Driver COTA.ld' } })).toBeNull()
    expect(scrubBreadcrumb({ message: 'read Jane Driver COTA.ldx' })).toBeNull()
    expect(scrubBreadcrumb({ data: { url: '/x/session.svm' } })).toBeNull()
  })

  it('keeps unrelated breadcrumbs, redacted', () => {
    const c = scrubBreadcrumb({ message: 'signed in as a@b.co', data: { url: '/dashboard' } })
    expect(c).not.toBeNull()
    expect(c.message).toBe('signed in as [email]')
  })

  it('returns null for a missing breadcrumb', () => {
    expect(scrubBreadcrumb(null)).toBeNull()
  })
})

describe('opt-in behaviour', () => {
  it('is disabled, and init is a no-op, with no DSN configured', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    expect(isMonitoringEnabled()).toBe(false)
    // Must not throw, must not fetch the SDK chunk, must not touch the network.
    await expect(initMonitoring()).resolves.toBe(false)
  })

  it('captureException is a silent no-op when unconfigured', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    // A reporter failure must never become a second application failure.
    expect(() => captureException(new Error('boom'))).not.toThrow()
  })

  it('captureException never throws while the SDK chunk is still in flight', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o1.ingest.sentry.io/1')
    expect(() => captureException(new Error('early'))).not.toThrow()
  })

  it('reports enabled once a DSN is present', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o1.ingest.sentry.io/1')
    expect(isMonitoringEnabled()).toBe(true)
  })
})
