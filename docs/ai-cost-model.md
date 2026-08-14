Axiom Black, LLC  ·  Newark, NJ  ·  axiomblack.com

**BUSINESS DEVELOPMENT  ·  UNIT ECONOMICS**

**Executive Summary**

The ByteCraft Race Engineer Agent is a ten-agent AI system that engineers the **car and the session** — aerodynamics, tyres, powertrain, strategy, and environment — rather than simply coaching the driver. That positioning is the platform's core advantage, and it is unmatched by the four reviewed competitors. It is also the most inference-intensive concept in the category, which makes the cost-to-serve model the single most important input to the business plan.

This document models that cost using current Anthropic API pricing (June 2026) and three deliberate engineering levers — **model tiering, curated-data caching, and run metering** — then maps the result to a freemium subscription structure aligned with the prevailing market band of $3–8 entry and $12–20 premium pricing.

**Headline result:** the optimization stack reduces the cost of a full ten-agent analysis from roughly **$0.95** per run (naive build) to about **$0.18** synchronous, or **$0.10** when run asynchronously through the Batch API — close to a 90% reduction. With expensive runs metered and cheap checks kept generous, the proposed plans hold gross margins from the high-50s percent at entry to roughly 68% at the team and B2B tiers, rising into the mid-60s-to-low-70s when post-session analysis is batched.

**1.  Strategic Position**

**Why Le Mans Ultimate first**

The LMU-first focus is a deliberate wedge, not a limitation. Four factors support it:

- **Modern platform with runway.** LMU is a current-generation title with an estimated six-to-eight-year development life, so depth invested today compounds rather than ages out.

- **Rare full-telemetry access.** LMU is one of very few consumer simulators that allows full telemetry export (MoTeC .ld/.ldx). That is the raw material an engineering agent needs, and most titles do not expose it at this fidelity.

- **The PC audience is the buyer.** Full-telemetry, tool-driven sim racing is overwhelmingly a PC behaviour, and the PC base is large and the segment most willing to adopt an analysis platform.

- **Underserved by incumbents.** The reviewed tools spread thin across 6–8 titles and coach driver technique. None delivers deep, per-corner, per-class engineering for LMU's endurance discipline (tyre management, fuel and stint strategy, multi-class craft).

**The defensible advantage**

Competitors optimise the human's inputs (brake point, line, throttle). The Race Engineer Agent reasons about the machine and the plan. Combined with ByteCraft's curated Corner Dossiers and session-type-aware Ideal targets, the intersection of **AI race-engineering × LMU depth × curated data authority** is unclaimed in the market. The remainder of this document addresses the principal risk that comes with it: serving that intelligence profitably.

**2.  The Ten-Agent System and Where Cost Lives**

A full analysis fans out from the **Race Engineer Orchestrator** to seven specialist agents, consolidated by the **Synthesizer**, with a lightweight **User Agent** handling intent and formatting. Each call consumes input tokens (prompt + reference context + telemetry) and output tokens. Output is the expensive side — priced at 5× input across all models — so disciplined, structured outputs are as much a cost control as a UX choice.

| **Agent** | **Role in a run** | **Cost weight** |
| --- | --- | --- |
| **Orchestrator** | Routes the run, assembles per-agent context packets | Medium |
| **Aerodynamics** | Aero balance and its contribution to pace | Low |
| **Tire** | Temps, pressures, slip, wear vs. ideal | Low–Med |
| **Powertrain** | Fuel level and powertrain settings / strategy | Low |
| **Telemetry** | Lap vs. ideal-lap deltas for feedback | Low–Med |
| **Strategy** | Session approach vs. user goal and baseline | Low |
| **Environment** | Weather, time-of-day, track-condition effects | Low |
| **KPI / Optimizer** | Performance-driving KPI analysis | Low |
| **Synthesizer** | Consolidates all outputs into the engineer report | High |
| **User Agent** | Interprets intent, formats the response | Minimal |

The decisive structural fact: ByteCraft's four curated libraries — **Published Track Notes, Ideal Session Data, Vehicle Dynamics, and the Corner Dossiers** — are admin-controlled and identical for every user racing the same track and class. That shared, static context is the bulk of each agent's input, and it is exactly what caching is built to exploit.

**3.  Three Cost Levers**

**Lever 1 — Model tiering**

Assign each agent the cheapest model that clears its quality bar. The seven specialists run narrow, bounded jobs and sit on **Haiku 4.5**; the Orchestrator and the Synthesizer carry the cross-agent reasoning on **Sonnet 4.6**; **Opus 4.8** is reserved exclusively for premium Deep runs. Specialists never run on Opus. This single decision is a 5–25× cost spread between tiers.

**Lever 2 — Caching the curated libraries**

Because the curated context is global and static, it is cached once at the system level and read by every user's every run at a 90% discount (cache hits cost 10% of base input). Cache writes amortise to near zero across the user base. The only fresh, full-price input per run is the user's own processed telemetry.

**Lever 3 — Metering full runs**

Not every interaction needs all ten agents. Three run classes align spend to value: a cheap **Quick check** (a few specialists), the **Standard run** (all ten, Sonnet brain), and a premium **Deep run** (all ten, two-pass, Opus synthesis). Cheap Quick checks stay generous; the expensive Standard and Deep runs carry allowances and overage credits — and, because post-session analysis is not latency-critical, they run asynchronously through the **Batch API at 50% off**.

**Reference rate card (Anthropic API, June 2026, USD per million tokens)**

| **Model** | **Input** | **Output** | **Cache read** | **Role** |
| --- | --- | --- | --- | --- |
| **Haiku 4.5** | $1.00 | $5.00 | $0.10 | 7 specialists |
| **Sonnet 4.6** | $3.00 | $15.00 | $0.30 | Orchestrator + Synthesizer |
| **Opus 4.8** | $5.00 | $25.00 | $0.50 | Deep-run synthesis only |

*Output is billed at 5× input on every model. Batch API applies a further −50% to all tokens; cache reads are −90% vs. base input.*

**4.  Cost Per Run**

Applying all three levers, the modelled cost of one full Standard analysis falls from a naive all-Opus, no-cache build to a fraction of it:

*Figure 1 — Standard-run cost: naive $0.95 → model tiering $0.27 → curated caching $0.18 → Batch API $0.10.*

By run class, the modelled per-run cost is:

| **Run type** | **Agents / models** | **Sync cost** | **Batch cost** |
| --- | --- | --- | --- |
| **Quick check** | 3 specialists + light synth (Haiku) | $0.04 | $0.02 |
| **Standard run** | 10 agents — Haiku specialists + Sonnet brain | $0.18 | $0.10 |
| **Deep run** | 10 agents, 2-pass — + Opus 4.8 synthesis | $0.26 | $0.14 |

*Steady-state estimates; curated-library cache writes amortised to ~0. See Methodology for token assumptions.*

**5.  Monthly Cost-to-Serve Scenarios**

Per-run costs become per-user economics once multiplied by realistic monthly usage. The table shows modelled AI cost plus a hosting/storage allowance (web app, database, auth, MoTeC object storage, egress) on a conservative synchronous basis.

| **Persona (usage)** | **Quick** | **Standard** | **Deep** | **AI cost** | **+Infra = total** |
| --- | --- | --- | --- | --- | --- |
| **Rookie (free)** | 12 | 1 | 0 | $0.66 | $1.16 |
| **Driver (typical)** | 30 | 8 | 1 | $2.90 | $3.90 |
| **Driver (heavy)** | 60 | 18 | 3 | $6.42 | $7.42 |
| **Engineer (typical)** | 50 | 20 | 4 | $6.64 | $7.64 |
| **Engineer (heavy)** | 90 | 40 | 10 | $13.40 | $14.90 |
| **Garage — 3 seats** | 120 | 45 | 9 | $15.24 | $17.24 |

*Running Standard and Deep runs through the Batch API cuts the AI cost roughly in half again versus the figures shown.*

**6.  Recommended Plans and Pricing**

A freemium ladder priced within the competitive band, with the free tier anchored by the zero-marginal-cost Dossier library as the acquisition hook, and expensive runs gated and metered to protect margin.

| **Plan** | **Price/mo** | **Included** | **Typ. cost** | **Typ. margin** |
| --- | --- | --- | --- | --- |
| **Rookie** | Free | Dossier library (read), 12 quick + 1 standard / mo. No deep runs. | $1.16 | Acquisition |
| **Driver** | $9 | Unlimited quick, 10 standard / mo. Deep via credits. | $3.90 | ~57% |
| **Engineer** | $19 | Unlimited quick, 30 standard + 3 deep / mo, + credits. | $7.64 | ~60% |
| **Garage** | $39 | 3 seats, pooled allowances, shared team sessions + libraries. | $17.24 | ~56% |
| **Paddock** | $99+ | Leagues / sim-centers: seats, admin, data export, high limits. | ~$32 | ~68% |

*Figure 2 — Conservative synchronous margins. Batching post-session runs lifts each tier into the mid-60s–low-70s percent.*

**Usage-credit layer (margin protection + upside)**

Metering converts the heavy-user tail from a margin risk into a revenue stream. Overage credits are priced at a healthy multiple of cost:

- **Standard-run credits** — sold ~$0.49 each (cost $0.10–$0.18); pack of 25 for $9.99.

- **Deep-run credits** — sold ~$1.49 each (cost $0.14–$0.26); pack of 10 for $11.99.

This caps cost exposure on power users while monetising exactly the customers most engaged with the product.

**7.  Margin Protection and Risks**

- **Output is the cost driver (5× input).** Enforce structured, bounded agent outputs. ByteCraft's existing principle — dossiers as scannable cheat sheets, not prose — is therefore also a direct cost control.

- **Guard model assignment.** Keep the Synthesizer on Sonnet for Standard runs and reserve Opus 4.8 for Deep only; never escalate specialists. A drift to all-Sonnet or all-Opus is the fastest way to erase margin.

- **Meter the expensive, free the cheap.** Only Quick checks should ever be 'unlimited'. Standard and Deep are always allowance-plus-credits.

- **Free-tier exposure (~$1.16/user) is the real CAC line.** Gate Deep entirely, cap free Standard at one per month, and lean on the dossiers (near-zero serving cost) to deliver free-tier value.

- **Live on-track voice coaching is a different cost class.** A Trophi-style continuous voice coach streams inference in real time and cannot be batched or cheaply tiered. If pursued, treat it as a separate premium module priced for continuous inference — not a feature folded into these tiers.

**8.  Methodology and Assumptions**

- **Rate card:** Anthropic public API pricing, June 2026 — Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15, Opus 4.8 $5/$25 per MTok; cache read −90%; Batch API −50%.

- **Token estimates (planning-grade):** per specialist ≈ 10k cached reference + 2.5k fresh input + 1.2k output; Synthesizer ≈ 11k input (agent outputs) + 2.5k output; Orchestrator ≈ 3k input + 1.5k output.

- **Caching:** curated libraries are admin-controlled and identical across users, so they are cached once globally; cache-write overhead amortises to ~0 and only per-user telemetry is billed as fresh input.

- **Infrastructure:** $0.50–$2.00 per active user per month (hosting, database, auth, MoTeC object storage, egress) at small-to-mid scale.

- **Excluded:** real-time on-track inference, human coaching, payment processing (~3%), and one-time development. These are estimates for planning; instrument real token usage in beta to calibrate before locking prices.

**9.  Recommendations**

- **Build the agent stack tiered from day one** — Haiku specialists, Sonnet brain, Opus for Deep only. Retro-fitting tiering after launch is far harder than designing for it.

- **Cache the curated libraries globally** and treat them as the moat they are — authoritative content that is also the cheapest thing you serve.

- **Ship the three run classes with metering at launch**, run Standard/Deep through the Batch API, and price overage credits at 3–7× cost.

- **Launch freemium with the Dossier library as the hook**, Driver at $9 and Engineer at $19 as the revenue core, and Garage/Paddock for teams, leagues, and sim-centers where margin is healthiest.

- **Instrument everything in beta.** Token-per-run and runs-per-user are the two numbers that decide this business; measure them on real LMU sessions before finalising prices.

**Axiom Black, LLC**   ·   511 South Orange Ave #2238, Newark, NJ 07103   ·   +1 (862) 420 9525   ·   axiomblack.com

*Prepared for The ByteCraft Company — ByteCraft Racing Project.  Building The Future.*

	**Engineering**  ·  **Technology**  ·  **Consulting**	ByteCraft Racing Project — Confidential