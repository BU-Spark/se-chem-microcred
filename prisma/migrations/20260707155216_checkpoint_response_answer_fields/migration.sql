-- AlterTable
ALTER TABLE "CheckpointResponse" ADD COLUMN     "numericAnswer" DOUBLE PRECISION,
ADD COLUMN     "selectedIndices" JSONB;
