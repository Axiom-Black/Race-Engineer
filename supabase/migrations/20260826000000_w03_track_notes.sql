-- ByteCraft Racing — W0.3 Track Notes.
--
-- A driver's own track guide, built from their own laps. This is the FIRST
-- driver-authored data in the product, and that forces a question no previous
-- table faced: what happens to it when the session that produced it is deleted.
--
-- ── THE FOUR DECISIONS THIS TABLE ENCODES ───────────────────────────────────
--
-- 1 · THE NOTE OUTLIVES THE SESSION. `source_session_id` is
--     `on delete set null`, NOT `on delete cascade` — unlike laps, which are a
--     part of the recording and go with it. A session is a recording; a note is
--     knowledge, and deleting the recording must not delete what the driver
--     learned. Every fact a reader needs about the session (car, class, date,
--     conditions) is therefore COPIED onto the note at write time. That
--     denormalisation is the feature: a note that said "see session 4f2a…" and
--     nothing more would be unreadable in exactly the case this design exists
--     for. `source_session_id` going null is then the provenance signal — the
--     note reads fine and it can also say "the session this came from is gone".
--
-- 2 · IDENTITY IS A PLACE ON THE TRACK, NEVER A CORNER NUMBER. Numbering is
--     ours and derived — lib/cornerDetect.js moved COTA from 12 corners to 15
--     to 20 in three days, and a note pinned to "corner 14" is orphaned the
--     moment corner 13 splits, or worse, silently re-attaches to different
--     road. `d_start`/`d_end` are lap distance FRACTIONS, so a span means the
--     same place regardless of what the detector does next, and it describes a
--     corner and a straight with one shape. `corner_label` carries "T7" for the
--     driver to read; it is a label, not the key.
--
-- 3 · REVISE WITHIN A SESSION, ACCUMULATE ACROSS SESSIONS. Within one session
--     the driver is refining one observation; across sessions they are building
--     knowledge — T4 in the wet and T4 in the dry are both true. Hence the
--     unique key `(user_id, track_key, anchor_key, session_key)`: same session
--     updates in place, a new session inserts a revision alongside.
--
-- 4 · `session_key` IS TEXT AND SEPARATE FROM THE FOREIGN KEY. It has to be:
--     `source_session_id` becomes null on deletion, and because SQL NULLs
--     compare as distinct, a unique key built on the FK would stop enforcing
--     revision the moment a session was deleted — every orphaned revision of
--     one anchor would be permitted to duplicate without limit. `session_key`
--     is written once and never nulled, so revision stays enforced for the
--     whole life of the note.
--
-- Isolation is RLS on auth.uid(), same as sessions and laps (standing bar:
-- tenant isolation lives in the database, never in an application WHERE).

create table public.track_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ── where on which track ──────────────────────────────────────
  -- track_key is the normalised venue (case- and whitespace-folded). Layout
  -- suffixes are DELIBERATELY preserved: a distance fraction means a different
  -- place on Silverstone GP than on Silverstone National, so folding them
  -- together would put a note about Stowe in the middle of nothing.
  track_key text not null,
  track_label text,

  -- anchor_key quantises the span's midpoint into 200 buckets (0.5% of a lap,
  -- ~27.6 m at COTA) so "the same corner, a week later" lands on the same key
  -- even though the detector put its apex a few metres further on. Zero-padded
  -- so a plain `order by anchor_key` walks the lap in order with no computed
  -- index. See lib/notes.js ANCHOR_BUCKETS — the DB key exists to make
  -- REVISION work; display grouping is by proximity, because a quantised key
  -- has boundaries and two notes about one corner can straddle one.
  anchor_key text not null,
  d_start numeric not null check (d_start >= 0 and d_start <= 1),
  d_end numeric not null check (d_end >= 0 and d_end <= 1),
  constraint anchor_ordered check (d_start <= d_end),
  corner_label text,

  body text not null check (length(btrim(body)) > 0 and length(body) <= 2000),

  -- ── provenance: metadata, not ownership (decision 1) ──────────
  source_session_id uuid references public.sessions(id) on delete set null,
  session_key text not null,
  session_recorded_at timestamptz,

  -- ── the annotations that make one note distinguishable from
  --    another about the same corner ─────────────────────────────
  -- Copied, not joined, so they survive the session's deletion. Temperatures
  -- are the only environmental facts the export actually carries — there is NO
  -- wetness or time-of-day channel in the 70 we decode, so there are no columns
  -- for them here rather than columns that would always read false.
  car text,
  car_class text,
  ambient_c numeric,
  track_c numeric,

  constraint one_note_per_anchor_per_session
    unique (user_id, track_key, anchor_key, session_key)
);

-- ── RLS: per-driver isolation, keyed on auth.uid() ───────────────
-- Same shape as sessions_own / laps_own. `select auth.uid()` rather than a bare
-- call so the planner treats it as a stable scalar (the S4 pattern, already
-- verified against cross-user read and spoofed insert).
alter table public.track_notes enable row level security;

create policy track_notes_own on public.track_notes
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The master view's only query: one driver's notes for one track, in lap order.
-- anchor_key is zero-padded so this index alone serves the ordering.
create index track_notes_master_idx
  on public.track_notes (user_id, track_key, anchor_key);

-- Finding a session's own notes, and marking them orphaned when it is deleted.
create index track_notes_by_session_idx
  on public.track_notes (source_session_id);

-- updated_at is what tells "revised in this session" from "written once", and
-- it is the field a client is most likely to forget on an upsert. A trigger
-- makes it structural rather than something to remember.
create or replace function public.touch_track_notes_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger track_notes_touch_updated_at
  before update on public.track_notes
  for each row execute function public.touch_track_notes_updated_at();
