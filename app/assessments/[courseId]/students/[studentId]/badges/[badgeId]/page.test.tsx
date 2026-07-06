import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AssessmentReadinessPage from './page';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseParams = jest.fn();
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockFetch = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
  useParams: () => mockUseParams(),
  usePathname: () => mockUsePathname(),
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt} />;
  },
}));

function createProfilePayload() {
  return {
    memberRole: 'STUDENT',
    member: {
      id: 'student-1',
      name: 'Ada Lovelace',
      email: 'ada@bu.edu',
      buid: 'U11111111',
      createdAt: '2026-03-20T15:30:00.000Z',
      avatar: null,
    },
    course: {
      id: 'course-1',
      title: 'Chem101',
      sections: ['K1'],
      createdBy: {
        id: 'prof-1',
        name: 'Professor Demo',
        email: 'prof@example.edu',
        buid: 'P111',
      },
    },
    contacts: [],
  };
}

function createBadgePayload() {
  return {
    badge: {
      id: 'badge-1',
      name: 'Bunsen Burner Badge',
      description: null,
      status: 'READY_FOR_ASSESSMENT',
    },
    progress: {
      percentComplete: 100,
      precheckComplete: true,
      assessmentComplete: false,
      currentCheckpoint: null,
      totalCheckpoints: 2,
      completedCheckpoints: 2,
    },
    assessment: {
      rubric: {
        goalId: 'goal-1',
        goalName: 'Safe burner operation',
        totalPoints: 5,
        passThreshold: 3,
        subgoals: [
          {
            id: 'subgoal-1',
            text: 'Adjust the burner to get a tight and blue flame.',
            points: 3,
            sortOrder: 0,
          },
          {
            id: 'subgoal-2',
            text: 'Shut the burner down safely.',
            points: 2,
            sortOrder: 1,
          },
        ],
      },
    },
  };
}

describe('Assessment readiness page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ courseId: 'course-1', studentId: 'student-1', badgeId: 'badge-1' });
    mockUsePathname.mockReturnValue('/assessments/course-1/students/student-1/badges/badge-1');
    mockUseUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        fullName: 'Professor Demo',
        primaryEmailAddress: { emailAddress: 'prof@example.edu' },
      },
    });
    mockUseAuth.mockReturnValue({ signOut: jest.fn() });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('starts and submits an assessment attempt', async () => {
    mockFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            attempt: {
              id: 'attempt-1',
              passed: true,
              score: 100,
              completedAt: '2026-06-24T20:00:00.000Z',
            },
            status: 'READY_FOR_FINALIZATION',
          }),
        };
      }

      if (url === '/api/courses/course-1/students/student-1?email=prof%40example.edu') {
        return {
          ok: true,
          json: async () => createProfilePayload(),
        };
      }

      if (url === '/api/courses/course-1/students/student-1/badges/badge-1?email=prof%40example.edu') {
        return {
          ok: true,
          json: async () => createBadgePayload(),
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AssessmentReadinessPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and Start' }));

    expect(screen.getByRole('heading', { name: 'Safe burner operation' })).toBeInTheDocument();
    expect(screen.getByText(/Adjust the burner to get a tight and blue flame\./)).toBeInTheDocument();

    // Sliders default to red/failed: 0 of 5 points, below the threshold of 3.
    expect(screen.getByText('0 / 5')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Subgoal 1 failed' })).toBeInTheDocument();

    // Passing the 3-point subgoal reaches the threshold and the live score updates.
    fireEvent.click(screen.getByRole('switch', { name: 'Subgoal 1 failed' }));
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Subgoal 1 passed' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Assessor override'), {
      target: { value: 'Student demonstrated safe burner operation.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/courses/course-1/students/student-1/badges/badge-1?email=prof%40example.edu',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    const postCall = mockFetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    const postBody = JSON.parse((postCall?.[1] as RequestInit).body as string);
    expect(postBody).toEqual({
      passed: true,
      subgoals: [
        { subgoalId: 'subgoal-1', passed: true, feedback: '' },
        { subgoalId: 'subgoal-2', passed: false, feedback: '' },
      ],
      override: { feedback: 'Student demonstrated safe burner operation.' },
    });

    expect(await screen.findByText('Assessment recorded. Badge is ready for finalization.')).toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/courses/course-1?view=assessor');
  });

  it('blocks flipping the suggested outcome without override feedback', async () => {
    mockFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === '/api/courses/course-1/students/student-1?email=prof%40example.edu') {
        return { ok: true, json: async () => createProfilePayload() } as Response;
      }

      if (url === '/api/courses/course-1/students/student-1/badges/badge-1?email=prof%40example.edu') {
        return { ok: true, json: async () => createBadgePayload() } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AssessmentReadinessPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and Start' }));

    // 0 / 5 points suggests "Needs reassessment"; pinning Pass without an
    // override justification must be rejected client-side.
    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));

    expect(
      await screen.findByText(
        'You are overriding the score-suggested outcome — describe what you observed in the assessor override field.'
      )
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/courses/course-1/students/student-1/badges/badge-1?email=prof%40example.edu',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('disables the assessment action once the badge has already been assessed', async () => {
    mockFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === '/api/courses/course-1/students/student-1?email=prof%40example.edu') {
        return {
          ok: true,
          json: async () => createProfilePayload(),
        } as Response;
      }

      if (url === '/api/courses/course-1/students/student-1/badges/badge-1?email=prof%40example.edu') {
        return {
          ok: true,
          json: async () => ({
            ...createBadgePayload(),
            badge: {
              ...createBadgePayload().badge,
              status: 'READY_FOR_FINALIZATION',
            },
            progress: {
              ...createBadgePayload().progress,
              assessmentComplete: true,
            },
          }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AssessmentReadinessPage />);

    const action = await screen.findByRole('button', { name: 'Assessment complete' });
    expect(action).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Safe burner operation' })).not.toBeInTheDocument();
  });
});
