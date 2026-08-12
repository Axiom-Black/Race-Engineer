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

   The publishable key is **client-safe by design** — it grants nothing beyond
   what RLS allows. Do not use the service-role key here.
4. **Deploy.** Vercel gives a `*.vercel.app` URL. Every push to `main`
   redeploys automatically.

## One-time: Supabase demo-readiness

- **Frictionless signup (recommended for a demo):** Supabase → Authentication →
  Providers → Email → turn **"Confirm email" OFF**. Then a tester signs up and
  is immediately in (one step → populated demo dashboard). If you leave it ON,
  testers must click a confirmation link before first sign-in.
- **Redirect URLs:** Authentication → URL Configuration → add the
  `*.vercel.app` origin to **Site URL / Redirect URLs** (needed if you later
  enable email confirmation or magic links).
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
