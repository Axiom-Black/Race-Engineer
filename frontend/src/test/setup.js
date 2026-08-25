// Vitest setup — runs before every test file, node and jsdom alike.
//
// WHY COMPONENT TESTS EXIST HERE AT ALL.
//
// Until 25 Aug 2026 this repo had no way to test a component. Logic lived in
// src/lib with real coverage; everything rendered was verified by hand, or by
// a throwaway Playwright harness rebuilt from scratch each time. That harness
// worked — it caught a tier badge awarded on one data point, a two-bar
// sparkline rendering as slabs, and a lap-time stat explaining its absence
// with channel wording. But it depended on someone remembering to build it,
// which makes it a habit rather than a gate.
//
// These matchers and this cleanup are what turn that habit into CI.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library mounts into a container it appends to document.body.
// Without this, every test in a file shares the DOM of the ones before it, and
// a query that should match one element matches three — the failure looks like
// a broken assertion rather than leaked state, which is why it is easy to lose
// an hour to. Harmless in the node environment, where document is undefined.
afterEach(() => {
  if (typeof document !== 'undefined') cleanup()
})
