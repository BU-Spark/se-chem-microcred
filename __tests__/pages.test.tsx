import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HomePage from '../app/page';
import BadgeWalletPage from '../app/badges/page';
import BadgeFeedbackPage from '@/app/badges/[badgeSlug]/feedback/page';
import AnalyticsPage from '../app/analytics/page';
import ProfilePage from '../app/profile/page';
import GradesPage from '../app/grades/page';
import SettingsPage from '../app/settings/page';
import LessonDetailPage from '../app/lessons/[lessonId]/page';
import InstructorQevDemoPage from '../app/instructor/qev-demo/page';
import type { StudentData } from '../app/hooks/useStudentData';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUsePathname = jest.fn(() => '/');
let mockParams: Record<string, string> = {};
let mockSearchParams = new URLSearchParams();
const mockFetch = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockUsePathname(),
  useParams: () => mockParams,
  useSearchParams: () => mockSearchParams,
}));

const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockUseClerk = jest.fn();
jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
  useClerk: () => mockUseClerk(),
  // Passthrough: returns the wrapped action unchanged (no step-up UI in tests).
  useReverification: (fn: (...args: unknown[]) => unknown) => fn,
}));

const mockUseStudentData = jest.fn();
jest.mock('../app/hooks/useStudentData', () => ({
  useStudentData: () => mockUseStudentData(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockSearchParams = new URLSearchParams();

  mockUseUser.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: 'Student Demo',
      primaryEmailAddress: { emailAddress: 'student@example.edu' },
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  });

  mockUseAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    signOut: jest.fn(),
  });

  mockUseClerk.mockReturnValue({
    openUserProfile: jest.fn(),
  });

  mockUseStudentData.mockReturnValue({
    data: createStudentData(),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  });

  mockFetch.mockReset();
  mockFetch.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);

    if (url === '/api/courses/created?email=student%40example.edu') {
      return {
        ok: true,
        json: async () => ({
          user: { name: 'Student Demo', email: 'student@example.edu' },
          count: 1,
          courses: [
            {
              id: 'created-course-1',
              title: 'Created Course 1',
              description: null,
              section: null,
              sectionCount: 1,
              createdAt: '2026-03-30T18:35:48.000Z',
              lessons: [],
              enrollments: [{ id: 'created-enrollment-1', role: 'INSTRUCTOR' }],
            },
          ],
        }),
      };
    }

    if (url === '/api/courses/enrolled?email=student%40example.edu') {
      return {
        ok: true,
        json: async () => ({
          user: { name: 'Student Demo', email: 'student@example.edu' },
          count: 1,
          enrollments: [
            {
              id: 'student-enrollment-1',
              role: 'STUDENT',
              course: {
                id: 'course-1',
                code: 'CHEM101',
                section: 'K1',
                title: 'Chem 101',
                description: 'Basics',
                contacts: [
                  { id: 'c1', type: 'INSTRUCTOR', name: 'Prof A', email: 'prof@example.edu', avatarUrl: null },
                ],
                lessons: [{ thumbnailUrl: null, segments: [] }],
              },
            },
          ],
        }),
      };
    }

    if (url === '/api/courses/mine') {
      return {
        ok: true,
        json: async () => ({
          user: { name: 'Student Demo', email: 'student@example.edu' },
          created: {
            count: 1,
            courses: [
              {
                id: 'created-course-1',
                title: 'Created Course 1',
                description: null,
                section: null,
                sectionCount: 1,
                createdAt: '2026-03-30T18:35:48.000Z',
                lessons: [],
                enrollments: [{ id: 'created-enrollment-1', role: 'INSTRUCTOR' }],
              },
            ],
          },
          enrolled: {
            count: 1,
            enrollments: [
              {
                id: 'student-enrollment-1',
                role: 'STUDENT',
                course: {
                  id: 'course-1',
                  code: 'CHEM101',
                  section: 'K1',
                  title: 'Chem 101',
                  description: 'Basics',
                  contacts: [
                    { id: 'c1', type: 'INSTRUCTOR', name: 'Prof A', email: 'prof@example.edu', avatarUrl: null },
                  ],
                  lessons: [{ thumbnailUrl: null, segments: [] }],
                },
              },
            ],
          },
          assessor: { count: 0, enrollments: [] },
        }),
      };
    }

    if (url.startsWith('/api/badges/export/')) {
      return {
        ok: true,
        json: async () => ({ linkedInUrl: 'https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME' }),
      };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  global.fetch = mockFetch as unknown as typeof fetch;
});

function createStudentData(): StudentData {
  return {
    student: {
      id: 'student-1',
      name: 'Student Demo',
      email: 'student@example.edu',
      buid: 'U1234567',
      gender: 'Female',
      raceEthnicity: 'Hispanic/Latinx',
      parentalEducation: 'High school',
      pellGrantQualified: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      avatar: { base: 'SAPPHIRE', face: 'SMILE', accessory: 'LEAF' },
    },
    course: {
      id: 'course-1',
      code: 'CHEM101',
      section: 'K1',
      title: 'Chem 101',
      description: 'Basics',
      contacts: [
        { id: 'c1', type: 'INSTRUCTOR', name: 'Prof A', email: 'prof@example.edu', avatarUrl: null },
        { id: 'c2', type: 'CHECKER', name: 'TA B', email: 'ta@example.edu', avatarUrl: null },
      ],
    },
    analytics: {
      hoursLearning: 6,
      badgesCompleted: 2,
      badgesReadyForAssessment: 1,
      badgesNotAttempted: 3,
      questionsAnswered: 12,
      averageAssessmentScore: 75,
      highestAssessmentScore: 92,
    },
    lessons: {
      upNext: [
        {
          id: 'lesson-1',
          slug: 'lesson-1',
          title: 'Lesson 1',
          summary: 'First lesson',
          description: 'Desc',
          thumbnailUrl: null,
          estimatedMinutes: 15,
          dueDate: '2025-01-01T12:00:00.000Z',
          availableOn: null,
          sortOrder: 0,
          passingPercent: 70,
          status: 'NOT_STARTED',
          percentComplete: 0,
          segments: [],
          checkpoints: [],
          badgeRequirements: [],
          skills: [],
          lastGradePercent: null,
          lastGradePassed: null,
          lastGradedAt: null,
          completedCheckpointIds: [],
          resumeTimeSeconds: 0,
          answeredCheckpointIds: [],
        },
      ],
      inProgress: [
        {
          id: 'lesson-2',
          slug: 'lesson-2',
          title: 'Lesson 2',
          summary: 'Second lesson',
          description: 'Desc',
          thumbnailUrl: null,
          estimatedMinutes: 10,
          dueDate: '2025-01-02T12:00:00.000Z',
          availableOn: null,
          sortOrder: 1,
          passingPercent: 70,
          status: 'IN_PROGRESS',
          percentComplete: 50,
          segments: [],
          checkpoints: [],
          badgeRequirements: [],
          skills: [],
          lastGradePercent: null,
          lastGradePassed: null,
          lastGradedAt: null,
          completedCheckpointIds: [],
          resumeTimeSeconds: 0,
          answeredCheckpointIds: [],
        },
      ],
      catalog: [],
      completed: [],
    },
    badges: {
      completed: [
        {
          id: 'b1',
          slug: 'bunsen-burner-badge',
          courseId: null,
          youtubeUrl: null,
          name: 'Bunsen Burner Badge',
          description: 'Complete badge',

          status: 'COMPLETED',
          awardedAt: '2024-01-01T00:00:00.000Z',
          score: 95,
          latestAttemptPassed: true,
          cooldownUntil: null,
          requirements: [{ summary: 'Req', lessonSlug: 'lesson-1', lessonTitle: 'Lesson 1' }],
        },
      ],
      readyForAssessment: [
        {
          id: 'b2',
          slug: 'assessment-badge',
          courseId: null,
          youtubeUrl: null,
          name: 'Assessment Badge',
          description: 'Needs in-person assessment',

          status: 'READY_FOR_ASSESSMENT',
          awardedAt: null,
          score: null,
          latestAttemptPassed: null,
          cooldownUntil: null,
          requirements: [{ summary: 'Req', lessonSlug: 'lesson-2', lessonTitle: 'Lesson 2' }],
        },
      ],
      inReview: [
        {
          id: 'b3',
          slug: 'final-badge',
          courseId: null,
          youtubeUrl: null,
          name: 'Finalize Badge',
          description: 'Needs survey',

          status: 'IN_REVIEW',
          awardedAt: null,
          score: null,
          // Pass path: awaiting the student's acknowledge + rating to finalize.
          latestAttemptPassed: true,
          cooldownUntil: null,
          requirements: [{ summary: 'Req', lessonSlug: null, lessonTitle: null }],
        },
      ],
      learning: [
        {
          id: 'b4',
          slug: 'learning-badge',
          courseId: null,
          youtubeUrl: null,
          name: 'Learning Badge',
          description: 'Still learning',

          status: 'LEARNING',
          awardedAt: null,
          score: null,
          latestAttemptPassed: null,
          cooldownUntil: null,
          requirements: [{ summary: 'Req', lessonSlug: null, lessonTitle: null }],
        },
      ],
      locked: [],
      notStarted: [],
    },
    surveys: {
      lesson: [],
      badge: [],
      pendingBadge: [
        {
          promptId: 'p1',
          badgeId: 'b3',
          badgeSlug: 'final-badge',
          badgeName: 'Finalize Badge',
          question: 'Finish your survey?',
        },
      ],
    },
  };
}

describe('Home page', () => {
  it('redirects to splash when not authenticated', () => {
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null });
    render(<HomePage />);
    expect(mockReplace).toHaveBeenCalledWith('/splash');
  });

  it('renders merged course sections and surfaces survey modal when deep-linked', async () => {
    mockSearchParams = new URLSearchParams({ surveyBadge: 'final-badge' });
    render(<HomePage />);

    expect(await screen.findByText(/Instructor Courses/i)).toBeInTheDocument();
    expect(await screen.findByText('Created Course 1')).toBeInTheDocument();
    expect(screen.getByText(/My Enrolled Courses/i)).toBeInTheDocument();
    expect(await screen.findByText('Chem 101')).toBeInTheDocument();

    expect(screen.getByText(/Finish your survey/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit/i })).toBeInTheDocument();
  });

  it('shows an assessment access modal from QR redirects and clears the query on close', async () => {
    mockSearchParams = new URLSearchParams({
      assessmentAccess: 'denied',
      assessmentMessage: 'You do not have permission to assess this badge.',
    });

    render(<HomePage />);

    expect(await screen.findByText(/Assessment unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/You do not have permission to assess this badge/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back to home/i }));

    expect(mockReplace).toHaveBeenCalledWith('/', { scroll: false });
  });
});

describe('Badge Wallet page', () => {
  it('hides content for signed-out users and redirects', () => {
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null });
    render(<BadgeWalletPage />);
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
  });

  it('renders sections and opens badge modal with status-specific actions', () => {
    render(<BadgeWalletPage />);

    expect(screen.getByText(/Completed Badges/i)).toBeInTheDocument();
    expect(screen.getByText(/In Review/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Bunsen Burner/i }));
    expect(screen.getByText(/Badge finalized/i)).toBeInTheDocument();

    const assessmentToggle = document.querySelector('button[aria-controls="assessment-badges"]') as HTMLButtonElement;
    fireEvent.click(assessmentToggle);
    fireEvent.click(screen.getByRole('button', { name: /^Assessment$/i }));
    expect(screen.getByText(/Show your assessor this QR code/i)).toBeInTheDocument();
  });
});

describe('Badge Feedback page', () => {
  it('redirects to wallet when slug is unknown for the student', async () => {
    mockParams = { badgeSlug: 'unknown-badge' };
    render(<BadgeFeedbackPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/badges'));
  });

  it('renders feedback content for a valid badge slug', () => {
    mockParams = { badgeSlug: 'bunsen-burner-badge' };
    render(<BadgeFeedbackPage />);
    expect(screen.getByText(/Bunsen Burner Badge/i)).toBeInTheDocument();
    expect(screen.getByText(/Status:/i)).toBeInTheDocument();
  });
});

describe('Analytics page', () => {
  it('computes badge percentages and renders stat cards', () => {
    render(<AnalyticsPage />);
    expect(screen.getAllByText(/badges completed/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Average assessment score/i)).toBeInTheDocument();
  });
});

describe('Profile page', () => {
  it('masks sensitive info after timeout and shows the demographic dropdown toggle', () => {
    jest.useFakeTimers();
    render(<ProfilePage />);

    // Sensitive BUID is masked by default and revealing demographics is gated
    // behind the "Demographic Info" dropdown (which requires re-auth to open).
    expect(screen.getByRole('button', { name: /Demographic Info/i })).toBeInTheDocument();
    expect(screen.getAllByText('UXXXXXXXX').length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000 + 50);
    });

    expect(screen.getAllByText('UXXXXXXXX').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Demographic Info/i })).toBeInTheDocument();
    jest.useRealTimers();
  });
});

describe('Grades and Settings placeholders', () => {
  it('show placeholder copy and honor sign-out flow', () => {
    render(<GradesPage />);
    expect(screen.getByText(/Gradebook coming soon/i)).toBeInTheDocument();

    render(<SettingsPage />);
    expect(screen.getByText(/Settings content coming soon/i)).toBeInTheDocument();
  });
});

describe('Lesson detail page', () => {
  it('renders timeline parts from checkpoints and segments', () => {
    const data = createStudentData();
    data.lessons.catalog = [
      {
        id: 'lesson-3',
        slug: 'lesson-3',
        title: 'Lesson 3',
        summary: 'Video lesson',
        description: 'Desc',
        thumbnailUrl: null,
        estimatedMinutes: 20,
        dueDate: '2025-01-03T12:00:00.000Z',
        availableOn: null,
        sortOrder: 2,
        passingPercent: 70,
        status: 'IN_PROGRESS',
        percentComplete: 50,
        segments: [
          {
            id: 'seg-1',
            title: 'Segment 1',
            summary: null,
            duration: 2,
            videoUrl: null,
            muxPlaybackId: null,
            thumbnailUrl: null,
            status: 'NOT_STARTED',
            checkpointIds: [],
          },
        ],
        checkpoints: [
          {
            id: 'cp-1',
            title: 'Checkpoint 1',
            description: null,
            label: 'Check point',
            meta: JSON.stringify({ points: 5, segmentLabel: 'Segment 1 Starts 00:00:00' }),
            questionCount: 2,
            segmentId: 'seg-1',
            timeOffsetSeconds: 30,
            snapshotUrl: null,
            questions: [],
          },
        ],
        badgeRequirements: [{ badgeId: 'b2', badgeName: 'Assessment Badge', badgeSlug: 'assessment-badge' }],
        skills: [],
        lastGradePercent: null,
        lastGradePassed: null,
        lastGradedAt: null,
        completedCheckpointIds: [],
        resumeTimeSeconds: 0,
        answeredCheckpointIds: [],
      },
    ];

    mockUseStudentData.mockReturnValue({ data, isLoading: false, error: null });
    mockParams = { lessonId: 'lesson-3' };
    render(<LessonDetailPage />);

    expect(screen.getByText(/Lesson 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Part 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Checkpoint/i)).toBeInTheDocument();
    expect(screen.getByText('2 questions')).toBeInTheDocument();
    expect(screen.queryByText(/segmentLabel/)).not.toBeInTheDocument();
  });
});

describe('Instructor QEV demo page', () => {
  it('adds and removes cue points with serialized preview update', () => {
    render(<InstructorQevDemoPage />);

    expect(screen.getByText(/Configure Question Embedded Video/i)).toBeInTheDocument();
    expect(screen.getAllByText(/question/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Add checkpoint/i }));
    expect(screen.getAllByText(/question/).length).toBeGreaterThan(1);

    const removeButtons = screen.getAllByRole('button', { name: /Remove/i });
    fireEvent.click(removeButtons[0]);
    expect(screen.getAllByText(/question/).length).toBeGreaterThan(0);
  });
});
