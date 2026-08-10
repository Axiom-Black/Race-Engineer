// ByteCraft Racing — Supabase client (Tier 1 Pilot).
// The browser talks to Supabase directly; RLS keyed on auth.uid() is the
// security boundary (TESTING_GATES.md Ring 3). The publishable key is safe
// to ship to the client — it grants nothing beyond what RLS allows.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — copy .env.example to .env.local'
  )
}

export const supabase = createClient(url, key)
