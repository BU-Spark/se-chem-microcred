import { CourseRole } from '@prisma/client';

import prisma from '@/lib/prisma';

export type ReceiptInput = { userId: string; isObserver: boolean };

// Receipts for a blast: the students it targets, plus every active instructor
// and checker on the course as observers. Staff copies land in their inbox so
// colleagues can see what went out, but they are marked so the sender's read
// count stays a count of students. Section scope deliberately does not apply —
// staff are copied course-wide even on a section-limited blast.
export async function buildBlastReceipts(options: {
  courseId: string;
  authorId: string;
  studentIds: string[];
}): Promise<ReceiptInput[]> {
  const { courseId, authorId, studentIds } = options;

  const staff = await prisma.enrollment.findMany({
    where: {
      courseId,
      role: { in: [CourseRole.INSTRUCTOR, CourseRole.CHECKER] },
      status: 'ACTIVE',
    },
    select: { studentId: true },
  });

  const receipts: ReceiptInput[] = studentIds.map((userId) => ({ userId, isObserver: false }));

  // The author never receives their own message, and one receipt per person:
  // the (messageId, userId) unique constraint would reject a duplicate.
  const seen = new Set([authorId, ...studentIds]);
  for (const member of staff) {
    if (seen.has(member.studentId)) continue;
    seen.add(member.studentId);
    receipts.push({ userId: member.studentId, isObserver: true });
  }

  return receipts;
}

// A 1:1 message reaches exactly its recipient — no staff copies.
export function buildDirectReceipts(studentIds: string[]): ReceiptInput[] {
  return studentIds.map((userId) => ({ userId, isObserver: false }));
}
