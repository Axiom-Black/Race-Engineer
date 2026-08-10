// ByteCraft Racing — S4 scaffold smoke screen.
// Proves the Supabase wiring end-to-end from the browser: reachability,
// auth state, and an RLS-governed query. Replaced by the real app in S5.
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const C = {
  bg: '#0A0A0C',
  panel: '#131318',
  pink: '#FF2D78',
  text: '#E8E8EC',
  dim: '#8B8B96',
  ok: '#3DDC84',
  err: '#FF5252',
}

export default function App() {
  const [checks, setChecks] = useState({
    reachable: null, // can we hit the Supabase API at all
    session: null,   // current auth session (null = signed out, fine)
    rlsQuery: null,  // sessions count under RLS (0 for signed-out is correct)
  })

  useEffect(() => {
    async function run() {
      const next = { reachable: false, session: null, rlsQuery: null }
      try {
        const { data } = await supabase.auth.getSession()
        next.reachable = true
        next.session = data.session
        const { count, error } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
        next.rlsQuery = error ? { error: error.message } : { count }
      } catch (e) {
        next.rlsQuery = { error: String(e) }
      }
      setChecks(next)
    }
    run()
  }, [])

  const Row = ({ label, ok, detail }) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #1E1E26' }}>
      <span style={{ color: ok == null ? C.dim : ok ? C.ok : C.err, width: 20 }}>
        {ok == null ? '…' : ok ? '✓' : '✗'}
      </span>
      <span style={{ color: C.text, width: 220 }}>{label}</span>
      <span style={{ color: C.dim }}>{detail}</span>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'ui-monospace, monospace', padding: 40 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', background: C.panel, borderRadius: 8, padding: 32 }}>
        <div style={{ color: C.pink, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
          BYTECRAFT RACING
        </div>
        <div style={{ color: C.dim, fontSize: 13, marginBottom: 24 }}>
          Tier 1 Pilot — S4 scaffold smoke screen (replaced by the real app in S5)
        </div>
        <Row
          label="Supabase reachable"
          ok={checks.reachable}
          detail={checks.reachable ? import.meta.env.VITE_SUPABASE_URL : 'connecting…'}
        />
        <Row
          label="Auth state"
          ok={checks.reachable ? true : null}
          detail={checks.session ? `signed in: ${checks.session.user.email}` : 'signed out (expected pre-S5)'}
        />
        <Row
          label="RLS-governed query"
          ok={checks.rlsQuery ? !checks.rlsQuery.error : null}
          detail={
            checks.rlsQuery
              ? checks.rlsQuery.error
                ? checks.rlsQuery.error
                : `sessions visible: ${checks.rlsQuery.count ?? 0} (0 is correct while signed out — RLS working)`
              : ''
          }
        />
      </div>
    </div>
  )
}
