/*
  Warnings:

  - You are about to drop the column `category` on the `Badge` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Badge" DROP COLUMN "category";

-- DropEnum
DROP TYPE "public"."BadgeCategory";
