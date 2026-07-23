/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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

// The real modal fetches an assessment code on mount; stub it with a marker so we can
// assert the button opens it without hitting the network.
jest.mock('@/app/components/AssessmentCodeModal', () => ({
  __esModule: true,
  default: ({ badgeName, onClose }: { badgeName: string; onClose: () => void }) => (
    <div data-testid="assessment-code-modal">
      Code for {badgeName}
      <button type="button" onClick={onClose}>
        close-code
      </button>
    </div>
  ),
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

  // ---- Fixture helpers for the badge-grouped dashboard ------------------------------
  // Lessons are grouped under badges via lesson.badgeRequirements[].badgeId === badge.id,
  // and each badge renders as its own tab. The Overview is always visible (not a tab);
  // the first badge tab is selected by default, so only a non-default badge's lessons are
  // hidden until its tab is selected.

  type BadgeStatus = 'NOT_STARTED' | 'LEARNING' | 'READY_FOR_ASSESSMENT' | 'IN_REVIEW' | 'COMPLETED' | 'LOCKED';

  const makeBadge = (id: string, status: BadgeStatus, overrides: Record<string, unknown> = {}) => ({
    id,
    slug: id,
    name: `Badge ${id}`,
    description: null,
    status,
    score: null,
    latestAttemptPassed: null,
    cooldownUntil: null,
    youtubeUrl: null,
    requirements: [],
    ...overrides,
  });

  const makeLesson = (id: string, badgeId: string, overrides: Record<string, unknown> = {}) => ({
    id: `lesson-${id}`,
    slug: `${id}-lesson`,
    title: `Lesson ${id}`,
    status: 'NOT_STARTED' as const,
    sortOrder: 0,
    percentComplete: 0,
    dueDate: null,
    estimatedMinutes: null,
    thumbnailUrl: null,
    segments: [],
    checkpoints: [],
    completedCheckpointIds: [],
    badgeRequirements: [{ badgeId, badgeName: `Badge ${badgeId}`, badgeSlug: badgeId }],
    ...overrides,
  });

  type BadgeFixture = ReturnType<typeof makeBadge>;

  const emptyBuckets = (): Record<
    'completed' | 'readyForAssessment' | 'inReview' | 'learning' | 'locked' | 'notStarted',
    BadgeFixture[]
  > => ({
    completed: [],
    readyForAssessment: [],
    inReview: [],
    learning: [],
    locked: [],
    notStarted: [],
  });

  const buildData = (opts: {
    catalog: ReturnType<typeof makeLesson>[];
    badges: Partial<ReturnType<typeof emptyBuckets>>;
    contacts?: Array<{ id: string; type: string; name: string; email: string }>;
    description?: string;
  }) => ({
    data: {
      student: { name: 'Student Demo', email: 'student@example.edu' },
      course: {
        id: 'course-2',
        code: 'CH101',
        section: '1',
        title: 'Intro Chem',
        description: opts.description ?? '',
        contacts: opts.contacts ?? [],
      },
      lessons: { catalog: opts.catalog, upNext: [], inProgress: [], completed: [] },
      badges: { ...emptyBuckets(), ...opts.badges },
      surveys: { pendingBadge: [] },
    },
    isLoading: false,
    refresh: jest.fn(),
  });

  const completedBadgeLesson = (badgeId: string) =>
    makeLesson(badgeId, badgeId, {
      title: `Lesson ${badgeId}`,
      status: 'COMPLETED' as const,
      percentComplete: 100,
    });

  it('always shows the Overview (not a tab) with course info and progress', async () => {
    mockUseStudentData.mockReturnValue(
      buildData({
        // One completed lesson, one still to do → lesson progress 1/2 (distinct from badges 1/1).
        catalog: [makeLesson('a', 'b1', { status: 'COMPLETED' }), makeLesson('b', 'b1')],
        badges: { completed: [makeBadge('b1', 'COMPLETED')] },
        description: 'A friendly intro course.',
        contacts: [{ id: 'c1', type: 'instructor', name: 'Dr. Bunsen', email: 'bunsen@example.edu' }],
      })
    );

    render(<CourseDashboardPage />);

    // Overview is always present as course-level content, never a selectable tab.
    expect(await screen.findByText('A friendly intro course.')).toBeInTheDocument();
    expect(screen.getByText('Dr. Bunsen')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument();
    // Progress stats: 1 of 1 badges completed, 1 of 2 lessons completed.
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    // The first (and only) badge tab is selected by default.
    expect(screen.getByRole('tab', { name: 'Badge b1' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects the first badge by default and hides other badges lessons until selected', async () => {
    mockUseStudentData.mockReturnValue(
      buildData({
        // b1 sorts first (lesson a, sortOrder 0; name tiebreak). b2 is the non-default tab.
        catalog: [makeLesson('a', 'b1'), makeLesson('b', 'b2', { sortOrder: 1 })],
        badges: { learning: [makeBadge('b1', 'LEARNING'), makeBadge('b2', 'LEARNING')] },
      })
    );

    render(<CourseDashboardPage />);

    // Default badge (b1) lesson is visible; the other badge's lesson is not.
    expect(await screen.findByText('Lesson a')).toBeInTheDocument();
    expect(screen.queryByText('Lesson b')).not.toBeInTheDocument();

    // Selecting the second badge swaps in its lessons.
    fireEvent.click(screen.getByRole('tab', { name: 'Badge b2' }));

    const panel = screen.getByRole('heading', { name: 'Badge b2' }).closest('section') as HTMLElement;
    expect(within(panel).getByText('Lesson b')).toBeInTheDocument();
    expect(within(panel).getByText('In progress')).toBeInTheDocument();
    expect(screen.queryByText('Lesson a')).not.toBeInTheDocument();
  });

  it('uses the badge requirement video for the card image when the lesson has no segment video', async () => {
    // Badge videos live on badgeRequirements[].youtubeUrl, not on a segment (bug #14).
    // A badge-only lesson must resolve to the YouTube thumbnail, not the ChemSkills dummy.
    mockUseStudentData.mockReturnValue(
      buildData({
        catalog: [
          makeLesson('safety', 'b1', {
            title: 'Lab Safety Basics',
            badgeRequirements: [
              { badgeId: 'b1', badgeName: 'Badge b1', badgeSlug: 'b1', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' },
            ],
          }),
        ],
        badges: { learning: [makeBadge('b1', 'LEARNING')] },
      })
    );

    render(<CourseDashboardPage />);

    // The single badge is auto-selected, so its lesson card is already visible.
    const img = await screen.findByAltText('Lesson preview');
    expect(img.getAttribute('src')).toContain('dQw4w9WgXcQ');
    expect(img.getAttribute('src')).not.toContain('ChemSkills');
  });

  // A completed badge lesson's "Review" points at the badge feedback page once the
  // badge has an assessment outcome — whether the student passed (badge COMPLETED)
  // or failed the in-person assessment (badge IN_REVIEW/LOCKED). A badge merely
  // awaiting assessment (READY_FOR_ASSESSMENT) has no feedback yet, so its lesson
  // card keeps linking to the lesson preview.
  it.each([
    ['passed the assessment (badge COMPLETED)', 'COMPLETED' as const, 'completed'],
    ['failed the assessment (badge IN_REVIEW)', 'IN_REVIEW' as const, 'inReview'],
    ['failed terminally (badge LOCKED)', 'LOCKED' as const, 'locked'],
  ])('routes a completed badge lesson to the feedback page when the student %s', async (_label, status, bucket) => {
    const badgeId = 'assessed-badge';
    mockUseStudentData.mockReturnValue(
      buildData({
        catalog: [completedBadgeLesson(badgeId)],
        badges: { [bucket]: [makeBadge(badgeId, status)] },
      })
    );

    render(<CourseDashboardPage />);

    // The single badge is auto-selected, so its completed lesson's Review link is visible.
    const review = await screen.findByRole('link', { name: 'Review' });
    expect(review.getAttribute('href')).toBe(`/badges/${badgeId}/feedback?courseId=course-2`);
  });

  it('keeps a completed badge lesson on the lesson preview while its badge only awaits assessment', async () => {
    const badgeId = 'pending-badge';
    mockUseStudentData.mockReturnValue(
      buildData({
        catalog: [completedBadgeLesson(badgeId)],
        // READY_FOR_ASSESSMENT badges are not in the assessed buckets.
        badges: { readyForAssessment: [makeBadge(badgeId, 'READY_FOR_ASSESSMENT')] },
      })
    );

    render(<CourseDashboardPage />);

    // The single badge is auto-selected, so its completed lesson's Review link is visible.
    const review = await screen.findByRole('link', { name: 'Review' });
    expect(review.getAttribute('href')).toBe(`/lessons/${badgeId}-lesson?courseId=course-2`);
  });

  it('shows a "Show code" button on a ready-for-assessment badge that opens the code modal', async () => {
    const badgeId = 'assess-badge';
    mockUseStudentData.mockReturnValue(
      buildData({
        catalog: [makeLesson('a', badgeId, { status: 'COMPLETED' })],
        badges: { readyForAssessment: [makeBadge(badgeId, 'READY_FOR_ASSESSMENT')] },
      })
    );

    render(<CourseDashboardPage />);

    const showCode = await screen.findByRole('button', { name: 'Show code' });
    expect(screen.queryByTestId('assessment-code-modal')).not.toBeInTheDocument();

    fireEvent.click(showCode);

    expect(screen.getByTestId('assessment-code-modal')).toBeInTheDocument();
    expect(screen.getByText(`Code for Badge ${badgeId}`)).toBeInTheDocument();
  });

  it('does not show the "Show code" button for a badge that is not ready for assessment', async () => {
    mockUseStudentData.mockReturnValue(
      buildData({
        catalog: [completedBadgeLesson('done-badge')],
        badges: { completed: [makeBadge('done-badge', 'COMPLETED')] },
      })
    );

    render(<CourseDashboardPage />);

    await screen.findByRole('tab', { name: 'Badge done-badge' });
    expect(screen.queryByRole('button', { name: 'Show code' })).not.toBeInTheDocument();
  });
});
