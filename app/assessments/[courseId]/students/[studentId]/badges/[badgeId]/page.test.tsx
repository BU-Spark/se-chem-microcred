import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AssessmentReadinessPage from './page';

const mockReplace = jest.fn();
const mockUseParams = jest.fn();
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockFetch = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useParams: () => mockUseParams(),
  usePathname: () => mockUsePathname(),
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt} />,
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
      criteria: [
        {
          id: 'criterion-1',
          criterionKey: 'criterion-1',
          criterion: 'Adjust the burner to get a tight and blue flame.',
          options: ['Did adjust the flame properly', 'Attempted but did not succeed'],
          sortOrder: 0,
        },
      ],
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

    expect(screen.getByRole('heading', { name: 'Assessor Grading' })).toBeInTheDocument();
    expect(screen.getByText('Adjust the burner to get a tight and blue flame.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Overall feedback'), {
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

    expect(await screen.findByText('Assessment recorded. Badge is ready for finalization.')).toBeInTheDocument();
  });
});
