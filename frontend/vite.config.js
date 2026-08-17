import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The two variables the client cannot run without. Vite INLINES these at
// build time (import.meta.env is substituted, not read at runtime), which is
// what makes their absence a build-time concern rather than a runtime one.
const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']

/**
 * Fail the production build when Supabase config is missing.
 *
 * WHY THIS GUARD EXISTS (found the hard way, 17 Aug 2026).
 *
 * lib/supabase.js throws at module load if either variable is absent. With
 * the variables missing, Vite folds `import.meta.env.VITE_*` to `undefined`,
 * the guard becomes statically true, and the minifier dead-code-eliminates
 * EVERYTHING downstream of the throw — the entire application. The build
 * still exits 0 and still reports a plausible bundle:
 *
 *     without env vars   198.70 kB   (Supabase library + a throw, no app)
 *     with env vars      461.64 kB   (the actual application)
 *
 * A hosted deploy missing its env vars therefore goes green and serves a
 * blank page, with nothing in the build log to suggest why. Better to refuse
 * to build than to ship a hollow bundle.
 *
 * Dev is deliberately exempt: `vite dev` on a fresh clone should start and
 * show the runtime error, not refuse to boot.
 */
function requireSupabaseEnv() {
  return {
    name: 'bytecraft-require-supabase-env',
    apply: 'build',
    config(_config, { mode }) {
      // loadEnv reads .env files the same way Vite itself will, then falls
      // back to the real environment (how Vercel injects project variables).
      const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
      const missing = REQUIRED_ENV.filter((k) => !env[k])
      if (missing.length > 0) {
        throw new Error(
          `\n\nBuild refused: missing ${missing.join(' and ')}.\n\n` +
            'Without these, the bundle builds "successfully" but contains no\n' +
            'application code — the minifier strips it behind the unconditional\n' +
            'throw in src/lib/supabase.js, and the deployed page renders blank.\n\n' +
            'Local:  copy .env.example to .env.local and fill it in.\n' +
            'Vercel: set them in Project Settings > Environment Variables,\n' +
            '        then REDEPLOY — Vite inlines them at build time, so a\n' +
            '        restart alone will not pick up a change.\n',
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), requireSupabaseEnv()],
})
