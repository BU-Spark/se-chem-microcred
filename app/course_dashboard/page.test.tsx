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

jest.mock('../hooks/useStudentData', () => {
  const refreshAllStudentData = jest.fn();
  return {
    useStudentData: (...args: unknown[]) => mockUseStudentData(...args),
    useRefreshAllStudentData: () => refreshAllStudentData,
  };
});

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

  it('places course details inside the title box', async () => {
    mockUseStudentData.mockReturnValue({
      data: {
        student: { name: 'Student Demo', email: 'student@example.edu' },
        course: {
          id: 'course-2',
          code: 'CHEM 101',
          section: '02',
          title: 'General Chemistry',
          description: 'Build foundational laboratory skills.',
          contacts: [{ id: 'instructor-1', name: 'Dr. Rivera', type: 'instructor', email: 'rivera@example.edu' }],
        },
        lessons: { upNext: [], inProgress: [], completed: [] },
        badges: { inReview: [] },
        surveys: { pendingBadge: [] },
      },
      isLoading: false,
      refresh: jest.fn(),
    });

    render(<CourseDashboardPage />);

    const title = await screen.findByRole('heading', { name: 'General Chemistry' });
    const titleBox = title.closest('section');
    expect(titleBox).toHaveTextContent('About this course');
    expect(titleBox).toHaveTextContent('Build foundational laboratory skills.');
    expect(titleBox).toHaveTextContent('Dr. Rivera');
    expect(screen.getAllByRole('heading', { name: 'About this course' })).toHaveLength(1);
  });

  it('uses the badge requirement video for the card image when the lesson has no segment video', async () => {
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
    id: 'b1',
    slug,
    name: 'Safety',
    status,
    latestAttemptPassed,
    cooldownUntil: null as string | null,
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

  it.each([
    ['passed the assessment (badge COMPLETED)', 'COMPLETED', 'completed', true],
    ['failed, feedback not yet acknowledged (badge IN_REVIEW)', 'IN_REVIEW', 'inReview', false],
    ['failed terminally (badge LOCKED)', 'LOCKED', 'locked', false],
    ['failed on a legacy/backfilled badge still at LEARNING', 'LEARNING', 'learning', false],
  ])(
    'routes a completed badge lesson to the feedback page when the student %s',
    async (_label, status, bucket, passed) => {
      mockUseStudentData.mockReturnValue(dataWithCompletedLesson('safety', bucket, status, passed as boolean | null));

      render(<CourseDashboardPage />);

      const review = await screen.findByRole('link', { name: 'Review' });
      expect(review.getAttribute('href')).toBe('/badges/safety/feedback?courseId=course-2');
    }
  );

  it.each([
    ['has not been assessed yet', null],
    ['failed and acknowledged, retry allowed', false],
  ])('offers the assessment code on a completed badge lesson when the student %s', async (_label, passed) => {
    mockUseStudentData.mockReturnValue(
      dataWithCompletedLesson('safety', 'readyForAssessment', 'READY_FOR_ASSESSMENT', passed as boolean | null)
    );

    render(<CourseDashboardPage />);

    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'ABC123' }) });

    fireEvent.click(await screen.findByRole('button', { name: 'Show Code' }));

    expect(await screen.findByText('Safety Skill Check')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('keeps the feedback link while the reassessment cooldown is still running', async () => {
    const data = dataWithCompletedLesson('safety', 'readyForAssessment', 'READY_FOR_ASSESSMENT', false);
    data.data.badges.readyForAssessment[0].cooldownUntil = new Date(Date.now() + 86_400_000).toISOString();
    mockUseStudentData.mockReturnValue(data);

    render(<CourseDashboardPage />);

    const review = await screen.findByRole('link', { name: 'Review' });
    expect(review.getAttribute('href')).toBe('/badges/safety/feedback?courseId=course-2');
  });

  // A badge with no StudentBadge row isn't resolvable on the feedback page (it would
  // bounce to /badges), so the card falls back to the QEV route in review mode.
  it('falls back to the QEV route when the badge has not been started', async () => {
    mockUseStudentData.mockReturnValue(dataWithCompletedLesson('safety', 'notStarted', 'NOT_STARTED', null));

    render(<CourseDashboardPage />);

    const review = await screen.findByRole('link', { name: 'Review' });
    expect(review.getAttribute('href')).toBe('/lessons/lab-safety/video?courseId=course-2');
  });

  it.each([
    ['awaiting a first assessment', 'READY_FOR_ASSESSMENT', null, 'Ready for assessment', 'In progress'],
    ['awaiting failed-feedback review', 'IN_REVIEW', false, 'In review', 'In progress'],
    ['awaiting passed-feedback review and rating', 'IN_REVIEW', true, 'In review', 'In progress'],
    ['out of assessment attempts', 'LOCKED', false, 'Locked', 'In progress'],
    ['has earned the badge', 'COMPLETED', true, 'Completed', 'Completed'],
    ['finished the lesson but still owes lesson feedback', 'LEARNING', null, 'Still learning', 'In progress'],
  ])(
    'shows the consolidated badge state under the correct section when the student is %s',
    async (_label, status, passed, text, sectionTitle) => {
      const bucket =
        status === 'READY_FOR_ASSESSMENT'
          ? 'readyForAssessment'
          : status === 'IN_REVIEW'
            ? 'inReview'
            : status === 'LOCKED'
              ? 'locked'
              : status === 'LEARNING'
                ? 'learning'
                : 'completed';
      mockUseStudentData.mockReturnValue(dataWithCompletedLesson('safety', bucket, status, passed as boolean | null));

      render(<CourseDashboardPage />);

      const statusText = (await screen.findAllByText(text)).find((element) => element.tagName === 'DIV');
      expect(statusText).toBeDefined();
      expect(statusText!.closest('section')).toHaveTextContent(sectionTitle);
    }
  );

  it('keeps a reassessment cooldown in the consolidated assessment state', async () => {
    const payload = dataWithCompletedLesson('safety', 'readyForAssessment', 'READY_FOR_ASSESSMENT', false);
    payload.data.badges.readyForAssessment[0].cooldownUntil = '2099-08-21T14:30:00.000Z';
    mockUseStudentData.mockReturnValue(payload);

    render(<CourseDashboardPage />);

    const statusText = await screen.findByText('Ready for assessment');
    expect(statusText.closest('section')).toHaveTextContent('In progress');
  });

  it.each([
    ['not started', 'NOT_STARTED', 'upNext', 'Start', '/lessons/lab-safety?courseId=course-2'],
    ['in progress', 'IN_PROGRESS', 'inProgress', 'Continue', '/lessons/lab-safety/video?courseId=course-2'],
  ])('routes a %s lesson to the right destination', async (_label, status, bucket, action, expectedHref) => {
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
    expect(link.getAttribute('href')).toBe(expectedHref);
  });

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

    fireEvent.click(screen.getByRole('button', { name: 'Submitting…' }));
    expect(submitFetch.mock.calls.length).toBe(callsBeforeSecondClick);
    expect(submitFetch.mock.calls.filter((call) => String(call[0]).includes('/survey'))).toHaveLength(1);

    releaseSubmit({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Submitting…' })).not.toBeInTheDocument());
  });

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

      expect(await screen.findByText('Your instructor has waived your QEV.')).toBeInTheDocument();
    });

    it('offers the assessment code instead of sending the student back to the video', async () => {
      mockUseStudentData.mockReturnValue(waivedData('2026-08-11T12:00:00.000Z'));

      render(<CourseDashboardPage />);

      expect(await screen.findByRole('button', { name: 'Show Code' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Continue' })).not.toBeInTheDocument();
    });

    it('offers a review link once the waived badge has been assessed', async () => {
      const data = waivedData('2026-08-11T12:00:00.000Z');
      data.data.badges.readyForAssessment[0].status = 'COMPLETED';
      data.data.badges.readyForAssessment[0].latestAttemptPassed = true;
      mockUseStudentData.mockReturnValue(data);

      render(<CourseDashboardPage />);

      const review = await screen.findByRole('link', { name: 'Review' });
      expect(review.getAttribute('href')).toBe('/badges/safety/feedback?courseId=course-2');
      expect(screen.queryByRole('link', { name: 'Continue' })).not.toBeInTheDocument();
    });

    it('labels an unstarted lesson "Waived" rather than "Lesson not started"', async () => {
      const data = waivedData('2026-08-11T12:00:00.000Z');
      data.data.lessons.inProgress = [{ ...completedBadgeLesson('safety'), id: 'lesson-open', status: 'NOT_STARTED' }];
      data.data.badges.readyForAssessment[0].status = 'LEARNING';
      mockUseStudentData.mockReturnValue(data);

      render(<CourseDashboardPage />);

      expect(await screen.findByText('Waived')).toBeInTheDocument();
      expect(screen.queryByText('Lesson not started')).not.toBeInTheDocument();
    });

    it('says nothing when the requirement was not waived', async () => {
      mockUseStudentData.mockReturnValue(waivedData(null));

      render(<CourseDashboardPage />);

      await screen.findByRole('link', { name: 'Continue' });
      expect(screen.queryByText(/waived your QEV/)).not.toBeInTheDocument();
    });
  });

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

      expect(await screen.findByText('No lessons ready to start.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /to finalize/i })).not.toBeInTheDocument();
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

      expect(await screen.findByText('No lessons ready to start.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /to finalize/i })).not.toBeInTheDocument();
    });

    it('still shows a badge that belongs to this course', async () => {
      mockUseStudentData.mockReturnValue(dataWith({ badges: { inReview: [readyBadge('course-2')] } }));

      render(<CourseDashboardPage />);

      expect(
        await screen.findByRole('button', { name: 'Review feedback for Safety to finalize it.' })
      ).toBeInTheDocument();
    });

    it('still shows a badge with no derivable course, which belongs to no course', async () => {
      // No lesson-backed requirement means no courseId. Hiding it would strand the
      // student: nothing else surfaces it.
      mockUseStudentData.mockReturnValue(dataWith({ badges: { inReview: [readyBadge(null)] } }));

      render(<CourseDashboardPage />);

      expect(
        await screen.findByRole('button', { name: 'Review feedback for Safety to finalize it.' })
      ).toBeInTheDocument();
    });
  });
});
