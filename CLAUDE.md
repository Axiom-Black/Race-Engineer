# CLAUDE.md — ByteCraft Racing

## What this project is

ByteCraft Racing is a sim-racing telemetry and AI race-engineering platform for
Le Mans Ultimate (LMU), built by **Axiom Black, LLC** (Technology sub-brand,
orange accent `#FF8710`) with the ByteCraft Racing product identity (pink
`#FF2D78` on near-black). Drivers upload their MoTeC session exports
(`.ld` + `.ldx` + `.svm`), see a full telemetry breakdown, and — in later
phases — receive AI race-engineering debriefs from a ten-agent system.

## Read these first, in this order

> **Governing procedure.** `docs/agentic-delivery-process.md` is the binding
> *process* for agent–human delivery: the six-stage phase loop, the Human-Only
> Action Register, the ring ladder, the five proofs, and the decision protocol.
> Read it before opening or closing a phase. It is revised at every phase close.
> Its portable core auto-loads as the **axiomblack-build-governance** skill
> (`.claude/skills/axiomblack-build-governance/`); the doc is this repo's
> instance of that standard and **wins on specifics** — phase history, the
> retrofit, the ring IDs and the revision log live there.
>
> **Governing standard.** The **Axiom Black DE Codex**
> (`.claude/skills/axiomblack-de-codex/`) is the binding engineering standard
> for all code in this repo — it auto-loads as a skill; conform to it by
> default and flag any divergence per its amendment protocol. Reusable *build
> methods* are recorded in `docs/build-breadcrumbs.md` — read Part A before
> starting new work, and append to it every session (the goal is compounding
> efficiency across builds). Layout, file-naming, branch and PR conventions
> live in `CONTRIBUTING.md`.

1. `WORKING_PLAN.md` — the operational tracker. §0 status, §3 current stories,
   §4 standing bars (non-negotiable invariants), §5 decision log. **Update §0
   and §5 every work session — if it isn't written there, it didn't happen.**
2. `TESTING_GATES.md` — the Ring 0–4 promotion contract. Every push to `main`
   clears these gates or it doesn't push.
3. `docs/phase-plan.md` — strategic phasing with acceptance
   criteria (Phase 0 done, Phase 1 = current).
4. `docs/motec-ld-format.md` — byte-level reference for the
   `.ld`/`.ldx` binary decode. The parsers are grounded in this document; do
   not "improve" parser logic from assumptions, only from real-file evidence.
5. `docs/ai-cost-model.md` — unit economics. Governs all Phase 2
   agent work (model tiering, caching, metering).

## Current mission — Tier 1 Pilot (Phase 1: Launch)

Ship the solo-driver telemetry product on a **$0/month stack**. The AI agent
stays dark this phase. Decided 9 Aug 2026; supersedes any conflicting hosting
notes in older docs.

**Stack (Tier 1):**
- **Frontend** — Vite + React SPA, deployed to **Vercel** (free tier).
- **Database / Auth / Storage** — **Supabase** (free tier): Postgres with a
  slimmed Phase 1 schema, Supabase Auth for identity, Row-Level Security for
  per-driver isolation, Storage buckets for raw `.ld`/`.ldx`/`.svm` files.
- **No Python/FastAPI backend in the pilot.** The browser talks to Supabase
  directly under RLS. This is a deliberate, logged deviation: Phase 1 has no
  agent, therefore no metering, therefore nothing for a backend gatekeeper to
  protect. The FastAPI service (already scaffolded in `backend/`) enters in
  Phase 2 when agent runs and quotas become real — at that point it becomes
  the **only writer** for metered operations.
- Parsing happens **client-side** (ports of the verified parsers); only
  summaries and downsampled traces (~400 points/lap) persist to Postgres.
  Raw files go to Storage. No TimescaleDB in the pilot; hypertables are a
  Phase 2+ migration decision, not a launch requirement.

**Pilot user flow:** sign up → upload the three-file set → client-side parse →
summaries persist → session dashboard (SessionReport + TrackMap) →
**cross-session Progression/trend view** (an explicit Phase 1 acceptance
criterion that has no committed artifact yet — it must exist before the pilot
is "done").

## First-session task order

1. Scaffold the Vite + React app (port `frontend/` scaffold conventions; keep
   `backend/` in the repo untouched — it is Phase 2 inventory, not dead code).
2. ~~Close S1~~ **Done 10 Aug 2026** — reference bundle received, reviewed,
   and merged: `backend/` scaffold (Python parsers = reference
   implementation), sanitized fixture triple, golden-master JSON, and
   `fixtures/FIXTURE_NOTES.md` resolving all open decode questions.
   124/124 backend unit tests pass against the fixture.
3. ~~Close S2~~ **Done 9 Aug 2026** — repo pushed to
   `github.com/Axiom-Black/Race-Engineer`. Remaining: GitHub Actions CI
   running Ring 0–1, plus branch protection on `main`.
4. Port the parsers **from the Python reference implementation**, not the
   artifact JSX — the JSX parser omits the `+ shift` decode term and is not
   the source of truth (reuse its UI only). Unit tests assert against the
   committed golden masters (`test_parser_parity.py` defines the contract;
   in the pilot it is enforced as JS-vs-golden-master).
5. Create the Supabase project (run cost confirmation first — free tier),
   apply the Phase 1 schema + RLS policies, wire Auth.
6. Port `ByteCraft_SessionReport.jsx` (Summary / Performance / Instruments /
   Track Map tabs, shared lap selector + synced cursor) and
   `ByteCraft_SessionUpload.jsx` into the app as real components.
7. Build the Progression/trend view against persisted multi-session data.
8. Deploy to Vercel; smoke-test the full flow with the real COTA files
   (locally held, never committed).

## Standing bars (from WORKING_PLAN.md §4 — a story violating one is not done)

- **Parsers grounded in real files** — no format assumption ships unverified
  against a real LMU export.
- **Three-file upload is atomic** — no session exists without
  `.ld` + `.ldx` + `.svm` together. In the pilot this is enforced client-side
  before insert AND by a database constraint / `ingest_status` check — a
  session row is not `complete` until all three storage paths are recorded.
- **Tenant isolation lives in the database** — RLS policies keyed on
  `auth.uid()`, never application `WHERE` clauses.
- **Unreliable data is flagged, never hidden** — known-empty GTE channels
  (Tyre Load, Grip Fract, Battery) and per-session all-zero channels display
  with explicit EMPTY flags, rendered in the UI. (Ambient/Track Temp were
  reclassified 10 Aug 2026 — see Key technical facts — and are no longer
  flagged; the bar itself is unchanged.)
- **Specialists never run on Opus** — dormant in the pilot (agent is dark)
  but the invariant tests stay in the repo and must keep passing/skipping.
- **Standards are audited** — code answers to Clean Code / Clean Architecture
  / Clean Agile. Log notable decisions in WORKING_PLAN §5.
- **Every increment is payable** — no infrastructure without a user-visible
  capability attached.

## Key technical facts (hard-won — do not rediscover)

- `.ld` decode formula (complete, resolved 10 Aug 2026 from real bytes):
  `phys = raw × mul / (scale × 10^dec) + shift` — `shift` at record offset
  `0x18` (additive, physical units); **`scale` at `0x1C` is a divisor**: 1 for
  67/70 channels, **50 for Ambient & Track Temperature, 9 for Steering Wheel
  Position**. 70 channels, verified ranges; golden masters in `fixtures/` are
  the arbiter. **The prototype JS parser omits both `shift` and `scale`** —
  that's why 9 channels (throttle, brake, clutch, steering ×2, G-force ×3,
  fuel) show `CAL` badges in it. S3 ports the full formula.
- **Ambient/Track Temp are NOT unreliable** (reclassified 10 Aug 2026): the
  old `reliable=False` flag was masking our dropped-`scale` decode bug
  (−265 °C garbage), not an LMU defect. With the full formula they decode
  correctly (~29/39 °C in the fixture). Do not re-flag them; G1.3 trips.
- **No float32 channels.** The only 4-byte channels are the GPS pair,
  decoded as int32 (float32 reading gives ±1e38 garbage). The signed-int
  size map `{1:int8, 2:int16, 4:int32}` is correct for all LMU exports seen.
- Driver name starts at `0x9E` (not `0xA0`) — **confirmed by byte inspection**
  10 Aug 2026; the findings doc's `0xA0` was off by two and is corrected.
  The committed fixture carries `DRIVER_REDACTED` in that field.
- `.ldx` carries lap **summary only** (total laps, fastest lap/time) — **no
  per-lap boundary markers**. Lap segmentation comes from the `.ld`'s own
  Beacon / Lap Number channels.
- Setup source priority: **`.ldx` first** (clean XML, pre-decoded engineering
  units), `.svm` as fallback for truncated fields — MoTeC truncates
  `_Setup_BrakePressure` in the `.ldx` (known export bug; detector exists).
- `.svm` is INI-style with `Key=N//human value` lines (CRLF); the real value
  lives in the `//` comment, the integer is a click-index. Energy branch:
  Hypercar/LMGT3 carry `VirtualEnergySetting`; GTE/LMP2/LMP3 carry fuel.
- Corner auto-detection (GPS curvature) reads multi-apex complexes as single
  corners (16 detected at COTA vs official 20) — acceptable for the pilot;
  the curated corner registry fixes it in Phase 3.
- GPS channels are game-world coordinates dressed as lat/lon (nominally in
  the Pacific). Relative positions are exact; never overlay on real maps.

## Commands

The npm project is `frontend/` — there is no root `package.json`. The Python
reference implementation is `backend/`. Run commands from those directories.

| What | Command | Gate |
| --- | --- | --- |
| Frontend tests (golden-master parity) | `cd frontend && npx vitest run` | Ring 4 |
| Frontend lint | `cd frontend && npm run lint` | — |
| Frontend build | `cd frontend && npm run build` | Ring 5 |
| Frontend dev server | `cd frontend && npm run dev` | — |
| Backend unit suite | `cd backend && pip install -e ".[dev]" && python -m pytest tests/unit/ -q` | Ring 1 |
| RLS / tenancy acceptance | apply `supabase/tests/00_auth_shim.sql`, then `supabase/migrations/*.sql` in filename order, then `supabase/tests/01_rls_acceptance.sql` against a scratch Postgres | Ring 3 |

`.github/workflows/ci.yml` is the authoritative version of every command above;
if this table and the workflow disagree, the workflow wins — fix the table.

**The build needs env vars, by design.** `npm run build` **refuses** to run
without `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (Ring 5 / G5.1)
— without them Vite inlines `undefined`, the minifier strips the whole app
behind the throw in `lib/supabase.js`, and the deploy serves a blank page. A
refused build is the guard working, not a broken checkout. Locally: copy
`frontend/.env.example` to `frontend/.env.local`. Because Vite inlines the
values at **build** time, changing one anywhere — including Vercel — requires a
**rebuild**, not a restart.

**Cloud sessions.** `.claude/settings.json` registers a `SessionStart` hook that
runs `scripts/cloud_setup.sh`, which installs `frontend/` dependencies (and
repairs the rolldown optional-binding gap) when `CLAUDE_CODE_REMOTE=true`. It
deliberately skips the backend's Python deps — install those by hand when you
need the Ring 1 suite. It also writes `frontend/.env.local` from the cloud
environment's `NEXT_PUBLIC_SUPABASE_*` variables, which carry the right values
under Next.js names that Vite cannot see; without that bridge every cloud
session's build and dev server fail.

## Branch rules

Full conventions live in `CONTRIBUTING.md`; the load-bearing ones:

- Branch from current `origin/main` — **always fetch first**.
- Name after *what the change is*, never who wrote it:
  `feat/<slug>` · `fix/<slug>` · `chore/<slug>` · `docs/<slug>`.
- One logical change per branch; keep them small and separately reviewable.
- Delete the branch (local and remote) after its PR merges.
- **Never stack new commits on already-merged history.** More work → fresh
  branch from `main`.
- Every push to `main` clears the Ring 0–4 gates in `TESTING_GATES.md`, or it
  doesn't push.
- Migration filenames are load-bearing — never rename an applied migration;
  add a new one.

## Licensing & dependencies

- Repo is **private and proprietary**. `LICENSE` file must read:
  "Copyright © 2026 Axiom Black, LLC. All rights reserved. Proprietary and
  confidential. No use, copying, or distribution without written permission."
- **No AGPL or GPL dependencies without explicit owner sign-off.** Check the
  license of every new package before adding it (MIT/BSD/Apache are fine).
- Keep `ingest/motec` cleanly extractable — it is a candidate for a future
  standalone Apache-2.0 open-source release (Phase 3 marketing decision).

## Deferred — do not build in the pilot (park proposals in WORKING_PLAN §6)

Agent runs server-side · metering/quotas enforced · prompt caching · Stripe
billing · garage accounts & pooled quotas · Clerk (superseded — Supabase Auth
owns identity now) · TimescaleDB hypertables · corner registry · published
dossier pipeline · second sim title · live voice coaching.

**Model-provider note:** a DeepSeek V4 cost comparison (9 Aug 2026) showed
~10× cheaper runs; decision deferred to Phase 2 pending a blind quality A/B of
synthesizer output on the real COTA session. Keep model choice isolated behind
`RunConfig` so the swap stays a config change.

## Environment & accounts

- Supabase and Vercel via their CLIs (`supabase login`, `vercel login`) —
  authenticate once, then all deploys are CLI-driven (matches future CI).
- GitHub via `gh` CLI; repo lives under the Axiom Black organization.
- Real COTA session files (with driver PII) stay **local only** — used for
  smoke tests, never committed. The sanitized fixture is the repo's test data.

## Session ritual

Start: load the **DE Codex** (governs the work) and read WORKING_PLAN §0/§3 +
`docs/build-breadcrumbs.md` Part A. Work the smallest increment that leaves
something a driver would pay for. End: update WORKING_PLAN §0 and §5, append a
`build-breadcrumbs.md` trail entry (promote anything durable into Part A), run
the gates, commit. Cut scope before cutting quality.
