# Project Charter — Esports Vehicle Simulation Dashboard

> **Archived.** This is the project's origin document (Axiom Black, v1.0 Draft, 2026),
> preserved for provenance. It predates the ByteCraft Racing identity, the LMU focus,
> the AI agent system, and the Supabase/Vercel stack — see `docs/ByteCraft_Racing_Phase_Plan.md`
> and the repo-root `CLAUDE.md` for what superseded it.
> (Recovered as text from the original upload, which was a page-image bundle
> mislabeled as a PDF.)

## 1. Project Overview

| Field | Value |
| --- | --- |
| Project Name | Esports Vehicle Simulation Dashboard |
| Tool / Deliverable | Python-based Dashboard Application |
| Industry | Esports |
| Project Lead | TBD |
| Sponsor | TBD |
| Date | 2026 |
| Delivery Approach | Agile (Scrum) |

## 2. Business Need

Esports competitors and coaching staff currently lack a structured way to review, compare,
and analyze vehicle simulation session data. Without visibility into session performance and
the ability to control for environmental and vehicle variables, meaningful performance
improvement is limited.

This dashboard provides a centralized, visual platform for reviewing simulation output,
managing session history, and performing comparative analysis — enabling data-driven
performance decisions.

## 3. Goals & Success Criteria

| Goal | Success Criteria |
| --- | --- |
| Ingest simulation output data | Dashboard reads and parses sim system output without manual intervention |
| Display session analytics | Infographic-style visualizations render per session with accurate data |
| Manage session history | Users can view, organize, and retrieve all past simulation sessions |
| Enable filtered analysis | Users can filter/compare sessions by environment (day, time, weather), vehicle, and track |
| Deliver a usable product | End users can navigate the tool without training documentation |

## 4. Scope

**In scope:** data ingestion layer (reads sim output files) · session dashboard
(infographic-style per-session analysis) · session history manager (per-user library) ·
comparative analysis module (filter by environment / vehicle / track) · Python-based desktop
or web application (framework TBD in Sprint 0) · basic user identity per session record.

**Out of scope:** real-time simulation integration (live data feeds) · mobile application ·
multi-organization / team management · video or replay capture · integration with external
esports platforms or APIs (Phase 2 consideration).

## 5. Key Stakeholders

| Stakeholder | Role | Engagement |
| --- | --- | --- |
| Project Sponsor | Approves scope, budget, major decisions | Milestone reviews |
| Project Lead | Day-to-day delivery ownership | Continuous |
| Development Team | Build and deliver the application | Continuous |
| End Users (Drivers / Analysts) | Primary users of the dashboard | Sprint reviews, UAT |
| Simulation System Owner | Provides output data specs and sample files | Sprint 0, as needed |

## 6. Delivery Approach

Agile — Scrum. Iterative build: core data structures early; visual/analytical features refined
through user feedback. Sprint length 2 weeks; Sprint 0 covers environment setup, data format
analysis, tech stack confirmation, and backlog creation. Definition of Done: feature works
against real sim data, passes review, and is merged to main branch.

## 7. High-Level Backlog (Epics)

1. **Data Ingestion** — parse and normalize sim output into the application data model
2. **Session Dashboard** — per-session infographic view: lap times, speed profiles, sector splits, KPIs
3. **Session History Manager** — user-linked session library: list, view, tag, delete
4. **Comparative Analysis** — filter and compare sessions across environment, vehicle, track
5. **UI/UX** — interface, navigation, visual design consistent with esports aesthetic
6. **Data Persistence** — local or lightweight database for session history

## 8. Assumptions

- Sim produces output in a consistent, documented format (CSV, JSON, telemetry log)
- Sample data files provided before or during Sprint 0
- A single Python environment (desktop or local web server) acceptable for v1.0
- End users have basic technical literacy; no onboarding UI required for v1.0
- No authentication system required for v1.0 — identity via simple user profiles

## 9. Constraints & Risks

| Item | Type | Notes |
| --- | --- | --- |
| Simulation data format unknown | Risk | Must confirm format in Sprint 0; unknown schema could delay ingestion epic |
| Python framework not yet selected | Constraint | Decision (Dash, Streamlit, PyQt) in Sprint 0 based on UI requirements |
| No dedicated UX designer | Constraint | UI design owned by dev team; allocate wireframing time in Sprint 1 |
| Scope creep on analytics features | Risk | Manage via backlog prioritization |
| Single developer scenario | Risk | Velocity drives realistic sprint planning |

## 10. Milestones

| Milestone | Target |
| --- | --- |
| Sprint 0 complete — stack confirmed, data format documented, backlog groomed | Week 2 |
| Epic 1 done — ingestion working against real sim output | Week 4 |
| Epic 2 done — session dashboard rendering with live data | Week 6 |
| Epic 3 done — session history manager functional | Week 8 |
| Epic 4 done — comparative analysis with filters live | Week 10 |
| Beta release — internal user testing | Week 11 |
| v1.0 release | Week 12 |
