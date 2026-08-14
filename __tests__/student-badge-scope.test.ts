/** @jest-environment node */

import { resolveBadgeCourseId, studentBadgeScope } from '../lib/students/badgeScope';

describe('studentBadgeScope', () => {
  it('does not narrow by course when no course was requested', () => {
    // The Badge Passport and Home read the same endpoint without a courseId and
    // are cross-course by design — scoping them would hide real badges.
    expect(studentBadgeScope({ studentId: 's1', courseId: 'c1', courseRequested: false })).toEqual({
      studentId: 's1',
    });
  });

  it('scopes through BadgeRequirement -> Lesson.courseId when a course was requested', () => {
    const where = studentBadgeScope({ studentId: 's1', courseId: 'c1', courseRequested: true });

    expect(where.studentId).toBe('s1');
    expect(where.badge?.OR).toEqual(
      expect.arrayContaining([{ requirements: { some: { lesson: { courseId: 'c1' } } } }])
    );
  });

  it('keeps badges with no lesson-backed requirement, which have no derivable course', () => {
    const where = studentBadgeScope({ studentId: 's1', courseId: 'c1', courseRequested: true });

    expect(where.badge?.OR).toEqual(expect.arrayContaining([{ requirements: { none: { lessonId: { not: null } } } }]));
  });

  it('matches nothing when a course was requested but resolved to no enrollment', () => {
    // Falling back to every course's badges here is the leak this scoping closes.
    expect(studentBadgeScope({ studentId: 's1', courseId: null, courseRequested: true })).toEqual({
      studentId: 's1',
      badgeId: { in: [] },
    });
  });
});

describe('resolveBadgeCourseId', () => {
  it('reads the course off the first lesson-backed requirement', () => {
    expect(
      resolveBadgeCourseId([{ lesson: null }, { lesson: { courseId: 'c2' } }, { lesson: { courseId: 'c3' } }])
    ).toBe('c2');
  });

  it('returns null when no requirement carries a lesson', () => {
    expect(resolveBadgeCourseId([{ lesson: null }])).toBeNull();
    expect(resolveBadgeCourseId([])).toBeNull();
  });
});
