-- Data backfill (no schema change).
--
-- Older badge imports copied Lesson.estimatedMinutes and the primary LessonSegment.duration
-- verbatim from the source lesson, which were NULL, while the authored video length only ever
-- lived in the badge requirement summary JSON (`videoLength`). Those lessons therefore show no
-- duration to students even though a length was recorded. The import path is now fixed
-- (lib/badges/badge-import.service.ts); this migration heals the rows created before that fix.
--
-- Idempotent and non-destructive: only fills NULLs, and only when a parseable
-- SS / MM:SS / HH:MM:SS length exists in the requirement summary. Re-running is a no-op.

-- TRY-cast helper so a malformed (non-JSON) summary row can't abort the whole migration.
CREATE OR REPLACE FUNCTION pg_temp.safe_jsonb(t text) RETURNS jsonb AS $$
BEGIN
  RETURN t::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- One row per lesson: the authored video length (in seconds) parsed from its requirement
-- summary. If a lesson has multiple requirements, take the longest recorded length.
CREATE TEMP TABLE _lesson_len AS
WITH req AS (
  SELECT
    br."lessonId"                                AS lesson_id,
    pg_temp.safe_jsonb(br.summary) ->> 'videoLength' AS video_length
  FROM "BadgeRequirement" br
  WHERE br."lessonId" IS NOT NULL
),
parsed AS (
  SELECT lesson_id, string_to_array(video_length, ':') AS parts
  FROM req
  -- Accept SS, MM:SS, HH:MM:SS with 1-2 digits per part; rejects empty / non-numeric.
  WHERE video_length ~ '^([0-9]{1,2}:){0,2}[0-9]{1,2}$'
),
secs AS (
  SELECT
    lesson_id,
    CASE cardinality(parts)
      WHEN 3 THEN parts[1]::int * 3600 + parts[2]::int * 60 + parts[3]::int
      WHEN 2 THEN parts[1]::int * 60 + parts[2]::int
      WHEN 1 THEN parts[1]::int
      ELSE 0
    END AS total_seconds
  FROM parsed
)
SELECT lesson_id, MAX(total_seconds) AS total_seconds
FROM secs
WHERE total_seconds > 0
GROUP BY lesson_id;

-- Lesson.estimatedMinutes: mirror the app's Math.max(1, Math.round(seconds / 60)).
UPDATE "Lesson" l
SET "estimatedMinutes" = GREATEST(1, ROUND(t.total_seconds / 60.0))::int
FROM _lesson_len t
WHERE l.id = t.lesson_id
  AND l."estimatedMinutes" IS NULL;

-- Primary segment (sortOrder 0) duration is stored in seconds, matching the video length.
UPDATE "LessonSegment" s
SET "duration" = t.total_seconds
FROM _lesson_len t
WHERE s."lessonId" = t.lesson_id
  AND s."sortOrder" = 0
  AND s."duration" IS NULL;

DROP TABLE _lesson_len;
