# ByteCraft Racing — Testing Gates

> **What this is.** The promotion contract that sits between the prototype (Project artifacts)
> and production (Claude Code / server-side). The *Working Plan* says *what we're doing and whether
> it's done*. This says *what a change must survive before it earns the right to ship*.
> Keep this in the repo root next to `WORKING_PLAN.md`. Every push to `main` clears these gates or it doesn't push.
> The ring structure is generic on purpose — copy it to gate the next Claude-built tool.

---

## 0 · The one rule

**A change is promotable when every ring below is green in CI. A change that fails any ring is not eligible for promotion, regardless of how well its own feature tests pass.** Rings promote *inward*: Ring 0 must be green before Ring 1 is even evaluated, and so on. This is the same discipline as the Working Plan's *Standing bars* — a story that violates an invariant is not done.

| Field | Value |
| --- | --- |
| **Applies to** | Any push to `main`; any code leaving the prototype for Claude Code / server-side |
| **Enforced by** | GitHub Actions CI — rings run as ordered, dependent jobs |
| **Determinism** | Blocking gates never call the live Anthropic API (canned fixtures only). One live smoke test runs *outside* the gate. |
| **Guiding source** | *Clean Code* T1–T9 heuristics · *Clean Agile* (acceptance-test-as-done) |
| **Last updated** | 28 Aug 2026 — **Ring 3 gains G3.7–G3.11.** G3.7/G3.8 pin Track Notes' revise-within-a-session and accumulate-across-sessions rule; G3.9 asserts a note outlives the session that produced it (readable, marked orphaned); G3.10 that revision stays enforced once the FK is nulled — SQL NULLs compare as distinct, so a unique key over the nullable column would silently stop constraining anything; G3.11 that `applied_migrations()` exposes the migration ledger's version column and **not** the DDL in `schema_migrations.statements`. G3.1/G3.2 extended to notes in all four directions (read, forged insert, cross-tenant update and delete), because free text a driver writes about their own driving is a worse class of leak than a telemetry row. *(10 Aug: G1.1 formula gains the `scale` divisor; G1.3 rewritten after the temp-channel reclassification — the "unreliable" flag was our dropped-`scale` bug, not an LMU quirk; G1.5 tripwires pinned. 9 Aug: G1.5 added; Ring 3 → Supabase RLS; Ring 4 → golden-master parity.)* |

---

## 1 · Ring 0 — Fixture integrity *(runs first, blocks everything)*

No test runs without safe test data, and no unsafe data ever enters the repo. This is the last open Phase 0 item (Working Plan S1) promoted to a permanent gate.

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G0.1 Fixture present** | A sanitized `.ld` / `.ldx` / `.svm` triple **and its Python-generated golden-master JSON** are committed under `fixtures/` and the parser suites can run against them | Safe test data plus the decode truth it must match, without shipping driver PII |
| **G0.2 No raw telemetry** | CI scan finds no un-sanitized export: no real driver identifiers, no real-world GPS coordinates outside the game-world coordinate space | The repo must be publishable; telemetry is user data |

**Standing bar:** if Ring 0 is red, CI stops here. Nothing downstream is trustworthy on bad data.

---

## 2 · Ring 1 — Parser truth *(pure functions, no mocks)*

The three parsers are pure functions with a full suite already passing. This ring keeps them honest against real files and freezes the documented reality of LMU exports.

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G1.1 Decode correctness** | Decoded values satisfy `phys = raw × mul / (scale × 10^dec) + shift` and fall inside known physical ranges | The reverse-engineered formula is the product's foundation — and it has already grown twice (`shift`, then `scale`); the golden masters are the arbiter |
| **G1.2 Golden master** | Decoding the fixture matches the committed snapshot exactly; any drift fails for review | Catches silent format/parsing regressions (T6 — exhaustively test near bugs) |
| **G1.3 Quirks asserted** | GTE Tyre Load / Grip Fract / Battery Charge flagged `all_zero` (plus any per-session all-zero channel, e.g. Steering Wheel Position in the fixture session); Ambient/Track Temp decode via `scale=50` to plausible temperatures and are **not** flagged unreliable; lap boundaries read from the `.ld` Lap Number channel, **not** `.ldx` | A change that silently alters a documented quirk must trip the gate. *(History: temps were flagged `reliable=False` until 10 Aug 2026, when byte evidence showed the flag was masking our dropped-`scale` decode bug — the gate now asserts the corrected reality, and re-flagging them would trip it just as hiding a real quirk would.)* |
| **G1.4 Boundary conditions** | Empty channels, truncated files, and calibration-pending channels are handled without crashing | T5 — we get the middle right and misjudge the edges |
| **G1.5 Decode assumptions asserted** | Tripwire tests pin the format facts resolved 10 Aug 2026 from real bytes (`fixtures/FIXTURE_NOTES.md`): `scale = 1` for 67/70 channels, `50` for Ambient & Track Temperature, `9` for Steering Wheel Position; no channel is float32 — the only 4-byte channels are the GPS pair, decoded as int32; the driver-name field starts at `0x9E` | The `shift`- and `scale`-term omissions in the prototype JS parser are the cautionary tale — silent formula simplifications must trip a gate, not ship |

**Standing bar:** no format assumption ships unverified against a real LMU export. The `.svm` guess-vs-reality miss is the cautionary tale — engineering values live in `//`-comments, not the click-index field.

---

## 3 · Ring 2 — Agent contracts *(deterministic, no live API)*

The ring most absent from a mocked prototype. Agent output is non-deterministic, so we do **not** test generated text. We test **structure, routing, and cost invariants** against canned Anthropic responses.

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G2.1 Schema contract** | Every specialist returns JSON valid against its fixed schema; malformed output is rejected | Structured output is the UX *and* the cost control (output bills 5× input) |
| **G2.2 Model-tiering invariant** | Specialists never resolve to Opus; Sonnet only for Orchestrator/Synthesizer; Opus only on Deep runs | Working Plan S6 — promoted from one-time check to permanent gate |
| **G2.3 Cache invariant** | A 2nd identical run shows ≥ 60% cached input | The curated libraries are global/static — caching them is Lever 2 |
| **G2.4 Orchestrator routing** | Given a fixed telemetry packet, exactly the correct specialists fire | Routing bugs waste tokens and corrupt the Synthesizer's input |
| **G2.5 Run completes** | A Standard run completes server-side < 60 s and writes tokens + cost to `agent_runs` | S5 acceptance test |

**Standing bar:** blocking gates use recorded fixture responses, never the live API. Determinism keeps the gate free and repeatable. The single live smoke test lives in §6.

---

## 4 · Ring 3 — Auth & tenancy *(the identity gate)*

Blocks any push touching identity. **Identity = Supabase Auth** (Clerk superseded, 9 Aug 2026). In the pilot every user is a driver and isolation is per-driver; the role system (driver / garage-admin / product-admin) arrives in Phase 2 as JWT claims on the same Supabase identity spine.

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G3.1 RLS everywhere** | Every table and storage bucket carries an RLS policy keyed on `auth.uid()`; no table is readable/writable via the anon key beyond its policy | Working Plan S4 acceptance test — the browser talks to Supabase directly, so RLS **is** the API boundary |
| **G3.2 RLS isolation** | An authenticated cross-user read (Phase 2: cross-garage) returns **0 rows at the DB layer** | Isolation enforced below the app, not in it |
| **G3.3 Gating not client-side** | Access control is enforced by RLS/database constraints; client-side checks (including the atomic three-file check) exist for UX only and are never the security boundary | Known prototype issue — must not harden into the real path |
| **G3.4 Atomicity at the DB** | A session row cannot reach `complete` status unless all three storage paths (`.ld`/`.ldx`/`.svm`) are recorded — enforced by constraint/`ingest_status`, verified by test | Standing bar: three-file upload is atomic, even against a hand-crafted client |
| **G3.5 Own-object overwrite permitted** | A driver can overwrite an object under their own `auth.uid()` prefix | Every upload passes `{ upsert: true }`, and an upsert onto an existing object is an **UPDATE**. Without an UPDATE policy the retry-after-partial-failure path — the reason `upsert` is there — fails with an RLS violation *(added 17 Aug 2026; see the note below)* |
| **G3.6 Overwrite stops at the tenant boundary** | The same UPDATE affects **0 rows** when aimed at another driver's object | An UPDATE policy is the easiest place to widen isolation by accident, so the negative case is asserted alongside the positive |
| **G3.7 A note revises within its session** | A second note on the same anchor from the **same** session collides on `(user_id, track_key, anchor_key, session_key)` | Within one session the driver is refining a single observation, not accumulating two — the client upserts on this key, so the constraint is what makes "revise" mean revise *(added 26 Aug 2026, W0.3)* |
| **G3.8 Notes accumulate across sessions** | The same anchor from a **different** session inserts alongside rather than colliding | T4 in the wet and T4 in the dry are both true and neither should overwrite the other. A unique key without `session_key` in it fails this |
| **G3.9 A note outlives its session** | Deleting the session leaves the note **present, readable and marked orphaned** — body, car and conditions intact, `source_session_id` null | The single assertion separating `on delete set null` from the `cascade` used for laps. A session is a recording; a note is knowledge. Get it wrong and a driver clearing space silently destroys their own track guide |
| **G3.10 Revision survives the deletion** | An orphaned anchor still rejects a duplicate revision | `session_key` is text and never nulled for exactly this reason: SQL NULLs compare as **distinct**, so a unique key built on the nullable FK would stop constraining anything the moment a session was deleted, and one anchor could take unlimited duplicates |
| **G3.11 Migration ledger is readable, the DDL is not** | A signed-in driver can call `public.applied_migrations()` and read version strings; the underlying `supabase_migrations.schema_migrations` stays **unreadable**, and the function does not return its `statements` column | The drift check needs the ledger, and `statements` holds the SQL of every table and policy in the project. A plain GRANT would have handed the full DDL to every browser. SECURITY DEFINER is the one place code runs with more privilege than its caller, so it is asserted rather than assumed *(added 28 Aug 2026)* |
| **G3.2/G3.1 extended to notes** | B sees **0** of A's notes, cannot forge one owned by A, and B's UPDATE and DELETE against A's notes both affect **0 rows** | Notes are free text a driver writes about their own driving — a worse class of leak than a telemetry row, so all four directions are asserted rather than the read alone |

**How G3.5 was found, and why the pairing matters.** Not by a failing test —
by auditing the live Supabase project's policies against what the client code
actually does. The Phase 1 migration granted SELECT/INSERT/DELETE on
`storage.objects` and nothing else, while all four uploads in
`lib/sessions.js` pass `{ upsert: true }`. `rollbackSession()` masked it most
of the time by deleting orphans, but it cannot run when the failure is a
closed tab or a dropped connection — exactly when a retry is needed.

Both gates were verified to have teeth before landing: with the fix migration
omitted the suite exits **3** on G3.5, and with it applied all seven checks
pass. A gate that passes in both states would have been worse than none.

---

## 5 · Ring 4 — Golden-master parity *(pin the JS port to the verified Python truth)*

In the pilot the JS parsers are the **only** runtime implementation, but the *verified* implementation is the Python suite (128 tests, real-file grounded). Python doesn't run in CI or production; instead it generates the committed golden-master JSON (Ring 0 G0.1) **once per fixture change**, and this ring pins the JS port to it. Same intent as live two-implementation parity — drift between the port and the verified truth cannot ship — reshaped for a runtime with one implementation. (When the FastAPI service returns in Phase 2, live Python↔JS parity per `backend/tests/test_parser_parity.py` reactivates on top of this.)

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G4.1 Parser parity** | The JS parsers' decoded output on the fixture matches the committed Python-generated golden masters value-for-value (float tolerance only) | A port that quietly diverges from the verified decode is worse than no port |
| **G4.2 Domain classification parity** | Channel → agent-domain mapping matches the committed mapping snapshot | Mis-routing at the edge corrupts agent context (dormant consumer in the pilot; the mapping still drives the channel-inventory UI) |
| **G4.3 Golden masters are fresh** | The committed golden masters were regenerated from the current fixture (hash recorded alongside), **and `backend/scripts/generate_golden_masters.py --check` reproduces them** | Stale truth data validates nothing. Until 21 Aug 2026 there was no committed generator, so "generated from exactly these bytes" was a promise; the `--check` run in Ring 1 makes it a test |

**Golden-master format v2 (21 Aug 2026).** G4.1 now compares a **SHA-256 over
each channel's complete decoded array** instead of a value-by-value walk of
embedded arrays. The reason is the P0 fixture: it carries **412,850 decoded
values** across 70 channels at nine different logging rates, and embedding them
would commit ~6 MB of JSON and re-read it on every CI run. The hashed master is
**33 KB** and asserts *more* than the alternative of decimating, which cannot
see a regression between the samples it keeps. Extremes and the first/last five
values stay in plain text so a failure is diagnosable, not just detectable.

The assertion is only as good as the canonical form being identical in both
runtimes — 6 fixed decimals, negative zero normalised (Python renders `-0.0` as
`-0.000000`, JS's `toFixed` gives `0.000000`), joined by `,`, hashed as UTF-8.
All 70 channel hashes were verified to agree between Python and JavaScript
before this landed; if they ever diverge, the canonical form is the first thing
to check, not the decode.

---

## 5a · Ring 5 — Deployable artifact *(does the thing we ship contain the product?)*

**Added 17 Aug 2026** — an amendment to the ring contract, prompted by a real
miss rather than a hypothetical. See WORKING_PLAN §5.

Rings 0–4 all test **source**. They were entirely green while `npm run build`
was emitting a bundle with **no application in it**. Vite inlines
`import.meta.env` at build time; with the Supabase variables absent, the
unconditional throw in `src/lib/supabase.js` became statically reachable and
the minifier dead-code-eliminated everything behind it. The build exited 0 and
produced a plausible-looking 198.70 kB bundle — against 461.64 kB when
configured. Deployed, that artifact serves a blank page and logs nothing.

This ring exists because *"the tests are green"* and *"the artifact we ship
actually contains the product"* turned out to be two different claims. It is
the last ring before a deploy and it tests the **build output**, not the code.

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G5.1 Unconfigured build is refused** | `npm run build` with no Supabase env vars **fails** (non-zero exit), via the guard in `vite.config.js` | A build that can't produce a working app must say so, not exit 0 with a hollow bundle |
| **G5.2 Configured build contains the app** | A build with placeholder env vars emits a bundle that contains application code and is ≥ 300 kB | Proves the component tree survived tree-shaking; the size floor catches a partial strip that a string match alone would miss |

**Operational corollary, for any hosted environment:** because the values are
inlined at build time, changing an environment variable requires a **rebuild**.
Setting it and restarting does nothing.

---

## 6 · Outside the gate *(non-blocking)*

Runs on a schedule or on-demand, never blocking a push:

- **Live smoke test** — one real Standard run against the live Anthropic API; asserts a well-formed report and logs actual cost vs. the model's ~$0.10 target. Alerts on cost drift; does not block.
- **Coverage report** — T2, a *report*, not a gate. Surfaces untested modules for triage into the Working Plan. Coverage is not the goal; courage is.

---

## 7 · Reusing this file for the next tool

The rings are the reusable skeleton — swap the contents:

1. **Ring 0** — whatever "safe test data present, unsafe data absent" means for that tool.
2. **Ring 1** — the pure-function core (parsers, calculators) truth-tested against real inputs.
3. **Ring 2** — any non-deterministic component: test contract + invariants, not output.
4. **Ring 3** — auth/tenancy if it's multi-tenant.
5. **Ring 4** — parity between any prototype and its production twin.
6. **§6** — everything that informs but must not block.
