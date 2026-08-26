import { execSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The commit this bundle is built from, resolved at build time.
 *
 * Order matters. Vercel checks out a detached head and sets
 * VERCEL_GIT_COMMIT_SHA, so that is authoritative there. `git rev-parse` covers
 * local and CI builds. When neither works the answer is the string 'unknown' —
 * honestly wrong beats a blank that reads as "no build info feature".
 *
 * Never throws: a build must not fail because git is unavailable.
 */
function resolveCommitSha() {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA
  if (fromEnv) return fromEnv
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

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

  // Build identity, substituted at build time — see src/lib/buildInfo.js for
  // why this exists. Not read at runtime, so there is no request to fail and
  // nothing to configure per environment.
  define: {
    __BUILD_SHA__: JSON.stringify(resolveCommitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },

  // TEST ENVIRONMENT — deliberately 'node' by default.
  //
  // The 185 logic tests in src/lib are pure functions and run measurably
  // faster without a DOM. Component tests opt IN per file with a docblock:
  //
  //     // @vitest-environment jsdom
  //
  // Chosen over making jsdom global so the cost is paid only by the files
  // that need it, and over vitest projects so there is one config to read.
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.js'],
    // A component test that renders nothing usually means a bad import or a
    // silently swallowed error, so surface unhandled rejections rather than
    // letting the assertion fail with a confusing "not found".
    dangerouslyIgnoreUnhandledErrors: false,
  },
})
