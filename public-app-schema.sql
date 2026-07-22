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
-- ============================================================

-- ---------- reports ----------
-- Anonymous by design: a device-scoped opaque hash, never an account, never
-- an email, never a name, never a location.
CREATE TABLE IF NOT EXISTS reports (
  id           bigserial PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  device_hash  text        NOT NULL,
  place_id     bigint      REFERENCES places(id) ON DELETE SET NULL,
  utility      text        NOT NULL CHECK (utility IN ('electricity','water')),
  kind         text        NOT NULL CHECK (kind IN ('out','back')),
  -- The user explicitly confirmed the area they are reporting for. Replaces
  -- the coarse-geolocation proposal, which conflicted with "device_hash only".
  -- A flag about the answer, not a location.
  area_confirmed boolean   NOT NULL DEFAULT false
);

-- Rate limiting reads (device, kind, place, recency); also the "neighbours"
-- count, which scans by place and time.
CREATE INDEX IF NOT EXISTS idx_reports_rate
  ON reports (device_hash, kind, place_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_recent
  ON reports (place_id, created_at DESC);

-- ---------- row-level security ----------
ALTER TABLE events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_areas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE places         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs  ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS, so the collector, parser and dashboard are
-- unaffected by everything below.

-- events: approved only. This is the approval gate expressed in the database.
DROP POLICY IF EXISTS anon_read_approved_events ON events;
CREATE POLICY anon_read_approved_events ON events
  FOR SELECT TO anon
  USING (approval_status IN ('approved','auto_approved'));

-- event_areas: visible only for events the reader may already see. Without
-- the EXISTS clause, the areas of an unapproved outage would leak its
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
-- else's reports — including its own. Counting is done server-side with the
-- service key.
DROP POLICY IF EXISTS anon_insert_reports ON reports;
CREATE POLICY anon_insert_reports ON reports
  FOR INSERT TO anon WITH CHECK (true);

-- raw_documents and pipeline_runs get NO anon policy at all. RLS with no
-- policy denies everything, which is correct: raw_documents holds the text of
-- announcements that have not been approved.

-- ---------- verify ----------
-- Every table below must show rowsecurity = true.
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN ('events','event_areas','places','reports',
                  'raw_documents','pipeline_runs')
ORDER BY relname;

-- Expect: events(1), event_areas(1), places(1), reports(1).
-- raw_documents and pipeline_runs must NOT appear here.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
