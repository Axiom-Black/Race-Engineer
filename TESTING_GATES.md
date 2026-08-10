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
| **Last updated** | _(update this line every time a gate changes)_ |

---

## 1 · Ring 0 — Fixture integrity *(runs first, blocks everything)*

No test runs without safe test data, and no unsafe data ever enters the repo. This is the last open Phase 0 item (Working Plan S1) promoted to a permanent gate.

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G0.1 Fixture present** | A sanitized `.ld` / `.ldx` / `.svm` triple is committed and the parser suites can run against it | Unblocks the GitHub push (S2) without shipping driver PII |
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

Blocks any push touching identity. Depends on Clerk JWT landing (Working Plan S3) — the unlock under everything server-side.

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G3.1 Role claim** | A signed JWT carries a role claim (driver / garage-admin / product-admin) the API can read | S3 acceptance test |
| **G3.2 RLS isolation** | As garage-admin, a cross-garage read returns **0 rows at the DB layer** | S4 acceptance test — isolation enforced below the app, not in it |
| **G3.3 Gating not client-side** | Role gating is enforced server-side; the prototype's client-side gating is not the security boundary | Known prototype issue — must not harden into the real path |

---

## 5 · Ring 4 — Prototype parity *(catch drift between mock and production)*

The in-browser JS parsers in `ByteCraft_SessionUpload.jsx` are a second implementation of the `.ld` logic. Two implementations drift; this ring pins them together.

| Gate | Green when… | Rationale |
| --- | --- | --- |
| **G4.1 Parser parity** | The Python backend parser and the JS port produce identical decoded output on the same fixture | A mock that quietly diverges from production is worse than no mock |
| **G4.2 Domain classification parity** | Channel → agent-domain mapping matches between prototype and backend | Mis-routing at the edge corrupts agent context |

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
