import { BadgeStatus, LessonStatus } from '@prisma/client';

import { classifyStudentBadgeCohort } from '@/lib/badgeCohorts';
import { COMPLETED_BADGE_WHERE, isCompletedBadge } from '@/lib/roster/badgeSnapshot';

const STATUSES: Array<BadgeStatus | null> = [null, ...Object.values(BadgeStatus)];
const AWARDED: Array<Date | null> = [null, new Date('2026-11-01')];
const ATTEMPTS: Array<Array<{ passed: boolean }>> = [[], [{ passed: false }], [{ passed: false }, { passed: true }]];
const PROGRESS = [
  [],
  [
    {
      lessonId: 'l1',
      status: LessonStatus.COMPLETED,
      startedAt: new Date('2026-10-01'),
      completedAt: new Date('2026-10-02'),
      percentComplete: 100,
    },
  ],
];

describe('roster completed-badge rule', () => {
  // The roster counts completed badges straight from StudentBadge; this guards that
  // it can never drift from the cohort rule the profile and badge pages use.
  it('agrees with classifyStudentBadgeCohort for every status, award, attempt and progress combination', () => {
    for (const status of STATUSES) {
      for (const awardedAt of AWARDED) {
        for (const attempts of ATTEMPTS) {
          for (const lessonProgress of PROGRESS) {
            const { cohort } = classifyStudentBadgeCohort({
              badgeStatus: status,
              awardedAt,
              requirementLessonIds: ['l1'],
              lessonProgress,
              attempts,
            });
            expect([status, awardedAt, attempts.length, isCompletedBadge({ status, awardedAt })]).toEqual([
              status,
              awardedAt,
              attempts.length,
              cohort === 'PROFICIENT',
            ]);
          }
        }
      }
    }
  });

  it('expresses the same rule as a Prisma filter', () => {
    expect(COMPLETED_BADGE_WHERE).toEqual({
      OR: [{ status: BadgeStatus.COMPLETED }, { awardedAt: { not: null } }],
    });
  });
});
