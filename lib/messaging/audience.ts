import type { EnrollmentRole } from '../enrollment/types';

// Who is allowed to send, and to whom. Both message routes share these rules so
// a permission fix can never land on one send path and miss the other.

export type SenderStanding = {
  isCreator: boolean;
  role: EnrollmentRole | null;
};

// Course creators and INSTRUCTORs are equivalent for messaging: a course may
// eventually have several instructors, and none of them should need to be the
// original creator to message their students.
export function isInstructorEquivalent({ isCreator, role }: SenderStanding): boolean {
  return isCreator || role === 'INSTRUCTOR';
}

// A CHECKER only gets instructor-equivalent messaging rights while the course
// has checker messaging switched on. This gates both 1:1 sends and blasts.
export function canSendCourseMessages(sender: SenderStanding, allowCheckerMessages: boolean): boolean {
  if (isInstructorEquivalent(sender)) return true;
  return sender.role === 'CHECKER' && allowCheckerMessages;
}

// Section overlap, matching the convention already used for roster visibility
// (see app/api/courses/[courseId]/students/[studentId]/route.ts): a checker with
// no sections of their own is course-wide, and a student with no section is
// reachable by every checker. Only when both sides carry sections does the
// overlap actually constrain anything.
export function isStudentInCheckerScope(checkerSections: string[], studentSections: string[]): boolean {
  if (checkerSections.length === 0) return true;
  if (studentSections.length === 0) return true;
  const scope = new Set(checkerSections);
  return studentSections.some((section) => scope.has(section));
}

// A checker's blast reaches their own sections only, unless the course lets
// checkers see across sections — in which case their reach matches an
// instructor's. Instructors are never section-limited.
export function scopeRecipientsToSender<T extends { studentId: string; sections: string[] }>(
  recipients: T[],
  options: {
    sender: SenderStanding;
    senderSections: string[];
    allowCrossSectionView: boolean;
  }
): T[] {
  const { sender, senderSections, allowCrossSectionView } = options;
  if (isInstructorEquivalent(sender) || allowCrossSectionView) return recipients;
  if (sender.role !== 'CHECKER') return recipients;
  return recipients.filter((recipient) => isStudentInCheckerScope(senderSections, recipient.sections));
}
