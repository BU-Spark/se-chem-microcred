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
        subgoals: [
          {
            id: 'subgoal-1',
            text: 'Adjust the burner to get a tight and blue flame.',
            passThreshold: 3,
            sortOrder: 0,
            tasks: [{ id: 'task-1', text: 'Produce a tight blue flame', points: 3, sortOrder: 0 }],
          },
          {
            id: 'subgoal-2',
            text: 'Shut the burner down safely.',
            passThreshold: 2,
            sortOrder: 1,
            tasks: [{ id: 'task-2', text: 'Close the gas valve', points: 2, sortOrder: 0 }],
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
            status: 'IN_REVIEW',
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

    // Tasks default to red/failed.
    expect(screen.getByRole('switch', { name: 'Task 1.1 failed' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Task 2.1 failed' })).toBeInTheDocument();

    // Pass both subgoals' tasks so every subgoal meets its threshold.
    fireEvent.click(screen.getByRole('switch', { name: 'Task 1.1 failed' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Task 2.1 failed' }));
    expect(screen.getByRole('switch', { name: 'Task 1.1 passed' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Task 2.1 passed' })).toBeInTheDocument();

    // Advance to the confirmation step, which shows the pass outcome.
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    expect(
      screen.getByText(/This student has passed the assessment and will be placed into ready to be finalized/)
    ).toBeInTheDocument();

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
      tasks: [
        { taskId: 'task-1', passed: true, feedback: '' },
        { taskId: 'task-2', passed: true, feedback: '' },
      ],
      override: null,
    });

    expect(await screen.findByText('Assessment recorded. Badge is ready for finalization.')).toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/courses/course-1?view=assessor');
  });

  it('downgrades a passing student to still learning with override feedback', async () => {
    mockFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            attempt: { id: 'attempt-1', passed: false, score: 100, completedAt: null },
            status: 'LEARNING',
          }),
        };
      }

      if (url === '/api/courses/course-1/students/student-1?email=prof%40example.edu') {
        return { ok: true, json: async () => createProfilePayload() };
      }

      if (url === '/api/courses/course-1/students/student-1/badges/badge-1?email=prof%40example.edu') {
        return { ok: true, json: async () => createBadgePayload() };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AssessmentReadinessPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and Start' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Task 1.1 failed' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Task 2.1 failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));

    // A note in the override field downgrades the passing student to still learning.
    fireEvent.change(screen.getByLabelText('Override to still learning (optional)'), {
      target: { value: 'Unsafe technique observed after the fact.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Assessment' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/courses/course-1/students/student-1/badges/badge-1?email=prof%40example.edu',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const postCall = mockFetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    const postBody = JSON.parse((postCall?.[1] as RequestInit).body as string);
    expect(postBody).toEqual({
      tasks: [
        { taskId: 'task-1', passed: true, feedback: '' },
        { taskId: 'task-2', passed: true, feedback: '' },
      ],
      override: { feedback: 'Unsafe technique observed after the fact.' },
    });
  });

  it('shows the fail outcome when a subgoal misses its threshold', async () => {
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
    // Pass only the first subgoal; the second misses its threshold, so the badge fails.
    fireEvent.click(screen.getByRole('switch', { name: 'Task 1.1 failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));

    expect(
      screen.getByText('This student has failed the assessment and will be placed into still learning.')
    ).toBeInTheDocument();
    // The override field is only offered when the student is passing.
    expect(screen.queryByLabelText('Override to still learning (optional)')).not.toBeInTheDocument();
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
              status: 'IN_REVIEW',
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
