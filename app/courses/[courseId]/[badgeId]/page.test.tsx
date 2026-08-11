import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import CourseBadgeProgress from './page';

const mockReplace = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockFetch = jest.fn();

let mockParams: Record<string, string> = { courseId: 'course-1', badgeId: 'badge-1' };

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useParams: () => mockParams,
  usePathname: () => '/courses/course-1/badge-1',
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
}));

function createClerkState(overrides = {}) {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: 'Professor Demo',
      primaryEmailAddress: { emailAddress: 'prof@example.edu' },
    },
    ...overrides,
  };
}

function badgeDetailPayload() {
  return {
    viewerRole: 'INSTRUCTOR',
    course: {
      id: 'course-1',
      title: 'Chemistry 101',
      createdBy: {
        id: 'instructor-1',
        name: 'Professor Demo',
        email: 'prof@example.edu',
        externalId: null,
      },
    },
    badge: {
      id: 'badge-1',
      slug: 'bunsen-burner',
      name: 'Bunsen Burner Badge',
      description: 'Burner safety and setup.',
      lesson: {
        id: 'lesson-1',
        title: 'Bunsen Burner Badge',
        sortOrder: 0,
      },
    },
    summary: {
      totalStudents: 3,
      completedCount: 1,
      inProgressCount: 1,
      notStartedCount: 1,
      readyForAssessmentCount: 1,
      inReviewCount: 0,
      lockedCount: 0,
      completedPercent: 33,
      inProgressPercent: 33,
      notStartedPercent: 33,
      readyForAssessmentPercent: 33,
      inReviewPercent: 0,
      lockedPercent: 0,
      averageScore: 92,
    },
    cohorts: {
      totalStudents: 8,
      proficient: { count: 2, percent: 25 },
      stillLearning: {
        count: 4,
        percent: 50,
        lockedCount: 1,
        stages: {
          videoIncomplete: { count: 1, percent: 13 },
          videoComplete: { count: 1, percent: 13 },
          attemptFailed: { count: 1, percent: 13 },
          awaitingAward: { count: 1, percent: 13 },
        },
      },
      notStarted: { count: 2, percent: 25 },
    },
    ratings: {
      badge: { count: 4, average: 4.3, distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 } },
      qev: {
        overall: { count: 6, average: 3.5, distribution: { 1: 1, 2: 0, 3: 2, 4: 2, 5: 1 } },
        lessons: [
          {
            lessonId: 'lesson-1',
            title: 'Bunsen Burner Lesson',
            count: 4,
            average: 3.8,
            distribution: { 1: 0, 2: 0, 3: 2, 4: 1, 5: 1 },
          },
          {
            lessonId: 'lesson-2',
            title: 'Flame Safety Lesson',
            count: 2,
            average: 3,
            distribution: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 0 },
          },
        ],
      },
    },
    assessment: {
      displayText: 'Use the burner safely.',
      videoTitle: 'Bunsen Burner Lesson',
      youtubeUrl: 'https://www.youtube.com/watch?v=abc123def45',
      videoLength: '00:20:00',
      rubricItems: [{ number: 1, text: 'Use the burner safely.' }],
      gradingCriteria: [{ number: 1, criterion: 'Technique', options: ['Needs support', 'Ready'] }],
      checkpoints: [
        {
          number: 1,
          title: 'Checkpoint',
          question: 'What should students check first?',
          questionText: '3 questions',
          points: 5,
          time: '00:01:00',
          segmentLabel: 'Segment 1 Starts 00:00:00',
        },
      ],
    },
    students: [
      {
        enrollmentId: 'enrollment-1',
        sections: ['A'],
        student: {
          id: 'student-1',
          name: 'Student One',
          email: 'student1@example.edu',
          externalId: 'U1',
        },
        progress: {
          id: 'progress-1',
          badgeId: 'badge-1',
          status: 'COMPLETED',
          awardedAt: '2026-01-04T00:00:00.000Z',
          score: 92,
          updatedAt: '2026-01-04T00:00:00.000Z',
        },
        status: 'COMPLETED',
        cohort: 'PROFICIENT',
        stage: null,
        locked: false,
      },
      {
        enrollmentId: 'enrollment-2',
        sections: ['B'],
        student: {
          id: 'student-2',
          name: 'Student Two',
          email: 'student2@example.edu',
          externalId: 'U2',
        },
        progress: null,
        status: 'NOT_STARTED',
        cohort: 'NOT_STARTED',
        stage: null,
        locked: false,
      },
    ],
  };
}

describe('Course badge progress page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { courseId: 'course-1', badgeId: 'badge-1' };
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue({ signOut: jest.fn() });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('renders badge progress, assessment details, and student rows', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => badgeDetailPayload(),
    });

    render(<CourseBadgeProgress />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/badge-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(await screen.findByRole('heading', { name: 'Bunsen Burner Badge' })).toBeInTheDocument();
    expect(screen.getByText('Burner safety and setup.')).toBeInTheDocument();

    // Three-cohort overview: headline counts with their share of the class.
    expect(screen.getByRole('heading', { name: 'Proficient' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Still Learning' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Not Started' })).toBeInTheDocument();
    expect(screen.getAllByText('25%')).toHaveLength(2);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('8 students enrolled')).toBeInTheDocument();

    // The still-learning detail is collapsed until asked for.
    const toggle = screen.getByRole('button', { name: 'Show breakdown' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Assessed in person, haven’t passed yet').closest('[hidden]')).not.toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide breakdown' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Started the video, haven’t finished it')).toBeInTheDocument();
    expect(screen.getByText('Finished the video lesson, not yet assessed')).toBeInTheDocument();
    expect(screen.getByText('Passed in person, badge not awarded yet')).toBeInTheDocument();
    expect(screen.getAllByText('1 student')).toHaveLength(4);
    expect(screen.getAllByText('13%')).toHaveLength(4);
    expect(
      screen.getByText(/1 student used every reassessment attempt and cannot retry without instructor action\./)
    ).toBeInTheDocument();

    expect(screen.getByText('3 questions')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint')).toBeInTheDocument();
    expect(screen.getByText('# of Checkpoints: 1')).toBeInTheDocument();
    // The lesson title also appears in the per-lesson rating list, so scope this
    // to the assessment section's video meta.
    const assessmentSection = screen.getByRole('region', { name: 'Assessment details' });
    expect(within(assessmentSection).getByText('Bunsen Burner Lesson')).toBeInTheDocument();
    expect(screen.getByTitle('Bunsen Burner Lesson')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/abc123def45'
    );
    expect(screen.getByText('Length:')).toBeInTheDocument();
    expect(screen.getByText('00:20:00')).toBeInTheDocument();
  });

  it('opens the badge roster from the progress card', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => badgeDetailPayload() });

    render(<CourseBadgeProgress />);

    const openRoster = await screen.findByRole('button', { name: 'View roster' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(openRoster);

    const roster = screen.getByRole('dialog', { name: 'Roster for Bunsen Burner Badge' });
    expect(within(roster).getByRole('link', { name: /Student One/ })).toHaveAttribute(
      'href',
      '/roster/student-1?courseId=course-1&badgeId=badge-1'
    );
    expect(within(roster).getByText('Proficient')).toBeInTheDocument();
    expect(within(roster).getByText('Not Started')).toBeInTheDocument();
    expect(within(roster).getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('shows the QEV and badge rating aggregates', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => badgeDetailPayload() });

    render(<CourseBadgeProgress />);

    const ratings = await screen.findByRole('region', { name: 'Ratings' });

    const qev = within(ratings).getByRole('heading', { name: 'QEV rating' }).closest('article') as HTMLElement;
    expect(within(qev).getByText('3.5')).toBeInTheDocument();
    expect(within(qev).getByText('6 responses')).toBeInTheDocument();
    expect(within(qev).getByText('Across all 2 lessons this badge requires')).toBeInTheDocument();

    const badge = within(ratings).getByRole('heading', { name: 'Badge rating' }).closest('article') as HTMLElement;
    expect(within(badge).getByText('4.3')).toBeInTheDocument();
    expect(within(badge).getByText('4 responses')).toBeInTheDocument();

    // Per-lesson detail is collapsed until asked for.
    const toggle = within(qev).getByRole('button', { name: 'Show per-lesson ratings' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(within(qev).getByText('Flame Safety Lesson')).toBeInTheDocument();
    expect(within(qev).getByText('3.8')).toBeInTheDocument();
    expect(within(qev).getByText('2 responses')).toBeInTheDocument();
  });

  it('says so when a badge has no ratings yet', async () => {
    const payload = badgeDetailPayload();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...payload,
        ratings: {
          badge: { count: 0, average: null, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
          qev: {
            overall: { count: 0, average: null, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
            lessons: [],
          },
        },
      }),
    });

    render(<CourseBadgeProgress />);

    const ratings = await screen.findByRole('region', { name: 'Ratings' });
    expect(within(ratings).getAllByText('No ratings yet.')).toHaveLength(2);
  });

  it('hides the roster button from checkers', async () => {
    const payload = badgeDetailPayload();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, viewerRole: 'CHECKER' }) });

    render(<CourseBadgeProgress />);

    await screen.findByRole('heading', { name: 'Bunsen Burner Badge' });
    expect(screen.queryByRole('button', { name: 'View roster' })).not.toBeInTheDocument();
  });
});
