-- ════════════════════════════════════════════════════════════════
-- Row-Level Security — ByteCraft Racing
--
-- Enforces tenant isolation IN THE DATABASE, not just in application
-- code. A missed WHERE clause in a FastAPI route must not be able to
-- leak one garage's sessions to another garage's admin.
--
-- Apply this AFTER the initial Alembic migration. Wrap in its own
-- migration (e.g. 0002_row_level_security.py) so it's reversible.
--
-- How this works with FastAPI:
--   Every request sets two session variables before running queries:
--     SET app.current_user_id = '<uuid>';
--     SET app.current_role    = 'driver' | 'garage_admin' | 'product_admin';
--   This should happen in a request-scoped dependency that wraps
--   get_db() — see app/db/session.py — using `SET LOCAL` so it's
--   automatically scoped to the transaction and never leaks across
--   pooled connections.
-- ════════════════════════════════════════════════════════════════

-- Sessions: visible to (a) the owning user, (b) that user's garage admin,
-- (c) product admins (bypass below).
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_owner_access ON sessions
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    OR
    user_id IN (
      SELECT id FROM users
      WHERE garage_id = (
        SELECT garage_id FROM users
        WHERE id = current_setting('app.current_user_id', true)::uuid
      )
      AND current_setting('app.current_role', true) = 'garage_admin'
    )
  );

-- Session notes, lap times, telemetry, agent runs inherit visibility
-- through their session_id — same policy shape, different table.
ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_notes_owner_access ON session_notes
  USING (
    session_id IN (SELECT id FROM sessions)  -- sessions RLS already filters this
  );

ALTER TABLE lap_times ENABLE ROW LEVEL SECURITY;
CREATE POLICY lap_times_owner_access ON lap_times
  USING (session_id IN (SELECT id FROM sessions));

ALTER TABLE telemetry_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY telemetry_owner_access ON telemetry_channels
  USING (session_id IN (SELECT id FROM sessions));

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_runs_owner_access ON agent_runs
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    OR
    user_id IN (
      SELECT id FROM users
      WHERE garage_id = (
        SELECT garage_id FROM users
        WHERE id = current_setting('app.current_user_id', true)::uuid
      )
      AND current_setting('app.current_role', true) = 'garage_admin'
    )
  );

-- User track notes: strictly owner-only — even garage admins don't see
-- a teammate's personal corner notes, only their session data and quota.
ALTER TABLE user_track_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_track_notes_strict_owner ON user_track_notes
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Garages: visible to their own admin and members (read-only for members).
ALTER TABLE garages ENABLE ROW LEVEL SECURITY;
CREATE POLICY garages_member_access ON garages
  USING (
    id = (
      SELECT garage_id FROM users
      WHERE id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- Product admin bypass — superuser role used by the admin service
-- connection skips RLS entirely via BYPASSRLS, configured at the
-- database-role level (not here). This file does NOT grant any bypass
-- in SQL; that's a deployment-time GRANT, reviewed separately so it's
-- never silently inherited by an application role.

-- ════════════════════════════════════════════════════════════════
-- Reference tables (simulators, car_classes, circuits, ideal_targets,
-- published_corner_notes, plans) are NOT row-level secured — they are
-- global read-only reference data for all authenticated users.
-- Write access to these tables is enforced at the API layer
-- (product_admin role required), not via RLS.
-- ════════════════════════════════════════════════════════════════
