import { render, screen, waitFor } from '@testing-library/react';

import BadgeFeedbackPage from './page';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUsePathname = jest.fn(() => '/badges/learning-badge/feedback');
const mockSearchParams = jest.fn(() => new URLSearchParams('courseId=course-1'));

jest.mock('next/navigation', () => ({
  useParams: () => ({ badgeSlug: 'learning-badge' }),
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockSearchParams(),
}));

const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
  useClerk: () => ({ openUserProfile: jest.fn() }),
}));

const mockUseStudentData = jest.fn();
jest.mock('../../../hooks/useStudentData', () => ({
  useStudentData: (...args: unknown[]) => mockUseStudentData(...args),
}));

type MockImageProps = {
  src: string | { src: string };
  alt: string;
} & Record<string, unknown>;

jest.mock('next/image', () => {
  const MockNextImage = (props: MockImageProps) => {
    const { src, alt, priority, ...rest } = props;
    void priority;
    const resolvedSrc = typeof src === 'string' ? src : src?.src || '';
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolvedSrc} alt={alt} {...rest} />;
  };
  MockNextImage.displayName = 'MockNextImage';
  return MockNextImage;
});

function studentData() {
  return {
    student: {
      id: 'student-1',
      name: 'Student Demo',
      email: 'student@example.edu',
    },
    badges: {
      learning: [
        {
          id: 'badge-1',
          courseId: 'course-1',
          slug: 'learning-badge',
          name: 'Learning Badge',
          description: 'Needs feedback review',
          status: 'LEARNING' as const,
          awardedAt: null,
          score: 40,
          requirements: [{ summary: null, lessonSlug: 'lesson-1', lessonTitle: 'Lesson 1' }],
        },
      ],
      readyForAssessment: [],
      readyForFinalization: [],
      completed: [],
    },
  };
}

describe('Badge feedback page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        fullName: 'Student Demo',
        primaryEmailAddress: { emailAddress: 'student@example.edu' },
      },
    });
    mockUseAuth.mockReturnValue({ signOut: jest.fn() });
    mockUseStudentData.mockReturnValue({ data: studentData(), isLoading: false, error: null, refresh: jest.fn() });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          badge: {
            id: 'badge-1',
            slug: 'learning-badge',
            name: 'Learning Badge',
            description: 'Needs feedback review',
            status: 'LEARNING',
            score: 40,
            awardedAt: null,
          },
          rubric: {
            goalId: 'goal-1',
            goalName: 'Operate safely',
            totalPoints: 5,
            passThreshold: 4,
            subgoals: [{ id: 'subgoal-1', text: 'Wear PPE', points: 2, sortOrder: 0 }],
          },
          latestAttempt: {
            id: 'attempt-1',
            passed: false,
            score: 40,
            pointsEarned: 2,
            pointsPossible: 5,
            feedback: 'Assessor override: unsafe flame control.',
            completedAt: '2026-07-02T12:00:00.000Z',
            assessorName: 'Assessor Demo',
            responses: [
              {
                id: 'response-1',
                subgoalText: 'Wear PPE',
                points: 2,
                passed: false,
                feedback: 'Goggles were missing.',
                isOverride: false,
                sortOrder: 0,
              },
              {
                id: 'response-override',
                subgoalText: 'Assessor override',
                points: 0,
                passed: false,
                feedback: 'Assessor override: unsafe flame control.',
                isOverride: true,
                sortOrder: 1,
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'READY_FOR_ASSESSMENT' }),
      }) as unknown as typeof fetch;
  });

  it('renders assessor rubric feedback read-only and acknowledges failed feedback review', async () => {
    render(<BadgeFeedbackPage />);

    expect(await screen.findByRole('heading', { name: 'Assessment Rubric' })).toBeInTheDocument();
    expect(await screen.findByText('Operate safely')).toBeInTheDocument();
    expect(screen.getByText('Wear PPE')).toBeInTheDocument();
    expect(screen.getByText('Goggles were missing.')).toBeInTheDocument();
    expect(screen.getByText('Assessor override')).toBeInTheDocument();
    expect(screen.getByText('Assessor override: unsafe flame control.')).toBeInTheDocument();
    expect(document.querySelector('.badgeCard')).not.toHaveTextContent('Assessor override: unsafe flame control.');
    expect(screen.getAllByText('Needs work')).toHaveLength(2);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review Lesson/i })).toHaveAttribute(
      'href',
      '/lessons/lesson-1?courseId=course-1'
    );
    expect(mockUseStudentData).toHaveBeenCalledWith('student@example.edu', 'course-1');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/badges/badge-1/feedback', { method: 'POST' });
    });
    expect(await screen.findByText(/ready for reassessment/i)).toBeInTheDocument();
  });
});
