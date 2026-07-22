-- ============================================================
-- QASSAN — Phase 2 Task 3: public app schema + row-level security
--
-- Run once in the Supabase SQL editor. Idempotent.
--
-- This file is what makes the anon/publishable key safe to ship in a browser.
-- Until now every read has used the service key, which bypasses RLS by
-- design. The public app uses the anon key instead, so the database itself
-- enforces "nothing publishes without approval" — not the query, and not the
-- developer remembering to add a filter.
--
-- reports already exists from qassan-schema.sql, with reported_at (not
-- created_at) and an is_flagged/flag_reason moderation pair. This file adapts
-- to that table rather than replacing it.
-- ============================================================

-- ---------- preflight ----------
-- Shows the CHECK constraints on reports, so the values the app sends for
-- utility and kind can be matched to what the table already accepts.
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'reports' AND con.contype = 'c';

-- ---------- reports: one new column ----------
-- The user explicitly confirmed which area they were reporting for. This
-- replaces the coarse-geolocation proposal, which conflicted with the
-- "device_hash only" contract line. It records a fact about their answer,
-- not about where they are.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS area_confirmed boolean NOT NULL DEFAULT false;

-- Rate limiting reads by (device, kind, place, recency); the neighbours count
-- reads by (place, recency).
CREATE INDEX IF NOT EXISTS idx_reports_rate
  ON reports (device_hash, kind, place_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_recent
  ON reports (place_id, reported_at DESC);

-- ---------- row-level security ----------
ALTER TABLE events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_areas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE places         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs  ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS, so the collector, parser and dashboard are
-- unaffected by everything below.

-- events: approved only. The approval gate, expressed in the database.
DROP POLICY IF EXISTS anon_read_approved_events ON events;
CREATE POLICY anon_read_approved_events ON events
  FOR SELECT TO anon
  USING (approval_status IN ('approved','auto_approved'));

-- event_areas: visible only for events the reader may already see. Without
-- the EXISTS clause, the areas of an unapproved outage would leak both its
-- existence and its geography.
DROP POLICY IF EXISTS anon_read_approved_event_areas ON event_areas;
CREATE POLICY anon_read_approved_event_areas ON event_areas
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_areas.event_id
      AND e.approval_status IN ('approved','auto_approved')
  ));

-- places: public reference data. The area picker needs the whole registry,
-- and a list of Tunisian delegations is not sensitive.
DROP POLICY IF EXISTS anon_read_places ON places;
CREATE POLICY anon_read_places ON places
  FOR SELECT TO anon USING (true);

-- reports: INSERT only. No SELECT policy exists, so anon cannot read anyone
-- else's reports — nor its own. Counting and rate limiting run server-side
-- with the service key.
DROP POLICY IF EXISTS anon_insert_reports ON reports;
CREATE POLICY anon_insert_reports ON reports
  FOR INSERT TO anon WITH CHECK (true);

-- raw_documents and pipeline_runs get NO anon policy at all. RLS with no
-- policy denies everything, which is correct: raw_documents holds the text of
-- announcements that have not been approved.

-- ---------- verify ----------
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN ('events','event_areas','places','reports',
                  'raw_documents','pipeline_runs')
ORDER BY relname;

-- Expect exactly four policies: events, event_areas, places, reports.
-- raw_documents and pipeline_runs must NOT appear.
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
