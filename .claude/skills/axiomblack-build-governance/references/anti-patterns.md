# Anti-pattern catalogue

Every entry is a real incident from a shipped Axiom Black build. They are recorded
because each one *passed review at the time* — the rule column is what would have
caught it.

Read this before claiming a build is proven, and when a check is green but something
still feels wrong.

---

## Proof and verification

| Anti-pattern | What it looked like | Rule |
| --- | --- | --- |
| **Friendly-environment proof** | A timezone bug invisible because the CI container runs UTC | Assert the *wrong* answer explicitly so a regression cannot hide behind the environment |
| **Fixture that cannot fail** | A single-lap fixture used to test multi-lap logic | The fixture must be able to express what the code claims |
| **Self-validating port** | Golden masters at risk of being regenerated *from* the port they validate | The reference implementation generates truth; the port is checked against it, never the reverse |
| **Test asserting the wrong threshold** | A test demanding a 25 ms drift be flagged when the tolerance was 50 ms | When a test and the code disagree, determine which is wrong before changing either. Sometimes the test is the bug |
| **Green suite as proof of shipping** | A full suite passing while production served a hollow bundle | Tests prove the code; only the deployed artifact proves the deploy |
| **Dismissed anomaly** | An identical build hash across a substantial source change, noticed and explained away | An unexpected result is evidence. Chase it before rationalising it |

## Identity, data and cross-source trust

| Anti-pattern | What it looked like | Rule |
| --- | --- | --- |
| **Positional identification** | `find … \| head -1` picking the wrong chunk when file order changed | Identify by name, never by position |
| **Cross-source id trust** | Matching an id from file A against a record from file B without checking B contains it | Verify the referenced record exists before trusting the match |
| **Atomicity mistaken for coherence** | All three required files present — one of them from a different vehicle | Presence is not consistency. Cross-check sources against each other, not just for existence |
| **Single-source authority for shared fields** | Four identifying fields read only from the one file nothing validated | A field that identifies the record needs corroboration or an explicit flag |
| **Real data in a shared environment** | A production record carrying real user PII, kept "just for testing" | Real data gets an owner and an expiry, or it does not go in |

## Scoping and decisions

| Anti-pattern | What it looked like | Rule |
| --- | --- | --- |
| **Silent capability assumption** | "Move the Python service to Edge Functions" — Edge Functions run Deno | Probe the runtime before scoping the work |
| **Asserted limitation** | Claiming a platform tier could not protect private repos; the 403s were the agent's own environment | Never assert a limitation you have not hit. Correct the record explicitly when wrong |
| **Headline-cost decision** | "10× cheaper" — worth ~$10/month at real volume | Multiply by real volume before letting a ratio drive a decision |
| **Feature that does not serve its own goal** | A share link requested to onboard three users, which would not have onboarded them | Restate the goal, then ask whether the feature reaches it |

## Delivery and process

| Anti-pattern | What it looked like | Rule |
| --- | --- | --- |
| **Work stacked on merged history** | A branch cut from a merged branch; the PR went `dirty` and no gates ran | Fetch, then branch from the protected branch. Squash merges defeat `--contains` — use `git merge-tree` to check merged-ness by content |
| **Guard living on a branch** | The build guard that would have caught the hollow bundle existed — unmerged — while the bundle shipped | A guard is only a guard once it is on the protected branch |
| **Retry on a non-retryable fault** | A "Try again" button offered on a full disk | Classify the fault; offer retry only where retrying can work |
| **Confident wrong diagnosis** | "Your project is paused" when the state was genuinely unknowable | Say the honest superset of what you know |
| **Temporary convenience left on** | Email confirmation disabled for a demo, still off when the app went public | A relaxed setting needs an owner and an expiry at the moment it is relaxed |
| **Stale tracker** | Blocker rows naming resolved blockers and deleted branches | Update summary and detail together, in the same commit |
| **Handoff without ordering** | Two one-line human actions whose order was load-bearing, given without it | State ordering constraints between human actions explicitly |
