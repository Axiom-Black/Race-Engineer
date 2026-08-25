# Onboarding pilot drivers

For bringing real drivers onto the Tier 1 Pilot at
**https://bytecraft-racing.vercel.app**. No new code is needed — each driver
signs up, gets their own isolated garage, and RLS keyed on `auth.uid()` keeps
them apart. Written for the first cohort of three.

**What this is not.** Drivers cannot see each other's sessions, and there is no
public link for showing a session to someone without an account. Both were
considered on 21 Aug 2026 and deliberately not built: team visibility is the
Phase 2 "garage" concept, and a public link needs an amendment to the
tenant-isolation bar (`WORKING_PLAN.md` §4). If the cohort asks for either, that
is real signal — record it rather than working around it.

---

## Owner pre-flight

Do these **before** sending anyone the URL.

- [ ] **Delete the real-COTA test session.** It carries a real driver name in
      `sessions.driver` and inside the raw `.ld` in Storage. RLS means no other
      driver can read it, so this is hygiene rather than an exposure — but
      production holding one person's PII while you invite others is a choice
      worth making on purpose. (Decided 21 Aug.)

      **Do this in the app**: sign in, find the session in your garage, click
      **Delete**, confirm. It removes the four Storage objects and then the row.
      Added 25 Aug — before that there was no way to delete a session at all,
      which is how this item sat open for four days.

      Verify it is gone, because the app cannot show you another account's rows:
      ```sql
      select count(*) from public.sessions where is_demo = false;  -- expect 0
      ```
      If the count is not zero, the delete reported an error rather than
      silently failing — re-run it and read the notice.
- [ ] **Check the email rate limit.** Supabase's built-in email sender is
      rate-limited and is explicitly not intended for production traffic. Three
      signups in quick succession can trip it, and a driver whose confirmation
      email never arrives will conclude the product is broken. Find the current
      limit under **Supabase → Authentication → Rate Limits**; if it is tight,
      either stagger the invitations or configure custom SMTP first.
      *(The exact figure is not recorded here on purpose — it changes, and a
      stale number in a doc is worse than a pointer to the live one.)*
- [ ] **Confirm "Confirm email" is ON** and the production origin is in
      **Authentication → URL Configuration**. Enabled 21 Aug; verify it stuck,
      because the failure mode is silent — links point at `localhost`.
- [ ] **Add the keepalive secrets.** `SUPABASE_URL` and
      `SUPABASE_PUBLISHABLE_KEY` under repo Settings → Secrets → Actions. This
      moves from optional to *recommended* with real users: the free project
      pauses after ~1 week idle, and a driver who returns after a quiet week
      would otherwise hit a dead app. The app degrades gracefully either way
      (it says "may be waking from idle, try again"), but not pausing is better
      than explaining the pause.
- [ ] **Check storage headroom.** Supabase → Storage. The cap is 1 GB; each
      session costs roughly 0.9 MB of raw files plus a small trace. Three
      drivers will not trouble it — this is a habit to start, not a risk today.

---

## What to send each driver

> **ByteCraft Racing — early access**
>
> https://bytecraft-racing.vercel.app
>
> Sign up with your email, click the confirmation link, and you'll land in your
> own garage with a demo session already loaded so there's something to look at
> immediately.
>
> To add your own session, export it from MoTeC and upload **all three files
> together** — `.ld`, `.ldx` and `.svm`. All three are required: the `.ld` holds
> the telemetry, the `.ldx` the lap summary, and the `.svm` your setup. A
> session without all three isn't saved, on purpose.
>
> Everything is private to your account. Nobody else — including other drivers
> — can see your sessions.
>
> It's an early pilot. Tell me anything that looks wrong, confusing, or slower
> than you expected.

---

## What they should expect to see

- **Signup → confirmation email → their garage**, with a **DEMO SESSION**
  (COTA · GTE) already seeded.
- **The demo session shows two orange/red flag banners.** These are
  **intentional and correct**: the demo is built from a deliberately truncated
  sanitized file, so its lap summary claims three laps its telemetry cannot
  back, and the app says so rather than pretending. Warn drivers in advance —
  otherwise the first thing they see looks like a bug.
- **Their own upload:** four tabs — Summary, Performance, Instruments, Track
  Map — rendering in well under 10 seconds. Parsing happens in their browser,
  so a slow machine shows up here first.
- **Progression reads UNRANKED** until they have **two** sessions of the same
  venue + car + session type. A single session has nothing to compare against,
  and the app refuses to award a tier on one data point.
- **Two tabs are visibly dark** — the AI Race Engineer and Libraries. Labelled
  as Phase 2, not hidden and not faked.

## Rough edges worth pre-empting

- **GPS coordinates are game-world, not real-world.** The Track Map is
  geometrically exact but must never be overlaid on a real map.
- **Some channels show EMPTY flags.** Tyre Load, Grip Fract and Battery are
  genuinely empty in LMU's GTE exports. That is the sim, not the parser.
- **Out-laps and the trailing partial lap appear with no lap time.** Deliberate
  — only a segment bounded by two line crossings is a lap.

---

## What to ask them for

Specific beats general. Three questions worth more than "what did you think":

1. **Did anything take longer than you expected?** Names a performance problem
   without priming them for one.
2. **Was there a number you didn't trust?** Surfaces decode and labelling bugs,
   which are the expensive kind here.
3. **What did you want to do next and couldn't?** This is where a request for
   sharing or team visibility will surface honestly, rather than being led.

If something breaks, ask for: what they clicked, what the screen said verbatim,
the browser, and roughly when. The app shows classified failures now
("temporarily unavailable", "storage is full") rather than raw errors, so the
exact wording narrows the cause quickly.

---

## What this cohort is *for* — and the rule decided in advance

This cohort is not a launch. It is the **pull signal for Phase 2**: the three
drivers exist to answer whether an AI debrief is a thing anyone wants, before
P2/P3 spend real money building one. That only works if the answer is read
honestly, so the rule is written **now, before any answers arrive** — otherwise
whatever comes back gets rationalised into the plan that already existed.

**Question 3 — "what did you want to do next and couldn't?" — is the KPI.**
It is deliberately unprompted: nobody is asked about AI, so an AI answer is
real demand rather than a suggestion echoed back.

| What comes back | What it pulls |
| --- | --- |
| **≥2 of 3 unprompted ask for analysis/coaching** ("what should I change", "why am I slower here") | Phase 2 P2→P3 is pulled. Build it. |
| **≥2 of 3 ask for sharing / comparing with each other** | The garage concept is the real demand, not the agent. Re-sequence Phase 2 around it. |
| **They mostly ask for telemetry depth** (a channel, a plot, an export) | Neither is pulled. Extend Phase 1; Phase 2 stays parked. |
| **They stop using it** | The most valuable answer and the cheapest. Find out why before building anything. |

**Supporting counts, not the decision itself:** how many sessions each driver
uploads after the first, and whether any returns a second week. A driver who
uploads once and never comes back has told you something regardless of what
they say in a message.

> **This rule is falsifiable on purpose.** Two of the four outcomes above stop
> P2/P3, which is the point — a pull signal that cannot come back negative is
> not a signal.

### Reading the answer at the database

The app cannot show you this: RLS means the owner's own account sees only its
own rows. Run these in the Supabase SQL editor, which runs as the service role
and is not subject to RLS. **Read-only — none of them write.**

```sql
-- Who signed up, and did they get past signup?
select u.id, u.email, u.created_at, u.last_sign_in_at,
       u.email_confirmed_at is not null as confirmed
from auth.users u
order by u.created_at;

-- Real uploads per driver (demo rows excluded — they prove nothing)
select s.user_id, count(*) as sessions,
       min(s.created_at) as first_upload,
       max(s.created_at) as last_upload,
       count(*) filter (where s.ingest_status <> 'complete') as incomplete
from public.sessions s
where s.is_demo = false
group by s.user_id
order by sessions desc;

-- Isolation, checked where it actually lives: no user_id may span two owners
select s.user_id, count(distinct s.id) as own_sessions
from public.sessions s
group by s.user_id;
```

The third is the one the last section of this document calls for. Distinct,
non-overlapping sets here, **plus** each driver reporting only their own count
in the UI, is what proves RLS — not the UI filtering, which would look
identical if it were doing the work itself.

---

## The verification this cohort actually provides

Cross-driver isolation is **proven at the database layer** — Ring 3 runs seven
assertions on every push, including that a second driver reads zero of the
first's rows and objects, that a spoofed insert is rejected, and that one driver
cannot overwrite another's Storage object.

It has **never been exercised by two real accounts on production.** These three
drivers are that test. Once at least two have uploaded, check that each sees
only their own sessions — and confirm at the database layer too, since the UI
filtering correctly would not prove RLS is what is doing the filtering.

Concretely, after two drivers have data, a query grouping `sessions` by
`user_id` should show distinct non-overlapping sets, and the app should show
each driver only their own count.
