-- ============================================================
-- QASSAN — neighborhood (حي / quartier) level
-- Run once in the Supabase SQL editor. Idempotent.
--
-- Adds a third place level beneath delegations. places.level has a CHECK
-- constraint that currently allows only governorate/delegation, so it must be
-- widened before any neighborhood row can be inserted.
-- ============================================================

-- Drop the existing level CHECK by whatever name it carries, then re-add one
-- that includes 'neighborhood'. Done dynamically so it does not depend on the
-- constraint's generated name.
DO $$
DECLARE cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'places' AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%level%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE places DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE places ADD CONSTRAINT places_level_check
  CHECK (level IN ('governorate', 'delegation', 'neighborhood'));

-- Speeds the picker's "does this delegation have neighborhoods?" lookup.
CREATE INDEX IF NOT EXISTS idx_places_parent_level ON places (parent_id, level);

-- verify
SELECT level, count(*) FROM places GROUP BY level ORDER BY 2 DESC;
