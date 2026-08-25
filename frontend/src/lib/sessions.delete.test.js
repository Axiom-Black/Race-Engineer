// deleteSession's ordering is the whole point of these tests.
//
// Storage objects must go BEFORE the row, because the row is the only record
// of where those objects live. Reverse the order and a storage failure leaves
// files nobody can find, list, or bill for — invisible garbage on a 1 GB free
// tier. In the order implemented, a storage failure aborts with the session
// still listed and still deletable.
//
// RLS is what scopes the delete to the caller; these tests cannot exercise it
// (that is Ring 3, against real Postgres). They cover the ordering and failure
// handling that RLS cannot help with.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = []
let selectResult
let removeResult
let deleteResult

vi.mock('./supabase', () => ({
  supabase: {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => {
                  calls.push(`select:${table}`)
                  return selectResult
                },
              }
            },
          }
        },
        delete() {
          return {
            eq: async () => {
              calls.push(`delete:${table}`)
              return deleteResult
            },
          }
        },
      }
    },
    storage: {
      from(bucket) {
        return {
          remove: async (paths) => {
            calls.push(`remove:${bucket}:${paths.join(',')}`)
            return removeResult
          },
        }
      },
    },
  },
}))

const { deleteSession } = await import('./sessions.js')

const PATHS = {
  ld_path: 'u1/s1/session.ld',
  ldx_path: 'u1/s1/session.ldx',
  svm_path: 'u1/s1/session.svm',
  trace_path: 'u1/s1/trace.json',
}

beforeEach(() => {
  calls.length = 0
  selectResult = { data: { ...PATHS }, error: null }
  removeResult = { error: null }
  deleteResult = { error: null }
})

describe('deleteSession', () => {
  it('removes storage objects before deleting the row', async () => {
    await deleteSession('s1')
    expect(calls).toEqual([
      'select:sessions',
      'remove:telemetry:u1/s1/session.ld,u1/s1/session.ldx,u1/s1/session.svm,u1/s1/trace.json',
      'delete:sessions',
    ])
  })

  it('deletes all four objects — a missed trace.json is a silent orphan', async () => {
    await deleteSession('s1')
    const removed = calls.find((c) => c.startsWith('remove:')).split(':')[2].split(',')
    expect(removed).toHaveLength(4)
    expect(removed).toContain('u1/s1/trace.json')
  })

  it('ABORTS without touching the row when storage removal fails', async () => {
    removeResult = { error: new Error('network') }
    await expect(deleteSession('s1')).rejects.toThrow('network')
    // The row survives, so the session is still listed and still deletable.
    expect(calls).not.toContain('delete:sessions')
  })

  it('propagates a row-delete failure rather than reporting success', async () => {
    deleteResult = { error: new Error('rls denied') }
    await expect(deleteSession('s1')).rejects.toThrow('rls denied')
  })

  it('propagates a failed lookup and touches nothing', async () => {
    selectResult = { data: null, error: new Error('not found') }
    await expect(deleteSession('s1')).rejects.toThrow('not found')
    expect(calls).toEqual(['select:sessions'])
  })

  it('skips the storage call entirely when the row has no paths', async () => {
    // A `pending` row that never finished uploading: nothing to remove, and
    // remove([]) on some clients is an error rather than a no-op.
    selectResult = {
      data: { ld_path: null, ldx_path: null, svm_path: null, trace_path: null },
      error: null,
    }
    await deleteSession('s1')
    expect(calls).toEqual(['select:sessions', 'delete:sessions'])
  })

  it('removes only the paths that exist when a row is partially populated', async () => {
    selectResult = {
      data: { ...PATHS, trace_path: null },
      error: null,
    }
    await deleteSession('s1')
    const removed = calls.find((c) => c.startsWith('remove:')).split(':')[2].split(',')
    expect(removed).toHaveLength(3)
    expect(removed.every(Boolean)).toBe(true)
  })
})
