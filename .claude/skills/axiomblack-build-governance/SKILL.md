---
name: axiomblack-build-governance
description: >
  Axiom Black build governance — the mandatory PROCESS standard for how an agent and a
  human deliver software together. Governs the phase loop (Premise → Slice → Ground →
  Build → Prove → Close), what only a human can do and how to hand it off, what counts
  as proof, branch and merge discipline, and how decisions get logged. ALWAYS trigger
  when: opening or closing a phase, iteration, sprint or milestone; planning or slicing
  work; asking the human to do anything the agent cannot (authorise, click a dashboard,
  hold a credential, spend money, judge quality, supply real data); claiming something
  is done, verified, working or shipped; opening, merging or cleaning up a PR or branch;
  choosing between options that cost money or lock in a vendor; or writing a status
  update, retrospective or decision log. Also trigger on "what's next", "is this done",
  "ship it", "our process", "the process", "phase plan", "close the phase", "hand off",
  "acceptance criteria", "definition of done", "gates". Trigger proactively at the START
  of any multi-step build task and BEFORE reporting completion, even if process is not
  named. This is the PROCESS standard; axiomblack-de-codex is the CODE standard — they
  are complementary and both apply.
---

# Axiom Black Build Governance

The engineering standard (`axiomblack-de-codex`) governs *what good code is*. This
governs *how an agent and a human get it built and shipped without lying to each other*.

Every rule here was paid for by a real incident. None is inferred from principle.

**If the repo contains a delivery-process document** (`docs/agentic-delivery-process.md`
or equivalent), that document is this standard's local instance: it carries the
project's own phase history, retrofit and revision log, and it **wins on specifics**.
This skill is the portable core that applies with or without it.

---

## 1 · The one asymmetry everything else follows from

An agent can write, test, verify, audit and document faster and more consistently
than a human. An agent **cannot**:

- authorise anything (OAuth connections, app installs, org grants)
- hold a credential, or decide what a credential may reach
- click a dashboard the credential-holder owns
- spend money, or choose a billing tier
- judge whether a product's output is *good*
- supply real user data
- decide what the product is for

**Therefore the agent's job is to reduce every task to either (a) something it can
fully own, or (b) a single, precisely specified human action.**

> Vague handoffs are the dominant failure mode of this partnership — not bad code.

### 1.1 · Human-Only Action Register (MUST)

Maintain one list, in the tracker, of every outstanding human action. A human action
that lives only in chat scrollback is lost. Each entry carries an owner, the exact
action, and what is blocked until it happens.

### 1.2 · Handoff format (MUST)

An agent asking for a human action MUST give all five:

1. the exact navigation path (`Settings → Rules → New branch ruleset`)
2. the exact values, copy-pasteable
3. what breaks if it is skipped
4. what the agent will do the moment it is done
5. any **ordering constraint** with other human actions

> **Real failure this prevents.** "Re-enable Confirm email" was handed off without
> the ordering constraint. Enabling confirmation *before* adding the production
> redirect URL sends every new user a confirmation link pointing at `localhost`.
> Two one-line tasks, and the order is load-bearing.

### 1.3 · Capability probing (MUST)

Before planning around a capability, **exercise it once**. Never infer it from
documentation, from a similar tool, or from a previous session — and never assert a
limitation you have not hit.

> **Real failures.** (a) A whole branch-cleanup plan was written before discovering
> ref deletion returned `403` from that environment. (b) "Move the FastAPI service to
> Supabase Edge Functions" was impossible as stated — Edge Functions run Deno, the
> service was 2,272 lines of Python. (c) An agent asserted a platform tier could not
> protect private repos; the human pushed back, and probing showed the 403s were the
> agent's own environment. **Correct the record explicitly when this happens.**

---

## 2 · The phase loop

Six stages. A stage is not left until its exit condition is true.

| Stage | Owner | Exit condition |
| --- | --- | --- |
| **0 · Premise check** | agent | The request's stated premise has been tested against reality. Highest-leverage stage in the loop. |
| **1 · Slice** | agent proposes, human ratifies | Every slice is independent, small, and has exactly one acceptance test. No test, no story. |
| **2 · Ground** | agent (blocking) | Every format, API and assumption the build depends on is verified against a real artifact — not a doc, not a sample. |
| **3 · Build** | agent owns, human unblocks | Smallest increment that leaves something a user would pay for. |
| **4 · Prove** | agent | The five proofs (§4) hold. Most-skipped stage, and the most valuable. |
| **5 · Close** | agent writes, human confirms | Tracker, decision log and revision log updated. If it isn't written down, it didn't happen. |

**Stage 0 is not optional and not a formality.** Its job is to kill wrong work before
it is built.

> **Real saves.** Three pieces of work were cancelled at Stage 0 in a single phase:
> a share-link feature that did not serve the goal it was requested for, a
> model-provider switch worth ~$10/month, and a service "lift" to a runtime that
> could not host the language it was written in. Each was ~15 minutes of checking
> against days of building.

---

## 3 · Standing gates

Define a ring ladder — an ordered set of gates, each with an ID and a machine check —
and make **CI the authoritative version**. Where a prose table and the CI workflow
disagree, the workflow wins; fix the table.

Rules that hold regardless of the ladder's shape:

- **A gate that cannot fail is not a gate.** Every gate needs a negative case proving
  it goes red on the defect it exists to catch.
- **No push to the protected branch that has not cleared the ladder.**
- **A refused build is the guard working.** Do not route around it.

---

## 4 · The five proofs

Before claiming anything is done:

1. **It runs where the user is** — not only where the agent is.
2. **The artifact is real** — inspect the built output, not the build log.
3. **The negative case fails** — the check goes red when the defect is present.
4. **The data is the real data** — a fixture that has been convenienced into
   agreement proves nothing.
5. **The claim matches the evidence** — state what was measured, in what environment.

> **The pattern behind every production defect in one real phase — all six — was
> identical: a check passed in a friendlier environment than the one that mattered.**
> Green tests are not the proof. The proof runs where the user is.

**Anomalies are load-bearing.** An unexpected result is evidence, never noise. An
identical build hash across a substantial source change is how a hollow bundle
reached production once — the hash was noticed and dismissed.

---

## 5 · Decision protocol

- Present options with real costs, a recommendation, and what would change the answer.
- **Cost is never the whole answer** on a vendor or model choice — name the quality,
  lock-in and operational dimensions too, and say which are unmeasured.
- Decide with evidence where evidence is obtainable; where it is not, log the
  assumption as an assumption.
- **Log every notable decision in the tracker**, with the date and the reasoning.
  Reasoning at the time is worth keeping — correct stale docs with a
  superseded-assumptions banner rather than a silent rewrite.
- A decision the human has reaffirmed after hearing the concern is **made**. Proceed
  with the full request.

---

## 6 · Branch and merge discipline

- Branch from a freshly fetched protected branch. **Always fetch first.**
- Name after *what the change is*, never who wrote it.
- One logical change per branch.
- **Never stack new commits on already-merged history.** More work → fresh branch.
  Squash merges defeat `git branch --contains`; use `git merge-tree` to determine
  merged-ness by content.
- Delete the branch, local and remote, after its PR merges.
- Run the gates locally before opening a PR, and report the actual numbers.

---

## 7 · Reporting rules (MUST)

- Report outcomes faithfully. If tests fail, say so with the output. If a step was
  skipped, say that. When something is verified, state it plainly without hedging.
- **Disclose your own process violations** in the same breath as the fix.
- Never claim a capability, a figure or a limitation you have not verified. If the
  environment blocks verification, say that instead of asserting.
- Correct the record explicitly when you have been wrong, then move on.

---

## 8 · Maintenance

This standard is revised **at every phase close**, not on a schedule. The closing
stage adds a row to the revision log naming what the phase changed about the process
and why. A governance document that does not change after a phase either had a
perfect phase or was not consulted — assume the latter.

See `references/anti-patterns.md` for the incident catalogue this standard is derived
from, and `references/checklists.md` for the per-phase operating checklists.
