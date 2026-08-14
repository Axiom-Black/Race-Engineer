// ByteCraft Racing — session timestamp rendering.
//
// THE CONVENTION, and why it needs one.
//
// A MoTeC .ld header carries a date and a time ("30/06/2026", "19:32:27") with
// NO timezone. That is a wall-clock reading from the machine that recorded the
// session; the true instant is genuinely unknowable from the file.
//
// `parseRecordedAt` (lib/ingest.js) stores it as the UTC instant with those
// same wall-clock digits. That choice keeps sessions correctly ORDERED (every
// session is shifted identically, so progression/trends are unaffected) without
// inventing a timezone we do not have.
//
// The consequence: `recorded_at` must be rendered in **UTC**, never converted
// to the viewer's local zone. Rendering 2026-06-30T19:32:27Z with a plain
// `toLocaleString()` in US Eastern shows "3:32 PM" — a four-hour error on the
// field a driver uses to identify their own session. Formatting in UTC returns
// exactly the digits the sim wrote: "7:32:27 PM".
//
// Every display of recorded_at goes through this module. Do not call
// toLocaleString()/toLocaleDateString() on a session timestamp directly.
const DATETIME = {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
}

const DATE = { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }

/** Full session timestamp, exactly as the .ld header recorded it. */
export function formatSessionDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', DATETIME).format(d)
}

/** Session date only, exactly as the .ld header recorded it. */
export function formatSessionDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', DATE).format(d)
}
