# The Axiom Black Codex — Tier 2 · Commentary

> **Load on demand, not front to back.** Read only the entry for the law that is in tension with
> your current task, then return to work. Each entry gives the reason, the war story that earned it,
> the principle-level illustration, and how the law is enforced. The one-line laws themselves live in
> the skill body (Tier 1); this file is the depth behind them.

---

# TIER 2 · THE COMMENTARY

> Read an entry when its law applies to your task. Each entry gives the reason, the story that earned it where one exists, a principle-level illustration, and how the law is enforced.

## Canon I — Ground Truth

**I.1 — Verify against reality, never against specification alone.**
A specification describes what a format or system is *supposed* to do; reality is what it *does*. When these differ, reality wins, and it is the one you must build against.
*Story:* A parser for a setup-file format was written to a plausible, documented-looking structure. The real files turned out to be an entirely different shape — the meaningful values lived in trailing comments, not the fields the guess targeted. Every test passed against the guessed fixtures and every one was worthless. The rewrite began by opening a real file and reading the actual bytes.
*Principle:* Before you write the parser, open the artifact. Before you code to the API doc, call the API. Ground the first line in an observed fact.
*Enforced by:* Fixtures derived from real captured inputs, committed to the repo; a standing bar that no format assumption ships unverified against a real sample.

**I.2 — A passing common case is not proof.**
Most inputs exercise the easy path. The rule is only proven by the inputs that would expose it if it were wrong.
*Story:* A decode formula was `raw × mul / 10^dec + shift`. It produced correct values for sixty-seven of seventy channels, and the suite was green. It was still wrong: three channels carried a `scale` divisor the formula ignored, and those three decoded to physical nonsense (a temperature reading of −265°C). The bug hid precisely because the common case passed. It was caught only by checking the channels whose real-world range was known independently.
*Principle:* For every calculation, find an input whose correct output you know from outside the system, and test that. The known-answer case is worth more than a hundred cases you cannot check.
*Enforced by:* Golden-master snapshots that pin the full decoded output; known-physical-range assertions as permanent gates.

**I.3 — Cross-validate from independent sources.**
One source giving an expected number is consistent with that source being wrong in an expected way. Two independent sources agreeing is much stronger evidence.
*Story:* A fuel-level channel decoded to a maximum of 93 litres. The car's separate setup file independently specified a 93-litre fuel load. Two files, parsed by two different code paths, agreed — that agreement is what promoted the decode from "looks plausible" to "trusted."
*Principle:* When you can derive the same fact two ways, do, and assert they match. Divergence is a bug you would otherwise have shipped.
*Enforced by:* Cross-source assertions in the test suite where independent derivations exist.

**I.4 — Flag unreliable data; never hide or fake it.**
The credibility of a system that reports data rests entirely on its honesty about that data's quality. One fabricated-looking "reasonable" value, once discovered, poisons trust in every real value beside it.
*Story:* A simulator exported ambient- and track-temperature channels containing garbage, and left several tyre channels all-zero for one car class. The choice was to display them flagged — explicitly marked unreliable or empty — rather than hide them or substitute a plausible guess. The user can see exactly what is trustworthy and what is not.
*Principle:* Bad data gets a label, not a mask and not a mannequin. "We don't have this" is a valid, trust-preserving answer. "Here's a number we made up so the panel looks full" is not.
*Enforced by:* Explicit quality flags on data at the boundary; gates that assert known-bad inputs stay flagged and are never silently "fixed."

**I.5 — Resolve disputes by evidence.**
When two records or two people disagree about a fact, the answer is not whichever is more authoritative or more senior. It is whichever the underlying reality supports.
*Story:* Internal documents disagreed about a byte offset — one said one value, another said a value two bytes over. The resolution was not to trust the more official-looking document. It was to look at the actual bytes, find where the real data began, and correct whichever document was wrong.
*Principle:* A disagreement is a prompt to go measure, not to hold a vote. Then fix the record that was wrong so the dispute does not recur.
*Enforced by:* Culture and review; disputes close with a cited observation, not an assertion.

**I.6 — Know where truth actually lives.**
Data is often available in more than one place, and the convenient place is often not the authoritative one. Reading from the wrong place produces answers that are right until, one day, they silently are not.
*Story:* Two companion files described the same session. One carried only a summary; the true per-segment boundaries lived only in the other. Reading boundaries from the summary file would have appeared to work on simple sessions and failed quietly on complex ones. The rule became: boundaries come from the authoritative channel, full stop.
*Principle:* For each fact, identify the source of record and read from it, even when a cheaper approximation is at hand.
*Enforced by:* Documented source-of-record per fact; review rejects reads from convenient-but-non-authoritative locations.

## Canon II — Architecture

**II.1 — Dependencies point inward.**
The most valuable, longest-lived code is the policy at the center — the rules that express what the business actually does. It must not depend on the volatile details at the edges. When policy depends on detail, every change to a detail threatens the rules.
*Principle:* Business rules know nothing of databases, transport formats, or UI frameworks. Those know about the rules. The arrow of dependency runs toward stability.
*Enforced by:* Module-boundary review; the core has no import path to the edges.

**II.2 — Details live at the boundary.**
A file format, a specific vendor, a framework, a storage engine — each is a detail that will one day change or be replaced. Contain each behind a single boundary so that day is a contained edit, not an excavation.
*Story:* A gnarly reverse-engineered binary format was confined to one ingest module. Nothing elsewhere in the system knew or cared how those bytes were laid out; they received clean, decoded values. When a second data source arrived later, it slotted in as a sibling behind the same boundary — the rest of the system did not move.
*Principle:* If replacing a vendor or format touches more than one module, the boundary was drawn wrong.
*Enforced by:* Boundary review; format-specific logic appears in exactly one place.

**II.3 — The architecture announces its purpose.**
Open the top level of a project and it should tell you what the system *does* — the domain — not merely which framework built it. A directory tree that screams the framework and whispers the purpose is upside down.
*Principle:* Name and organize modules after the problem domain. The framework is a detail (see II.2); it does not get to be the headline.
*Enforced by:* Structure review at project inception and at each major addition.

**II.4 — One source of truth per fact.**
A fact stored in two places is two facts that happen to agree today. Under maintenance they drift, and the system ships the contradiction.
*Story:* A configuration table in the database mirrored a set of allowances defined in application code. This duplication was recognized and documented as a known debt, with the honest note that the two must be changed together until one is generated from the other. Naming the smell is the minimum; the goal is to remove it.
*Principle:* Derive, reference, or generate — do not copy. Where copying is temporarily unavoidable, document the coupling loudly and plan its removal.
*Enforced by:* Review; duplication of knowledge is flagged and either removed or explicitly debt-tracked.

**II.5 — Derived values recompute when inputs change.**
A value computed from inputs is a claim about those inputs. If the inputs change and the value does not, the claim becomes a lie, silently.
*Story:* A performance panel computed its metrics once, from a single default selection, and then never recomputed when the user changed the selection. The numbers sat frozen — describing one thing while labeled as another. The fix was to make the derivation a function of the current selection, so the display could never disagree with what it claimed to show.
*Principle:* Prefer computing derived state from current inputs over storing and updating it. If you must cache it, invalidate on input change without exception.
*Enforced by:* Review; frozen-derived-value bugs are a named anti-pattern.

**II.6 — Isolate change from stability.**
Parts of a system change at different rates. A thing that changes weekly and a thing that changes yearly do not belong welded together, or the stable thing inherits the volatile thing's churn.
*Principle:* Separate the fast-moving from the slow-moving along a clean seam, so the fast part can be replaced without disturbing the slow part.
*Enforced by:* Boundary review; volatility is a design axis.

## Canon III — Craft

**III.1 — Names reveal intent.**
The reader spends far more time reading code than you spent writing it. A name that states what a thing is and why it exists repays that time on every read.
*Principle:* If a name needs a comment to explain what it holds, the name is wrong. Rename until the comment is redundant.

**III.2 — One thing, one level of abstraction.**
A unit that does one thing can be understood, named, tested, and reused. A unit that does several can be none of those cleanly. Mixing high-level orchestration with low-level mechanics in one body forces the reader to shift altitude mid-paragraph.
*Principle:* If you cannot name a function without "and," it is doing more than one thing.

**III.3 — Remove duplicated knowledge — but beware false duplication.**
Two pieces of code that encode the *same decision* must be merged: when the decision changes, you must not have to remember to change it twice. But two pieces that merely *look* alike while encoding *different* decisions must stay apart — merging them couples things that will diverge, and the eventual un-merge is costlier than the duplication ever was.
*Principle:* DRY is about knowledge, not about text. Ask "is this the same decision?" not "do these lines match?"

**III.4 — Delete dead code.**
Commented-out blocks, unreachable branches, and unused helpers are not free. They are read, trusted, maintained, and grepped by every future worker, at a cost, forever. Version control is the museum; the working tree is not.
*Principle:* If it is not used, remove it. If you might need it, that is what history is for.

**III.5 — Separate asking from doing.**
A function that both returns information and changes state cannot be called safely to merely ask — every query becomes a gamble. Callers must be able to observe without disturbing.
*Principle:* Queries return and change nothing. Commands change and return nothing (or only status). Keep the two apart.

**III.6 — Keep the core pure.**
Logic entangled with I/O, wall-clock time, or randomness can only be tested by reproducing the world around it. The same logic as a pure function — inputs to outputs, no side effects — is tested in a line.
*Story:* The parsers at the heart of the system were written as pure transformations: bytes and text in, structured values out, with all file reading pushed to the caller. This is why they could be tested exhaustively against fixture strings with no files on disk, and why their test suite is fast and deterministic.
*Principle:* Push side effects to the edges. Keep a pure center. Test the center hard.

**III.7 — Fail honestly and loudly.**
An error swallowed to preserve a green indicator is a failure you have chosen to discover later, at a worse time, with less information. Silence is the most expensive error-handling strategy.
*Principle:* Surface errors at the boundary where they can be handled meaningfully. Do not return a fabricated success. A red light now is cheaper than a silent corruption later (see also I.4).

## Canon IV — Process

**IV.1 — Done is an acceptance test that passes.**
"It runs" means it did not crash on one path. "Done" means an agreed, written check of the actual requirement passes. Until that check exists and is green, the work is in progress, whatever it looks like.
*Principle:* Write the acceptance criterion before or alongside the work, not after. Done is defined in advance, not declared in hindsight.

**IV.2 — Simple design, in priority order.**
The best design is the simplest one that: (1) passes all its tests, (2) reveals its intent to a reader, (3) contains no duplicated knowledge, and (4) uses the fewest elements. When these compete, that is their order of precedence.
*Principle:* Reach for the simplest thing that satisfies the tests and reads clearly. Elaboration is earned by a demonstrated need, never added on speculation.

**IV.3 — Refactoring is continuous.**
Cleanup deferred to a "later" that a schedule will never grant is cleanup that does not happen. The only reliable time to improve structure is continuously, in small steps, as you pass through.
*Principle:* Leave every module you touch cleaner than you found it. Refactoring is part of the change, not a separate project.

**IV.4 — Gates promote inward and in order.**
Quality checks form concentric rings. The innermost (is the test data safe? is the core correct?) must be green before an outer ring is even evaluated. A change that fails any ring is not promotable, no matter how well its own feature tests pass.
*Story:* A promotion contract defined ordered rings — safe fixtures first, then pure-function correctness, then component contracts, then integration, then cross-implementation parity. Rings run as dependent stages: an outer failure is never even reached if an inner ring is red, because nothing downstream is trustworthy on a broken foundation.
*Principle:* Order your checks from foundational to peripheral, and make each depend on the last. An invariant violated is a stop, not a warning.

**IV.5 — Courage, not coverage.**
The purpose of tests is to let you change the system without fear. A high coverage number that does not deliver that confidence is vanity; a lower number that lets you refactor boldly is the real thing. Coverage is a report to guide attention, never a target to hit.
*Principle:* Test where fear lives. Measure whether you can change things safely, not what percentage of lines were touched.

**IV.6 — Blocking checks are deterministic.**
A gate that sometimes fails for reasons unrelated to the change trains everyone to ignore it. Non-deterministic components (anything calling a live, variable external service; anything time- or randomness-dependent) inform through non-blocking reports; they never sit in the blocking path.
*Principle:* The blocking path uses recorded, repeatable inputs. Live and variable checks run beside the gate, alerting without blocking.

## Canon V — Cost & Constraint

**V.1 — Make the dominant cost an invariant.**
Every system has one resource that dominates its cost or its risk — compute, latency, memory, money per operation, a rate limit, a safety budget. Left as a preference, that control is the first thing traded away under deadline. Made an invariant, it holds.
*Story:* In a system billed per token, output volume was the dominant cost lever, billing several times the rate of input. Rather than leave "keep outputs short" as advice, the design made scannable, bounded output a structural rule — the cost control was baked into the format, not left to discipline.
*Principle:* Name your dominant cost explicitly. Encode its control as a rule the architecture enforces, not a habit you hope holds.

**V.2 — Match the tool to the task's weight.**
Using the most powerful (and expensive) tool for work a cheaper tool does correctly is waste at every invocation. Reserve the expensive tool for the work that genuinely needs it.
*Story:* A tiered system routed routine work to cheap, fast workers and reserved the most capable, costly worker for the rare task that truly required it. The routing rule — cheap by default, expensive only where justified — was enforced as a hard invariant, not left to case-by-case judgment.
*Principle:* Establish a default of the cheapest tool that does the job. Escalation to a costlier tier is explicit and justified.

**V.3 — Cache the shared and static; recompute the changed.**
Work that is identical across many operations and does not change should be done once and reused. Work that depends on varying input must be redone — subject to II.5, never cache something that will silently go stale.
*Principle:* Identify the static, shared substrate and cache it. Keep the dynamic part fresh. Know which is which.

**V.4 — Reason about unlike economics separately.**
Two cost structures that differ in kind — a real-time interactive cost and a batched asynchronous cost, say — must not be blended into one figure. The average of two unlike things describes neither and misleads decisions about both.
*Principle:* Keep distinct economic models distinct in your analysis and your pricing. Blend only things that are truly alike.

## Canon VI — Continuity

**VI.1 — Leave a clean seam.**
Work passes between hands — one agent to the next, agent to human, today to next quarter. The receiver should find the edge of the finished work obvious, its state unambiguous, and the next step clear. A ragged handoff is where knowledge is lost and effort is duplicated.
*Principle:* End your work at a natural boundary, with state and next-step explicit. Do not leave the next worker to reverse-engineer where you stopped and why.

**VI.2 — Mark provenance.**
In any artifact, some content is real and verified, some is demonstration scaffolding, and some is an unverified assumption. If these are not labeled, the next worker cannot tell which is which — and will eventually trust scaffolding as if it were real, or re-verify what was already solid.
*Story:* A demonstration used a real, fully-verified dataset for most of its surface and a clearly-labeled illustrative baseline for one comparison that required data not yet available. The label was explicit in the artifact itself: this part is real; this part is scaffolding until the real source exists.
*Principle:* Label real, demo, and assumed, visibly, in the artifact. Never let scaffolding pass silently as production truth.

**VI.3 — Build for reuse deliberately.**
A pattern that worked once — a planning structure, a testing-gate skeleton, a document layout — is an asset. Written with the next project in mind, it transfers; written for only today, it is rebuilt from scratch each time, which is pure waste across a portfolio.
*Principle:* When you solve an operating problem well, factor the solution so the next project inherits it. Reusability is a design intent, declared up front, not an accident noticed later.

**VI.4 — Record the why, not only the what.**
A decision captured without its reasoning is inert. A later worker can only keep it blindly or break it blindly, because the ground it stood on is invisible. The reason is what makes a decision safe to revisit.
*Principle:* For every non-obvious decision, record the reasoning and the alternatives weighed. A changelog of *what* is a start; a record of *why* is the asset.

**VI.5 — Layer information by when it is needed.**
The reader — human or agent — has finite working attention. Front-loading everything they might ever need guarantees they absorb less of what they need now. Structure information so the reader loads the minimum to act, with depth one lookup away.
*Principle:* Lead with the normative core. Put rationale, detail, and edge cases in a second tier the reader consults on demand. This document is built that way on purpose.

**VI.6 — Past assistance is not present authorization.**
A prior decision, a summary of earlier work, or a draft produced before is evidence of what was concluded then — not a mandate for what to do now. Contexts change; earlier work may have been wrong; a summary may have compressed a suggestion into a false certainty.
*Principle:* Treat inherited conclusions as inputs to verify against current ground truth (Canon I), not as settled instructions to execute. When inherited state conflicts with what you can observe now, observation wins.

---
