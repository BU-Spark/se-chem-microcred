import { render, screen, waitFor } from '@testing-library/react';

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
      json: async () => ({
        course: {
          id: 'course-1',
          title: 'Chemistry 101',
          createdBy: {
            id: 'instructor-1',
            name: 'Professor Demo',
            email: 'prof@example.edu',
            buid: null,
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
          readyForFinalizationCount: 0,
          completedPercent: 33,
          inProgressPercent: 33,
          notStartedPercent: 33,
          readyForAssessmentPercent: 33,
          readyForFinalizationPercent: 0,
          averageScore: 92,
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
              buid: 'U1',
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
          },
          {
            enrollmentId: 'enrollment-2',
            sections: ['B'],
            student: {
              id: 'student-2',
              name: 'Student Two',
              email: 'student2@example.edu',
              buid: 'U2',
            },
            progress: null,
            status: 'NOT_STARTED',
          },
        ],
      }),
    });

    render(<CourseBadgeProgress />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/badge-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(await screen.findByRole('heading', { name: 'Bunsen Burner Badge' })).toBeInTheDocument();
    expect(screen.getByText('Burner safety and setup.')).toBeInTheDocument();
    expect(screen.getAllByText('33%').length).toBeGreaterThan(0);
    expect(screen.getByText('Average assessment score')).toBeInTheDocument();
    expect(screen.getByText('Ready for assessment')).toBeInTheDocument();
    expect(screen.getByText('Got checkd on their first try')).toBeInTheDocument();
    expect(screen.getByText('Students who have completed this badge')).toBeInTheDocument();
    expect(screen.getByText('3 questions')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint')).toBeInTheDocument();
    expect(screen.getByText('# of Checkpoints: 1')).toBeInTheDocument();
    expect(screen.getByText('Bunsen Burner Lesson')).toBeInTheDocument();
    expect(screen.getByTitle('Bunsen Burner Lesson')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/abc123def45'
    );
    expect(screen.getByText('Length:')).toBeInTheDocument();
    expect(screen.getByText('00:20:00')).toBeInTheDocument();
  });
});
