/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import CourseDashboardPage from './page';

const mockReplace = jest.fn();
const mockUsePathname = jest.fn(() => '/course_dashboard');
const mockUseSearchParams = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockUseStudentData = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (nextImageProps: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    const { fill, priority, ...props } = nextImageProps;
    void fill;
    void priority;
    return <img {...props} alt={props.alt} />;
  },
}));

jest.mock('../hooks/useStudentData', () => ({
  useStudentData: (...args: unknown[]) => mockUseStudentData(...args),
}));

describe('Course dashboard page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ courseId: 'course-2' }));
    mockUseUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        fullName: 'Student Demo',
        primaryEmailAddress: { emailAddress: 'student@example.edu' },
      },
    });
    mockUseAuth.mockReturnValue({
      signOut: jest.fn(),
    });
    mockUseStudentData.mockReturnValue({
      data: {
        student: { name: 'Student Demo', email: 'student@example.edu' },
        lessons: { upNext: [], inProgress: [] },
        badges: { inReview: [] },
        surveys: { pendingBadge: [] },
      },
      isLoading: false,
      refresh: jest.fn(),
    });
  });

  it('loads student dashboard data for the course id from the clicked enrolled-course card', async () => {
    render(<CourseDashboardPage />);

    await waitFor(() => {
      expect(mockUseStudentData).toHaveBeenCalledWith('student@example.edu', 'course-2');
    });
  });

  it('uses the badge requirement video for the card image when the lesson has no segment video', async () => {
    // Badge videos live on badgeRequirements[].youtubeUrl, not on a segment (bug #14).
    // A badge-only lesson must resolve to the YouTube thumbnail, not the ChemSkills dummy.
    mockUseStudentData.mockReturnValue({
      data: {
        student: { name: 'Student Demo', email: 'student@example.edu' },
        lessons: {
          upNext: [
            {
              id: 'lesson-1',
              slug: 'lab-safety',
              title: 'Lab Safety Basics',
              status: 'NOT_STARTED',
              percentComplete: 0,
              dueDate: null,
              estimatedMinutes: null,
              thumbnailUrl: null,
              segments: [],
              badgeRequirements: [
                { badgeId: 'b1', badgeName: 'Safety', badgeSlug: 'safety', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' },
              ],
            },
          ],
          inProgress: [],
        },
        badges: { inReview: [] },
        surveys: { pendingBadge: [] },
      },
      isLoading: false,
      refresh: jest.fn(),
    });

    render(<CourseDashboardPage />);

    const img = await screen.findByAltText('Lesson preview');
    expect(img.getAttribute('src')).toContain('dQw4w9WgXcQ');
    expect(img.getAttribute('src')).not.toContain('ChemSkills');
  });

  const completedBadgeLesson = (badgeSlug: string) => ({
    id: 'lesson-done',
    slug: 'lab-safety',
    title: 'Lab Safety Basics',
    status: 'COMPLETED',
    percentComplete: 100,
    dueDate: null,
    estimatedMinutes: null,
    thumbnailUrl: null,
    segments: [],
    badgeRequirements: [{ badgeId: 'b1', badgeName: 'Safety', badgeSlug, youtubeUrl: null }],
  });

  const makeBadge = (slug: string, status: string, latestAttemptPassed: boolean | null) => ({
    id: `id-${slug}`,
    slug,
    name: 'Safety',
    status,
    latestAttemptPassed,
  });

  const dataWithCompletedLesson = (
    badgeSlug: string,
    bucket: string,
    status: string,
    latestAttemptPassed: boolean | null
  ) => ({
    data: {
      student: { name: 'Student Demo', email: 'student@example.edu' },
      lessons: { upNext: [], inProgress: [], completed: [completedBadgeLesson(badgeSlug)] },
      badges: { inReview: [], [bucket]: [makeBadge(badgeSlug, status, latestAttemptPassed)] },
      surveys: { pendingBadge: [] },
    },
    isLoading: false,
    refresh: jest.fn(),
  });

  // Issue #194: a completed badge lesson's "Review" points at the badge feedback page,
  // which is where the review material lives — in every assessment state, not just the
  // failing one. Routing can't key off badge status: a failed badge only sits at
  // IN_REVIEW until the feedback is acknowledged, then drops to READY_FOR_ASSESSMENT or
  // LOCKED, and the state machine backfill put every pre-existing failed badge at
  // READY_FOR_ASSESSMENT.
  it.each([
    ['passed the assessment (badge COMPLETED)', 'COMPLETED', 'completed', true],
    ['failed, feedback not yet acknowledged (badge IN_REVIEW)', 'IN_REVIEW', 'inReview', false],
    ['failed terminally (badge LOCKED)', 'LOCKED', 'locked', false],
    ['failed and acknowledged, retry allowed', 'READY_FOR_ASSESSMENT', 'readyForAssessment', false],
    ['failed on a legacy/backfilled badge still at LEARNING', 'LEARNING', 'learning', false],
    ['has not been assessed yet', 'READY_FOR_ASSESSMENT', 'readyForAssessment', null],
  ])(
    'routes a completed badge lesson to the feedback page when the student %s',
    async (_label, status, bucket, passed) => {
      mockUseStudentData.mockReturnValue(dataWithCompletedLesson('safety', bucket, status, passed as boolean | null));

      render(<CourseDashboardPage />);

      const review = await screen.findByRole('link', { name: 'Review' });
      expect(review.getAttribute('href')).toBe('/badges/safety/feedback?courseId=course-2');
    }
  );

  // A badge with no StudentBadge row isn't resolvable on the feedback page (it would
  // bounce to /badges), so the card falls back to the QEV route in review mode.
  it('falls back to the QEV route when the badge has not been started', async () => {
    mockUseStudentData.mockReturnValue(dataWithCompletedLesson('safety', 'notStarted', 'NOT_STARTED', null));

    render(<CourseDashboardPage />);

    const review = await screen.findByRole('link', { name: 'Review' });
    expect(review.getAttribute('href')).toBe('/lessons/lab-safety/video?courseId=course-2');
  });

  // Start/Continue drop the student straight into the video + checkpoint questions,
  // never the lesson preview page.
  it.each([
    ['not started', 'NOT_STARTED', 'upNext', 'Start'],
    ['in progress', 'IN_PROGRESS', 'inProgress', 'Continue'],
  ])('routes a %s lesson to the QEV route', async (_label, status, bucket, action) => {
    mockUseStudentData.mockReturnValue({
      data: {
        student: { name: 'Student Demo', email: 'student@example.edu' },
        lessons: {
          upNext: [],
          inProgress: [],
          completed: [],
          [bucket]: [{ ...completedBadgeLesson('safety'), id: 'lesson-open', status }],
        },
        badges: { inReview: [] },
        surveys: { pendingBadge: [] },
      },
      isLoading: false,
      refresh: jest.fn(),
    });

    render(<CourseDashboardPage />);

    const link = await screen.findByRole('link', { name: action });
    expect(link.getAttribute('href')).toBe('/lessons/lab-safety/video?courseId=course-2');
  });
});
