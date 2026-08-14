/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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

  // SurveyResponse has no unique key on (promptId, studentId) and the route does
  // find-then-write, so two overlapping submits each insert a row and the student's
  // rating counts twice. The route's IN_REVIEW -> COMPLETED guard already covers
  // sequential clicks; the button has to cover the concurrent ones.
  //
  // This modal is reached only by landing on /course_dashboard?surveyBadge=<slug>.
  // The in-app finalize flow ("Review & Finalize") routes to the badge feedback
  // page instead, which has its own guard — so this path is defensive.
  it('blocks a second survey submit while the first is still in flight', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ courseId: 'course-2', surveyBadge: 'safety' }));

    let releaseSubmit: (value: unknown) => void = () => undefined;
    const submitFetch = jest.fn(
      (...args: unknown[]) =>
        new Promise((resolve) => {
          void args;
          releaseSubmit = resolve;
        })
    );
    global.fetch = submitFetch as unknown as typeof fetch;

    mockUseStudentData.mockReturnValue({
      data: {
        student: { name: 'Student Demo', email: 'student@example.edu' },
        lessons: { upNext: [], inProgress: [], completed: [] },
        badges: { inReview: [] },
        surveys: {
          pendingBadge: [
            { promptId: 'p1', badgeId: 'b1', badgeSlug: 'safety', badgeName: 'Safety', question: 'How was it?' },
          ],
        },
      },
      isLoading: false,
      refresh: jest.fn(),
    });

    render(<CourseDashboardPage />);

    const submit = await screen.findByRole('button', { name: 'Submit' });
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled());

    const callsBeforeSecondClick = submitFetch.mock.calls.length;

    // The impatient second click a student makes when nothing appears to happen.
    fireEvent.click(screen.getByRole('button', { name: 'Submitting…' }));
    expect(submitFetch.mock.calls.length).toBe(callsBeforeSecondClick);
    expect(submitFetch.mock.calls.filter((call) => String(call[0]).includes('/survey'))).toHaveLength(1);

    // Let the in-flight submit settle so its state updates land inside the test.
    releaseSubmit({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Submitting…' })).not.toBeInTheDocument());
  });

  // A waived badge leaves lesson progress untouched by design, so the lesson stays
  // in "Pick up where you left off" while the badge reports itself assessable. The
  // note is what stops those two true statements reading as a contradiction.
  describe('a waived QEV requirement', () => {
    const waivedData = (qevWaivedAt: string | null) => ({
      data: {
        student: { name: 'Student Demo', email: 'student@example.edu' },
        lessons: {
          upNext: [],
          completed: [],
          inProgress: [{ ...completedBadgeLesson('safety'), id: 'lesson-open', status: 'IN_PROGRESS' }],
        },
        badges: {
          inReview: [],
          readyForAssessment: [{ ...makeBadge('safety', 'READY_FOR_ASSESSMENT', null), id: 'b1', qevWaivedAt }],
        },
        surveys: { pendingBadge: [] },
      },
      isLoading: false,
      refresh: jest.fn(),
    });

    it('explains on the lesson card why the assessment unlocked', async () => {
      mockUseStudentData.mockReturnValue(waivedData('2026-08-11T12:00:00.000Z'));

      render(<CourseDashboardPage />);

      expect(
        await screen.findByText(
          'Your instructor cleared this requirement for Safety — you can be assessed without finishing it.'
        )
      ).toBeInTheDocument();
    });

    it('leaves the lesson where it was rather than pretending it is finished', async () => {
      mockUseStudentData.mockReturnValue(waivedData('2026-08-11T12:00:00.000Z'));

      render(<CourseDashboardPage />);

      // Still "Continue", still in progress — the waiver unblocks assessment, it
      // does not complete the lesson.
      expect(await screen.findByRole('link', { name: 'Continue' })).toBeInTheDocument();
    });

    it('says nothing when the requirement was not waived', async () => {
      mockUseStudentData.mockReturnValue(waivedData(null));

      render(<CourseDashboardPage />);

      await screen.findByRole('link', { name: 'Continue' });
      expect(screen.queryByText(/Your instructor cleared this requirement/)).not.toBeInTheDocument();
    });
  });

  // "Ready to finalize" is a per-course list. The API scopes it too, but a badge
  // finalizable in course A used to render on every other course's dashboard, so
  // both sources are filtered here as well.
  describe('a badge ready to finalize in a different course', () => {
    const readyBadge = (courseId: string | null) => ({
      ...makeBadge('safety', 'IN_REVIEW', true),
      courseId,
    });

    const dataWith = (overrides: Record<string, unknown>) => ({
      data: {
        student: { name: 'Student Demo', email: 'student@example.edu' },
        lessons: { upNext: [], inProgress: [], completed: [] },
        badges: { inReview: [] },
        surveys: { pendingBadge: [] },
        ...overrides,
      },
      isLoading: false,
      refresh: jest.fn(),
    });

    it('stays out of this course panel and its count', async () => {
      mockUseStudentData.mockReturnValue(dataWith({ badges: { inReview: [readyBadge('course-99')] } }));

      render(<CourseDashboardPage />);

      expect(await screen.findByText('No badges ready to finalize right now.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Review & Finalize' })).not.toBeInTheDocument();
    });

    it('stays out when it arrives as a pending survey instead', async () => {
      // pendingBadge is the second, independent source feeding the same panel.
      mockUseStudentData.mockReturnValue(
        dataWith({
          surveys: {
            pendingBadge: [
              {
                promptId: 'p1',
                badgeId: 'b1',
                courseId: 'course-99',
                badgeSlug: 'safety',
                badgeName: 'Safety',
                question: 'How was it?',
              },
            ],
          },
        })
      );

      render(<CourseDashboardPage />);

      expect(await screen.findByText('No badges ready to finalize right now.')).toBeInTheDocument();
    });

    it('still shows a badge that belongs to this course', async () => {
      mockUseStudentData.mockReturnValue(dataWith({ badges: { inReview: [readyBadge('course-2')] } }));

      render(<CourseDashboardPage />);

      expect(await screen.findByRole('button', { name: 'Review & Finalize' })).toBeInTheDocument();
    });

    it('still shows a badge with no derivable course, which belongs to no course', async () => {
      // No lesson-backed requirement means no courseId. Hiding it would strand the
      // student: nothing else surfaces it.
      mockUseStudentData.mockReturnValue(dataWith({ badges: { inReview: [readyBadge(null)] } }));

      render(<CourseDashboardPage />);

      expect(await screen.findByRole('button', { name: 'Review & Finalize' })).toBeInTheDocument();
    });
  });
});
