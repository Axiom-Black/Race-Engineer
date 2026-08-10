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
| **Last updated** | 9 Aug 2026 — Ring 1 gains G1.5; Ring 3 re-grounded on Supabase RLS (Clerk superseded); Ring 4 re-grounded as golden-master parity (no Python at pilot runtime) |

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
| **G1.1 Decode correctness** | Decoded values satisfy `phys = raw × mul / 10^dec + shift` and fall inside known physical ranges | The reverse-engineered formula is the product's foundation |
| **G1.2 Golden master** | Decoding the fixture matches the committed snapshot exactly; any drift fails for review | Catches silent format/parsing regressions (T6 — exhaustively test near bugs) |
| **G1.3 Quirks asserted** | Ambient/Track Temp flagged `reliable=False`; GTE Tyre Load / Grip Fract / Battery Charge flagged `all_zero`; lap boundaries read from the `.ld` Lap Number channel, **not** `.ldx` | A future change that silently "fixes" a known quirk must trip the gate, not slip through |
| **G1.4 Boundary conditions** | Empty channels, truncated files, and calibration-pending channels are handled without crashing | T5 — we get the middle right and misjudge the edges |
| **G1.5 Decode assumptions asserted** | Tripwire tests pin the open format questions to evidence: the `scale` field (record offset `0x1C`) is asserted to be 1 for all 70 channels (or the formula is extended and this gate updated); no datatype-category-3 channel decodes as float32 while being read as int32; the driver-name field offset matches the value verified against real bytes | The `shift`-term omission in the prototype JS parser is the cautionary tale — silent formula simplifications must trip a gate, not ship |

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

---

## 5 · Ring 4 — Golden-master parity *(pin the JS port to the verified Python truth)*

In the pilot the JS parsers are the **only** runtime implementation, but the *verified* implementation is the Python suite (128 tests, real-file grounded). Python doesn't run in CI or production; instead it generates the committed golden-master JSON (Ring 0 G0.1) **once per fixture change**, and this ring pins the JS port to it. Same intent as live two-implementation parity — drift between the port and the verified truth cannot ship — reshaped for a runtime with one implementation. (When the FastAPI service returns in Phase 2, live Python↔JS parity per `backend/tests/test_parser_parity.py` reactivates on top of this.)

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G4.1 Parser parity** | The JS parsers' decoded output on the fixture matches the committed Python-generated golden masters value-for-value (float tolerance only) | A port that quietly diverges from the verified decode is worse than no port |
| **G4.2 Domain classification parity** | Channel → agent-domain mapping matches the committed mapping snapshot | Mis-routing at the edge corrupts agent context (dormant consumer in the pilot; the mapping still drives the channel-inventory UI) |
| **G4.3 Golden masters are fresh** | The committed golden masters were regenerated from the current fixture (hash recorded alongside) | Stale truth data validates nothing |

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
