# Deploying the pilot demo (Vercel + Supabase)

The public, clickable demo of the Tier 1 Pilot. The SPA (`frontend/`) is a
static Vite build that talks directly to the existing Supabase project
(`bytecraft-racing`) under RLS — there is no server to run. A new visitor who
signs up is auto-seeded a demo session, so they land on a **populated**
dashboard with zero uploads.

## One-time: connect the repo to Vercel (dashboard, ~5 min)

You need a Vercel account with access to the `Axiom-Black` GitHub org.

1. **vercel.com → Add New → Project → Import** `Axiom-Black/Race-Engineer`.
2. **Root Directory:** set to **`frontend`** (the SPA lives there, not the repo
   root). Vercel then reads `frontend/vercel.json` and auto-detects Vite —
   build `npm run build`, output `dist`.
3. **Environment Variables** — add both (Production + Preview):

   | Name | Value | Where it comes from |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | `https://nunkznbcdxgsofqlogri.supabase.co` | already in `frontend/.env.example` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | *the project's publishable key* | Supabase dashboard → Project Settings → API → **Publishable key** (a.k.a. anon) |
   | `VITE_SENTRY_DSN` | *optional* | Sentry → Project → Settings → Client Keys (DSN). Omit to leave monitoring off entirely. |

   The publishable key is **client-safe by design** — it grants nothing beyond
   what RLS allows. Do not use the service-role key here.

   Vercel will warn that a `VITE_`-prefixed variable is exposed to the browser.
   That is correct and intended: Vite only inlines `VITE_`-prefixed names, and
   these values are meant to be public. **Do not mark them Sensitive** — a
   Sensitive variable cannot be created in the Development environment, and
   the flag buys nothing for a value that ships inside the bundle anyway.

   **Both Supabase variables must exist before the first build.** Vite inlines
   `import.meta.env` at build time, so setting one later requires a **rebuild**,
   not a restart. A build with either missing is refused outright by
   `frontend/vite.config.js` (Ring 5 / G5.1) — because without that guard it
   silently produced a bundle with the entire application stripped out, which
   deploys green and serves a blank page.
4. **Deploy.** Vercel gives a `*.vercel.app` URL. Every push to `main`
   redeploys automatically.

## One-time: Supabase demo-readiness

- **Redirect URLs (do this first):** Authentication → URL Configuration → add
  the `*.vercel.app` origin to **Site URL / Redirect URLs**. Without it,
  confirmation links point at `localhost` and every new signup dead-ends.
- **"Confirm email" — leave it ON for anything publicly reachable.** Supabase →
  Authentication → Providers → Email. Turning it **off** removes all friction
  (sign up → straight into a populated demo dashboard), which is genuinely
  useful for a private walkthrough — but it also means *anyone who has the URL
  gets a working account*. Once the deployment is public, that is an open door,
  not a convenience. Turn it off only for a closed demo, and turn it back on
  immediately afterward. **Order matters:** set the redirect URL before enabling
  confirmation, or the emails you start sending will point at localhost.

  *This bit us: confirmation was disabled 12 Aug for test-signup friction and
  was still off when the pilot went public on 17 Aug.*
- **Free-tier caveats:** the project **pauses after ~1 week of inactivity** —
  just open the dashboard (or the app) to wake it before a demo. Storage is
  capped at 1 GB (~1,100 raw sessions); the demo fixture is tiny.

## Smoke test the live URL

1. Open the URL → **Sign up** with a throwaway email.
2. Land on **Your garage** with a seeded **DEMO SESSION** (COTA · GTE).
3. Open it → all four tabs render: **Summary** (stats + track silhouette +
   channel inventory with EMPTY flags), **Performance** (per-lap metrics +
   speed profile), **Instruments** (scrub the distance slider — every plot's
   cursor and readout move together), **Track Map** (speed-colored GPS trace
   with the synced cursor dot).
4. Optional: upload the real COTA triple (local only) via **Upload** — a
   complete view should render in < 10 s.

## Redeploying / rolling back

- **Auto:** merge to `main` → Vercel builds and deploys.
- **Manual/CLI:** `cd frontend && npx vercel --prod` (after `npx vercel login`).
- **Rollback:** Vercel dashboard → Deployments → promote a previous build.

## What's NOT in the demo (by design)

The AI Race Engineer and Libraries tabs are intentionally dark (Phase 2) and
labeled as such — no faked capability. Cross-session Progression populates once
a driver has ≥ 2 real sessions of the same car/track (the demo alone shows the
empty/one-run state honestly).

## Optional: error monitoring (Sentry free tier)

Monitoring is **opt-in and off by default**. With `VITE_SENTRY_DSN` unset the
SDK is never fetched, never initialised, and makes no network call — the
`import()` is statically unreachable, so the chunk is not even emitted.

To turn it on:

1. Create a free Sentry account and a **React** project. Free tier is 5k
   errors/month.
2. Copy the DSN from **Settings → Client Keys (DSN)**.
3. Add `VITE_SENTRY_DSN` in Vercel → Environment Variables, then **redeploy**
   (build-time inlining again).

### What it sends, and what it deliberately does not

This app holds driver PII — a real name in the `.ld` header, an email as the
login, and an `auth.uid()` prefix on every Storage path. `frontend/src/lib/monitoring.js`
is written around that:

- **`sendDefaultPii: false`** — no IP addresses, cookies, or headers.
- **No Session Replay.** It would record the driver's screen, including their
  own name in the session header.
- **Every outgoing string is redacted** for emails, UUIDs, and JWTs. A leaked
  Supabase access token would be a live credential.
- **Request bodies are dropped wholesale** — for this app a request body is a
  telemetry upload.
- **Breadcrumbs naming a `.ld`/`.ldx`/`.svm` file are discarded.** MoTeC
  exports are commonly saved as `<driver name> <track>.ld`.

**The honest limitation:** redaction is a denylist over the shapes this app is
known to produce. It cannot catch an arbitrary driver name inside an arbitrary
error string. Treat the Sentry project as potentially holding identifying data
and keep its access list short.

### The cost, and why the SDK is lazy

A static import of `@sentry/react` takes the bundle from **461.64 kB to
938.82 kB** (132 → 289 kB gzipped) — the SDK is larger than the product. It is
therefore behind a dynamic `import()`: with a DSN set the entry chunk stays
~466 kB and Sentry loads out of band as a separate ~156 kB gzipped chunk.

The accepted trade-off: an error thrown before that chunk resolves is buffered
and flushed on arrival, but an error that kills the page *during* that window
can still be lost. Full first-byte fidelity would cost 156 kB gzipped on every
visit, which is the wrong trade for this product.
