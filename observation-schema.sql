-- ============================================================
-- QASSAN — social-observation support
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Med enters observations from public social-media posts he reads. They become
-- events with is_official = false, shown under "رصد من مواقع التواصل — غير مؤكد".
-- is_official already distinguishes them: every parsed event is is_official =
-- true, so false is a clean marker with no migration of existing rows.
-- ============================================================

-- Where the observation was seen. Official events have source_document_id;
-- a manual observation has a URL to the post instead.
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_url text;

-- The anon SELECT policy on events already filters to approved rows, and an
-- observation is inserted approved, so it is covered without a policy change.
-- No new grant is needed: source_url rides along on the existing SELECT.

-- verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'events' AND column_name IN ('is_official','source_url')
ORDER BY column_name;
