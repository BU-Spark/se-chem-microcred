-- Course sections — Stage 2 (backfill). Deploy with the application code that validates against
-- "Course"."sections"; without it every existing course has no sections and roster adds/reassigns
-- that include a section are rejected.
--
-- Names are grouped by LOWER(TRIM(...)) so "A1" and "a1 " become one section. MIN() picks one
-- spelling per group deterministically (uppercase sorts first).
UPDATE "Course" c
SET "sections" = s.names
FROM (
  SELECT course_id, array_agg(name ORDER BY name) AS names
  FROM (
    SELECT e."courseId" AS course_id, MIN(TRIM(es."section")) AS name
    FROM "EnrollmentSection" es
    JOIN "Enrollment" e ON e."id" = es."enrollmentId"
    WHERE TRIM(es."section") <> ''
    GROUP BY e."courseId", LOWER(TRIM(es."section"))
  ) per_section
  GROUP BY course_id
) s
WHERE c."id" = s.course_id;

-- sectionCount was typed in by hand; make it match the real sections (at least 1).
UPDATE "Course"
SET "sectionCount" = GREATEST(1, COALESCE(array_length("sections", 1), 0));
