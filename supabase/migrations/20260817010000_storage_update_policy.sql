-- ByteCraft Racing — storage UPDATE policy for the telemetry bucket.
--
-- THE BUG THIS CLOSES (found 17 Aug 2026 by auditing the live project against
-- the client code, not by a failing test).
--
-- All four uploads in frontend/src/lib/sessions.js pass `{ upsert: true }`.
-- That option was added deliberately: a partially-failed upload used to brick
-- the session permanently, because the storage paths are derived from the
-- content hash and a retry would collide with the orphaned objects.
--
-- But a Supabase upsert onto an object that already exists is an UPDATE, and
-- the Phase 1 migration granted only SELECT, INSERT and DELETE on
-- storage.objects. So the retry path — the exact scenario upsert:true exists
-- to serve — fails with an RLS violation whenever the objects survived.
--
-- rollbackSession() removes the orphans and hides this most of the time, but
-- it cannot run when the failure is a closed tab, a lost connection, or a
-- crash mid-upload. Those are precisely the cases a retry is for.
--
-- Scope is identical to the three existing policies: a driver may only touch
-- objects under their own auth.uid() prefix. This widens no tenant boundary,
-- it only lets a driver overwrite their own orphaned file.
create policy telemetry_own_update on storage.objects
  for update
  using (bucket_id = 'telemetry'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'telemetry'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
