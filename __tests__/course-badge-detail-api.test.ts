/** @jest-environment node */

import { NextRequest } from 'next/server';

const mockFetchUserByEmail = jest.fn();
const mockFetchCreatedCourseDetail = jest.fn();
const mockFetchCreatedBadgeDetail = jest.fn();
const mockFetchAccessibleCourseDetail = jest.fn();
const mockFetchAccessibleBadgeDetail = jest.fn();

jest.mock(
  '@/app/api/courses/lib/course-queries',
  () => ({
    fetchUserByEmail: (...args: unknown[]) => mockFetchUserByEmail(...args),
    fetchCreatedCourseDetail: (...args: unknown[]) => mockFetchCreatedCourseDetail(...args),
    fetchCreatedBadgeDetail: (...args: unknown[]) => mockFetchCreatedBadgeDetail(...args),
    fetchAccessibleCourseDetail: (...args: unknown[]) => mockFetchAccessibleCourseDetail(...args),
    fetchAccessibleBadgeDetail: (...args: unknown[]) => mockFetchAccessibleBadgeDetail(...args),
  }),
  { virtual: true }
);

jest.mock('../app/api/courses/lib/course-queries', () => ({
  fetchUserByEmail: (...args: unknown[]) => mockFetchUserByEmail(...args),
  fetchCreatedCourseDetail: (...args: unknown[]) => mockFetchCreatedCourseDetail(...args),
  fetchCreatedBadgeDetail: (...args: unknown[]) => mockFetchCreatedBadgeDetail(...args),
  fetchAccessibleCourseDetail: (...args: unknown[]) => mockFetchAccessibleCourseDetail(...args),
  fetchAccessibleBadgeDetail: (...args: unknown[]) => mockFetchAccessibleBadgeDetail(...args),
}));

function buildRequest() {
  return new NextRequest('http://localhost/api/courses/course-1/badge-1?email=prof%40example.edu', {
    headers: { Accept: 'application/json' },
  });
}

async function getBadgeDetail() {
  const { GET } = await import('../app/api/courses/[courseId]/[badgeId]/route');
  return (await GET(buildRequest(), {
    params: Promise.resolve({ courseId: 'course-1', badgeId: 'badge-1' }),
  })) as Response;
}

describe('course badge detail API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchUserByEmail.mockResolvedValue({ id: 'instructor-1' });
    mockFetchCreatedCourseDetail.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      enrollments: [],
    });
    mockFetchAccessibleCourseDetail.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      enrollments: [],
    });
    mockFetchAccessibleBadgeDetail.mockResolvedValue({
      id: 'course-1',
      title: 'Chemistry 101',
      createdBy: {
        id: 'instructor-1',
        name: 'Professor Demo',
        email: 'prof@example.edu',
        buid: null,
      },
      lessons: [
        {
          id: 'lesson-1',
          title: 'Bunsen Burner Lesson',
          sortOrder: 0,
          badgeRequirements: [
            {
              id: 'requirement-1',
              summary: JSON.stringify({
                videoTitle: 'Burner safety video',
                rubricItems: [{ number: 1, text: 'Use the burner safely.' }],
                gradingCriteria: [{ number: 1, criterion: 'Technique', options: ['Needs support', 'Ready'] }],
                checkpoints: [
                  {
                    number: 1,
                    title: 'Checkpoint 1',
                    question: 'What should be checked first?',
                    points: 5,
                    time: '00:01:00',
                  },
                ],
              }),
              badge: {
                id: 'badge-1',
                slug: 'bunsen-burner',
                name: 'Bunsen Burner Badge',
                description: 'Burner safety',
                category: 'EQUIPMENT',
              },
            },
          ],
        },
      ],
      enrollments: [
        {
          id: 'enrollment-1',
          role: 'STUDENT',
          sections: [{ section: 'A' }],
          student: {
            id: 'student-1',
            name: 'Student One',
            email: 'student1@example.edu',
            buid: 'U1',
            badgeProgress: [
              {
                id: 'progress-1',
                badgeId: 'badge-1',
                status: 'COMPLETED',
                awardedAt: new Date('2026-01-04T00:00:00.000Z'),
                score: 92,
                updatedAt: new Date('2026-01-04T00:00:00.000Z'),
              },
            ],
          },
        },
        {
          id: 'enrollment-2',
          role: 'STUDENT',
          sections: [{ section: 'B' }],
          student: {
            id: 'student-2',
            name: 'Student Two',
            email: 'student2@example.edu',
            buid: 'U2',
            badgeProgress: [
              {
                id: 'progress-2',
                badgeId: 'badge-1',
                status: 'READY_FOR_ASSESSMENT',
                awardedAt: null,
                score: null,
                updatedAt: new Date('2026-01-03T00:00:00.000Z'),
              },
            ],
          },
        },
        {
          id: 'enrollment-3',
          role: 'STUDENT',
          sections: [],
          student: {
            id: 'student-3',
            name: 'Student Three',
            email: 'student3@example.edu',
            buid: 'U3',
            badgeProgress: [],
          },
        },
      ],
    });
  });

  it('returns badge progress summary, assessment details, and student rows', async () => {
    const response = await getBadgeDetail();

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.badge).toEqual(
      expect.objectContaining({
        id: 'badge-1',
        name: 'Bunsen Burner Badge',
        description: 'Burner safety',
      })
    );
    expect(body.summary).toEqual(
      expect.objectContaining({
        totalStudents: 3,
        completedCount: 1,
        inProgressCount: 1,
        notStartedCount: 1,
        readyForAssessmentCount: 1,
        completedPercent: 33,
        inProgressPercent: 33,
        notStartedPercent: 33,
        averageScore: 92,
      })
    );
    expect(body.assessment.rubricItems).toEqual([{ number: 1, text: 'Use the burner safely.' }]);
    expect(body.assessment.videoTitle).toBe('Burner safety video');
    expect(body.students).toHaveLength(3);
    expect(body.students[2]).toEqual(expect.objectContaining({ status: 'NOT_STARTED', progress: null }));
  });
});
