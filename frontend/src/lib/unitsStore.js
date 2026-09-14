// ByteCraft Racing — the units context object, and nothing else.
//
// WHY THIS FILE IS ONE LINE LONG. The provider needs `auth`, which needs
// `supabase`, which throws by design when env vars are absent. If the READ hook
// imported the provider's module to get the context object, every leaf component
// that shows a number would transitively import Supabase — and a pure display
// component like ChannelsTab would become untestable without the whole app's
// configuration.
//
// Splitting the context out breaks that chain: `useUnits` depends on this and on
// the pure converters; only the provider depends on auth.
import { createContext } from 'react'

export const UnitsContext = createContext(null)
