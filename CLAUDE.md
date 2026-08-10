# CLAUDE.md — ByteCraft Racing

## What this project is

ByteCraft Racing is a sim-racing telemetry and AI race-engineering platform for
Le Mans Ultimate (LMU), built by **Axiom Black, LLC** (Technology sub-brand,
orange accent `#FF8710`) with the ByteCraft Racing product identity (pink
`#FF2D78` on near-black). Drivers upload their MoTeC session exports
(`.ld` + `.ldx` + `.svm`), see a full telemetry breakdown, and — in later
phases — receive AI race-engineering debriefs from a ten-agent system.

## Read these first, in this order

1. `WORKING_PLAN.md` — the operational tracker. §0 status, §3 current stories,
   §4 standing bars (non-negotiable invariants), §5 decision log. **Update §0
   and §5 every work session — if it isn't written there, it didn't happen.**
2. `TESTING_GATES.md` — the Ring 0–4 promotion contract. Every push to `main`
   clears these gates or it doesn't push.
3. `ByteCraft_Racing_Phase_Plan.docx` — strategic phasing with acceptance
   criteria (Phase 0 done, Phase 1 = current).
4. `MoTeC_LD_format_findings.md` — byte-level reference for the `.ld`/`.ldx`
   binary decode. The parsers are grounded in this document; do not "improve"
   parser logic from assumptions, only from real-file evidence.
5. `ByteCraft_AI_Cost_Model.docx` — unit economics. Governs all Phase 2 agent
   work (model tiering, caching, metering).

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
2. **Close S1**: create and commit the sanitized `.ld`/`.ldx`/`.svm` fixture
   triple (strip driver name and any PII; game-world GPS coordinates are fine
   — they are not real-world locations). This unblocks Ring 0.
3. **Close S2**: `gh repo create` under the Axiom Black GitHub **organization**
   (not a personal account), private, push `main`, confirm CI runs Ring 0–1.
4. Port the in-browser parsers (`.ld`/`.ldx`/`.svm`) from the artifact JSX
   into proper modules with unit tests mirroring the Python suite
   (`test_parser_parity.py` defines the parity contract).
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
- **Unreliable data is flagged, never hidden** — known-bad LMU channels
  (Ambient/Track Temp) and known-empty GTE channels (Tyre Load, Grip Fract,
  Battery) display with explicit SIM/EMPTY flags.
- **Specialists never run on Opus** — dormant in the pilot (agent is dark)
  but the invariant tests stay in the repo and must keep passing/skipping.
- **Standards are audited** — code answers to Clean Code / Clean Architecture
  / Clean Agile. Log notable decisions in WORKING_PLAN §5.
- **Every increment is payable** — no infrastructure without a user-visible
  capability attached.

## Key technical facts (hard-won — do not rediscover)

- `.ld` decode formula: `phys = raw × mul / 10^dec + shift` (shift at record
  offset `0x18`, additive, in physical units). 70 channels, verified ranges.
- Driver name starts at `0x9E` (not `0xA0`).
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

Start: read WORKING_PLAN §0/§3. Work the smallest increment that leaves
something a driver would pay for. End: update WORKING_PLAN §0 and §5, run the
gates, commit. Cut scope before cutting quality.
