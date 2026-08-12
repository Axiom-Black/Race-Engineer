-- ════════════════════════════════════════════════════════════════
-- ByteCraft Racing — Tier 1 Pilot storage (S5 · Step 1)
--
-- The private `telemetry` bucket that holds each session's raw
-- .ld/.ldx/.svm files and its downsampled trace.json. Isolation is
-- per-user by object-path prefix: {user_id}/{session_id}/….
--
-- Supabase-specific (depends on the `storage` schema), so it is split
-- from 0001 — the Ring 3 CI check applies only 0001 against a bare
-- Postgres. These policies are exercised end-to-end by the Step 3
-- upload flow against the real Supabase project.
-- ════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('telemetry', 'telemetry', false)
on conflict (id) do nothing;

-- A user may only touch objects under their own {user_id}/ folder.
-- storage.foldername(name)[1] is the first path segment.
drop policy if exists telemetry_select on storage.objects;
create policy telemetry_select on storage.objects
  for select to authenticated using (
    bucket_id = 'telemetry'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists telemetry_insert on storage.objects;
create policy telemetry_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'telemetry'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists telemetry_update on storage.objects;
create policy telemetry_update on storage.objects
  for update to authenticated using (
    bucket_id = 'telemetry'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists telemetry_delete on storage.objects;
create policy telemetry_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'telemetry'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
