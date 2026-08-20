import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initMonitoring } from './lib/monitoring.js'

// Fire-and-forget: with no VITE_SENTRY_DSN this is a no-op that never touches
// the network, and the SDK chunk is only fetched when a DSN is configured (it
// more than doubles the bundle — see lib/monitoring.js). Not awaited, so
// monitoring never delays first paint.
initMonitoring()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
