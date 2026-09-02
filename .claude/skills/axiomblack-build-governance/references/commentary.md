# Axiom Black Build Governance — Tier 2 · Commentary

> **Load on demand, not front to back.** Read only the entry for the principle in tension with your
> current planning task, then return to work. Each entry gives the meaning, the waste it removes, how
> it shows up in an Axiom Black build, the anti-patterns it forbids, and how adherence is checked. The
> one-line principles and the decisions they force live in the skill body (Tier 1); this is the depth.

The five principles are the Lean canon (Womack & Jones), adopted as Axiom Black's build-governance
standard. Lean's aim is the relentless removal of *waste* — anything the customer would not pay for —
so that value flows to them as directly as possible. These entries translate that aim into how an
Axiom Black build is actually run.

---

## 1 — Define Value

**Meaning.** Value is defined by the customer, not the builder: it is what they actually want and
would pay for. Everything else is overhead at best and waste at worst. The principle demands you
name the customer and the value *first*, before designing or building, and attach a KPI so progress
toward that value is measurable rather than felt.

**The waste it removes.** Building the wrong thing well — the most expensive waste there is, because
it consumes a full cycle and produces nothing anyone wanted. Also removes the subtler waste of
un-measurable goals, where a team can work hard indefinitely without knowing if it is closer to done.

**In an Axiom Black build.** Every phase and every story opens with the value it delivers to a named
customer, and carries an acceptance criterion tied to a KPI. A phase plan whose milestones are
activities ("build the parser") rather than value with a metric ("driver can see a decoded session,
measured by a successful upload→report loop") has skipped this principle.

**Anti-patterns it forbids.**
- Starting to build before the customer and their value are written down.
- Objectives with no metric — "improve performance," "make it better" — that cannot be shown to be met.
- Value defined from the builder's convenience ("this is easy for us to ship") rather than the customer's want.

**How adherence is checked.** Every planned item can answer: who is the customer, what value do they
get, and what KPI shows progress? If any of the three is blank, the item is not ready to build.

---

## 2 — Map the Value Stream

**Meaning.** Lay out every step from raw idea to value delivered into the customer's hands, then
judge each step: does it add value the customer would pay for, or is it waste that merely feels like
progress? The deliverable is not just the map but an action plan to remove the waste it exposes.

**The waste it removes.** Hidden non-value steps — handoffs, approvals, rework loops, wait states,
duplicated effort — that accrete silently and are invisible until the whole stream is drawn out.

**In an Axiom Black build.** The path from a captured session to a delivered report, or from a code
change to a shipped feature, is mapped as a sequence, and each step is challenged. This is where the
testing-gate rings and the ingest-boundary decisions come from: they earn their place in the stream
because they add verifiable value, and steps that did not (a redundant manual check, a format
conversion nobody needed) are cut.

**Anti-patterns it forbids.**
- Keeping a step because "we've always done it," with no account of the value it adds.
- Optimizing one step in isolation while the end-to-end stream still stalls (local efficiency, global waste).
- Mapping the stream and then filing the map — the action plan to remove waste is the point.

**How adherence is checked.** For any process in the build, the full step sequence exists on paper,
each step is labeled value-add or waste, and the waste has a removal plan (or is already gone).

---

## 3 — Create Flow

**Meaning.** Once waste is removed, make the remaining value-adding steps move smoothly — without
delays, queues, or blocking dependencies between them. Then capture the smooth path as *standard
work*: a template, checklist, or gate, so the flow is repeatable and not reinvented each time.

**The waste it removes.** Waiting — the idle time between steps where work sits in a queue, blocked on
a handoff or a dependency. In software this is the stalled PR, the blocker worked around instead of
cleared, the setup redone from scratch on every project.

**In an Axiom Black build.** Work is sequenced so each step feeds the next without a stall; a blocker
is surfaced and cleared, never quietly bypassed. Recurring flows are frozen into reusable standard
work — the reason the Working Plan is written to be copied to the next tool verbatim, the reason the
testing gates are a fixed ring structure. Standard work is how flow survives beyond one project.

### The 80/20 Prioritization Matrix — the org's standard work for sequencing

Two axes, scored per candidate: **potential impact** (how much of the value in Principle 1 this
delivers) and **feasibility** (how ready we are to do it now — evidence in hand, dependencies
resolved, unknowns closed). Four quadrants, each with a different action:

| | **Low feasibility** | **High feasibility** |
| --- | --- | --- |
| **High impact** | **Start planning now** — the item is right, the readiness is not. Name the specific blocker and work it. | **Do it now!** — this is what active work is for. |
| **Low impact** | **Review only if you have time** — parked. | **Quick wins** — filler for gaps, never a queue-jumper. |

The matrix is deliberately about *readiness*, not *difficulty*. That distinction is what makes the
low-feasibility column actionable: feasibility is a blocker with a name, and Create Flow already
requires blockers to be surfaced and cleared rather than worked around. "Start planning now" is the
instruction to clear it — the quadrant is a queue for unblocking work, not a polite parking lot.

Two failure modes it exists to catch:

- **Quick wins crowding out the real work.** Easy items get done because they are easy, and the
  high-impact item that needed a decision or a measurement never starts. Impact outranks feasibility;
  a quick win fills a gap while a hard item unblocks, it does not go ahead of it.
- **Un-scored work reaching the top of the queue.** Rework is the tell. When a build produces a run
  of fixes to things already called done, the ordering — not the engineering — is what failed: the
  item was started before it was feasible.

**Anti-patterns it forbids.**
- Silently working around a blocker instead of surfacing and clearing it (the block stays for the next person).
- Reinventing a process each time because the smooth version was never captured as standard work.
- Big batches that sit waiting, instead of small units that flow.
- Working *Quick wins* ahead of *Do it now!* because they are easier to start.
- Filing a high-impact item under low feasibility and leaving it there — that quadrant is
  "start planning now", not "someday". An unnamed blocker is a parked blocker.
- Starting a high-impact item whose feasibility was never scored, and calling the resulting rework
  a quality problem when it was a sequencing one.

**How adherence is checked.** Blockers are visible and actively cleared, not parked; recurring work
has a captured standard (template/checklist/gate) rather than living in one person's head; and every
item in active work can name its matrix quadrant, with nothing in *Quick wins* running while a
*Do it now!* item waits.

---

## 4 — Establish Pull

**Meaning.** Produce only what is actually demanded, when it is demanded. Work is *pulled* into
production by real present need, not *pushed* out on speculation about what might be needed later.

**The waste it removes.** Overproduction — building inventory of features, abstractions, or
infrastructure ahead of demand, which then must be maintained, may never be used, and often has to be
undone when the real demand arrives shaped differently than guessed.

**In an Axiom Black build.** The backlog is explicitly parked — "pull only when it becomes Do Now" —
and scope enters active work by demand, not anticipation. Phase N's data decides Phase N+1; the later
phases are deliberately not planned in detail, because planning them now would be building inventory
of decisions that present reality will invalidate. This is the discipline behind sequencing the
high-margin, no-inference product first and activating the expensive agent tier only once a paying
base pulls for it.

**Pull decides whether; the matrix decides order.** Demand is a gate, not a ranking — several items
can be genuinely pulled at once, and then pull alone is silent on which moves first. That is where the
80/20 Prioritization Matrix (Principle 3) takes over: score the pulled set on impact × feasibility and
work the *Do it now!* quadrant. The two are not alternatives and neither substitutes for the other —
a high-impact, high-feasibility item with no demand behind it is still overproduction, and a pulled
item is still mis-sequenced if it was started before it was feasible.

**Anti-patterns it forbids.**
- Building a feature, abstraction, or service because it "will probably be needed."
- Detailed planning of far-future phases whose inputs do not yet exist.
- Speculative generality — architecture built for demand that has not arrived.
- Treating a high matrix score as a pull signal. Impact and feasibility rank what demand has already
  admitted; they cannot admit it.

**How adherence is checked.** Every item in active work can point to the present demand that pulled
it, *and* to the quadrant that put it ahead of the others. Anything built on "will be needed" is
challenged and, absent a real pull signal, returned to the parked backlog.

---

## 5 — Pursue Perfection

**Meaning.** Improvement never ends. Each cycle removes waste the previous cycle exposed, and the
learning is fed back into the value definition, the stream map, and the standard work. Crucially,
quality is never sacrificed for short-term speed — degraded quality slows the next cycle more than it
sped this one.

**The waste it removes.** Stagnation and accumulated defect debt — the slow decay where a system that
is "good enough" today becomes the drag that makes every future change expensive.

**In an Axiom Black build.** The loop closes rather than ending: what a phase teaches updates the
plan, the standards, and the templates. This is why the Codex and these standards are *living*, with
amendment protocols; why refactoring is continuous, not scheduled; and why "the only way to go fast
is to go well" is treated as literal operational guidance, not a slogan. A lesson costly enough to
prevent forever becomes an amendment.

**Anti-patterns it forbids.**
- Trading quality for a deadline (feels faster now, is slower by the next cycle — and violates the Codex).
- Treating improvement as a one-time "cleanup phase" that the schedule never grants.
- Learning a lesson and not feeding it back into value, stream, or standard work — the loop left open.

**How adherence is checked.** Each cycle produces at least one concrete improvement traceable to a
prior lesson; quality gates are not lowered under deadline pressure; lessons costly enough to recur
become amendments to the standards.

---

## Why these five, in this order

The order is not arbitrary; it is a pipeline. You must **define value** before you can **map the
stream** that delivers it; you map the stream before you can make the survivors **flow**; flow is what
makes **pull** possible (you can only build on demand if work moves fast enough to keep up with
demand); and **perfection** is the loop that feeds all four principles back on themselves, forever.
Skipping or reordering them breaks the chain — pull without flow just moves the queue; flow without a
value-stream map optimizes waste; a stream map without defined value optimizes toward the wrong goal.
