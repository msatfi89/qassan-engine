-- ============================================================
-- QASSAN — Phase 2: backfill support
-- Run once in the Supabase SQL editor, before the first backfill.
-- Safe to re-run: every statement is IF NOT EXISTS.
-- ============================================================

-- Historical events are held to the same approval gate as live ones; this
-- flag only marks provenance, so the dashboard can separate "today's news"
-- from "the 2023-2026 archive" and so a bad backfill can be undone with a
-- single predicate instead of a guessed id range.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS backfilled boolean NOT NULL DEFAULT false;

-- Set on the document at collection time; the parser copies it onto any
-- event it creates, so provenance survives even if a document is re-parsed.
ALTER TABLE raw_documents
  ADD COLUMN IF NOT EXISTS is_backfill boolean NOT NULL DEFAULT false;

-- The parser's hot query is parse_status='new' ordered by fetched_at; a
-- backfill puts thousands of rows in this table, so it stops being a
-- rounding error.
CREATE INDEX IF NOT EXISTS idx_raw_documents_parse_status
  ON raw_documents (parse_status, fetched_at);

CREATE INDEX IF NOT EXISTS idx_events_backfilled
  ON events (backfilled, approval_status);

-- Verify
SELECT
  (SELECT count(*) FROM events)        AS events,
  (SELECT count(*) FROM raw_documents) AS documents;
