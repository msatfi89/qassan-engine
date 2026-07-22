-- ============================================================
-- QASSAN — Phase 2 Task 1b: merge seed/official spelling variants
--
-- registry-full.sql deduped on exact name only, so where the original seed
-- used a short form and the official list uses the full one, BOTH rows now
-- exist for a single real place. Two events naming that place could link to
-- different ids and the map would show them as separate areas.
--
-- Scope is deliberately narrow. A containment search (does one name contain
-- the other?) returns real duplicates AND pairs that merely look alike:
--     حدائق قرطاج / قرطاج          Jardins de Carthage is not Carthage
--     العمران الأعلى / العمران      two distinct Tunis delegations
--     مطماطة الجديدة / مطماطة       two distinct Gabès delegations
--     جندوبة / جندوبة الشمالية      Jendouba Nord is its own delegation
-- Merging on containment would have destroyed those. So this merges only two
-- exact, unambiguous shapes:
--     X            ->  X المدينة     (seed short form vs official city seat)
--     التضامن      ->  حي التضامن    (the one حي-prefixed case)
--
-- Everything else is left alone; a genuine near-duplicate that is missed
-- costs nothing but a duplicate row, while a wrong merge is unrecoverable.
--
-- Safe to re-run: after the first pass the source rows no longer exist.
-- ============================================================

-- ---------- 1. Work out the pairs ----------
CREATE TEMP TABLE merges AS
SELECT old.id AS old_id, old.name_ar AS old_name,
       new.id AS new_id, new.name_ar AS new_name
FROM places old
JOIN places new
  ON new.parent_id = old.parent_id
 AND new.level = 'delegation' AND old.level = 'delegation'
 AND new.id <> old.id
 AND (new.name_ar = old.name_ar || ' المدينة'
      OR new.name_ar = 'حي ' || old.name_ar);

-- Review before anything changes.
SELECT * FROM merges ORDER BY old_id;

-- ---------- 2. Preserve the old spelling as an alias ----------
-- The short form is what announcements actually say, so it must keep
-- resolving after the row it named is gone.
UPDATE places p
SET aliases = (
      SELECT to_jsonb(array_agg(DISTINCT a))
      FROM (
        SELECT jsonb_array_elements_text(coalesce(p.aliases, '[]'::jsonb)) AS a
        UNION SELECT m.old_name
        UNION SELECT o.name_ar FROM places o WHERE o.id = m.old_id
        UNION SELECT jsonb_array_elements_text(coalesce(o.aliases, '[]'::jsonb))
              FROM places o WHERE o.id = m.old_id
      ) s
    )
FROM merges m
WHERE p.id = m.new_id;

-- ---------- 3. Move existing links to the surviving row ----------
-- Drop links that would collide with one the event already has, then repoint
-- the remainder. Done in this order so the update cannot violate a unique
-- (event_id, place_id) constraint.
DELETE FROM event_areas a
USING merges m
WHERE a.place_id = m.old_id
  AND EXISTS (SELECT 1 FROM event_areas b
              WHERE b.event_id = a.event_id AND b.place_id = m.new_id);

UPDATE event_areas a
SET place_id = m.new_id
FROM merges m
WHERE a.place_id = m.old_id;

-- Re-parent anything hanging off a row about to disappear (none expected at
-- delegation level, but a silent orphan is worse than a redundant statement).
UPDATE places c
SET parent_id = m.new_id
FROM merges m
WHERE c.parent_id = m.old_id;

-- ---------- 4. Remove the now-redundant rows ----------
DELETE FROM places p USING merges m WHERE p.id = m.old_id;

-- ---------- 5. Verify ----------
SELECT level, count(*) FROM places GROUP BY level ORDER BY 2 DESC;

-- The merged names must still resolve, now as aliases on the surviving row.
SELECT name_ar, aliases
FROM places
WHERE name_ar IN ('حي التضامن','بن عروس المدينة','جندوبة المدينة',
                  'زغوان المدينة','منوبة المدينة','نابل المدينة')
ORDER BY name_ar;

-- Must still be present and distinct — proof no false-positive pair was merged.
SELECT name_ar FROM places
WHERE name_ar IN ('حدائق قرطاج','قرطاج','العمران','العمران الأعلى',
                  'مطماطة','مطماطة الجديدة')
ORDER BY name_ar;
