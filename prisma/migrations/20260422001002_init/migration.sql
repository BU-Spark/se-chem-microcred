-- DropIndex
DROP INDEX "public"."Course_code_section_key";

-- AlterTable
ALTER TABLE "Course" ALTER COLUMN "sectionCount" DROP DEFAULT;