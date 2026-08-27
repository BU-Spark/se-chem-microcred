-- Move messaging from one row per recipient to one authored message plus a
-- receipt per person it reached. Existing rows are already one-per-recipient,
-- so each becomes a message with exactly one receipt and no inbox is lost.

-- CreateEnum
CREATE TYPE "MessageAudience" AS ENUM ('DIRECT', 'ALL_STUDENTS', 'BADGE_INCOMPLETE');

-- AlterTable: audience descriptor, defaulted so existing rows stay valid.
ALTER TABLE "Message" ADD COLUMN "audience" "MessageAudience" NOT NULL DEFAULT 'DIRECT';

-- Messages carrying a badge were sent by the reminder flow, whose audience has
-- always been "students who have not completed this badge".
UPDATE "Message" SET "audience" = 'BADGE_INCOMPLETE' WHERE "badgeId" IS NOT NULL;

-- CreateTable
CREATE TABLE "MessageReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "isObserver" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageReceipt_messageId_userId_key" ON "MessageReceipt"("messageId", "userId");

-- CreateIndex
CREATE INDEX "MessageReceipt_userId_createdAt_idx" ON "MessageReceipt"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one receipt per existing message, preserving its read state and
-- timestamp. gen_random_uuid() is available on Postgres 13+ without pgcrypto.
INSERT INTO "MessageReceipt" ("id", "messageId", "userId", "readAt", "isObserver", "createdAt")
SELECT gen_random_uuid()::text, "id", "recipientId", "readAt", false, "createdAt"
FROM "Message";

-- Drop the per-recipient columns now that receipts carry them.
ALTER TABLE "Message" DROP CONSTRAINT "Message_recipientId_fkey";
DROP INDEX "Message_recipientId_createdAt_idx";
ALTER TABLE "Message" DROP COLUMN "recipientId";
ALTER TABLE "Message" DROP COLUMN "readAt";

-- CreateIndex
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_courseId_idx" ON "Message"("courseId");
