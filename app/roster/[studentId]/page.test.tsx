import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import InstructorStudentProfilePage from './page';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockFetch = jest.fn();
const mockUseParams = jest.fn();

let mockSearchParams = new URLSearchParams('courseId=course-1');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockSearchParams,
  useParams: () => mockUseParams(),
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
}));

function createStudentProfilePayload() {
  return {
    memberRole: 'STUDENT',
    member: {
      id: 'student-1',
      name: 'Ada Lovelace',
      email: 'ada@bu.edu',
      buid: 'U11111111',
      gender: 'Woman',
      raceEthnicity: 'Not provided',
      parentalEducation: 'College graduate',
      pellGrantQualified: true,
      createdAt: '2026-03-20T15:30:00.000Z',
      avatar: {
        base: 'EMERALD',
        face: 'SMILE',
        accessory: null,
      },
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
    contacts: [
      {
        id: 'contact-1',
        type: 'CHECKER',
        name: 'Last Name, First Name',
        email: 'ta@bu.edu',
        avatarUrl: '/edit_avatar/amethyst.svg',
      },
    ],
    badges: {
      inProgress: [
        {
          id: 'badge-1',
          slug: 'waste-handling',
          name: 'Waste Handling',
          description: null,
          status: 'LEARNING',
          awardedAt: null,
          score: null,
        },
      ],
      notStarted: [
        {
          id: 'badge-2',
          slug: 'bunsen-burner',
          name: 'Bunsen Burners',
          description: null,
        },
      ],
      inReview: [] as Array<{
        id: string;
        slug: string;
        name: string;
        description: string | null;

        status: string;
        awardedAt: string | null;
        score: number | null;
      }>,
      completed: [
        {
          id: 'badge-3',
          slug: 'vent-hood',
          name: 'Vent Hood Safety',
          description: null,

          status: 'COMPLETED',
          awardedAt: '2026-03-22T10:00:00.000Z',
          score: 95,
        },
      ],
    },
  };
}

function createInProgressBadgeDetailPayload() {
  return {
    badge: {
      id: 'badge-1',
      slug: 'waste-handling',
      name: 'Waste Handling',
      description: null,

      status: 'LEARNING',
      awardedAt: null,
      score: null,
    },
    progress: {
      percentComplete: 70,
      precheckComplete: false,
      assessmentComplete: false,
      currentCheckpoint: 'Checkpoint 3',
      totalCheckpoints: 3,
      completedCheckpoints: 2,
    },
    checkpoints: [
      {
        id: 'checkpoint-1',
        title: 'Checkpoint 1',
        lessonTitle: 'Waste Handling Lesson',
        questions: [
          {
            id: 'question-1',
            title: 'Question 1',
            prompt: 'Which container should be used?',
            attempts: [
              {
                id: 'attempt-1',
                label: 'Attempt 1',
                answeredText: 'Flask',
                isCorrect: false,
              },
              {
                id: 'attempt-2',
                label: 'Attempt 2',
                answeredText: 'Beaker',
                isCorrect: true,
              },
            ],
          },
        ],
      },
    ],
    assessment: {
      completedOn: null,
      attemptCount: 0,
      gradingRows: [],
      attempts: [],
    },
  };
}

function createCompletedBadgeDetailPayload() {
  return {
    badge: {
      id: 'badge-3',
      slug: 'vent-hood',
      name: 'Vent Hood Safety',
      description: null,

      status: 'COMPLETED',
      awardedAt: '2026-03-22T10:00:00.000Z',
      score: 95,
    },
    progress: {
      percentComplete: 100,
      precheckComplete: true,
      assessmentComplete: true,
      currentCheckpoint: null,
      totalCheckpoints: 3,
      completedCheckpoints: 3,
    },
    checkpoints: [],
    assessment: {
      completedOn: '2026-03-22T10:00:00.000Z',
      attemptCount: 1,
      gradingRows: [
        {
          id: 'grading-1',
          title: 'Assessor observed correct hood setup.',
          outcome: 'Assessment score recorded: 95%',
          passed: true,
        },
      ],
      attempts: [
        {
          id: 'assessment-attempt-1',
          label: 'Attempt 1',
          score: 95,
          completedAt: '2026-03-22T10:00:00.000Z',
          passed: true,
          feedback: 'Student demonstrated safe setup and shutdown.',
          assessorName: 'Alex Checker',
        },
      ],
    },
  };
}

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

function createAuthState(overrides = {}) {
  return {
    signOut: jest.fn(),
    ...overrides,
  };
}

describe('Roster member profile page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams('courseId=course-1');
    mockUsePathname.mockReturnValue('/roster/student-1');
    mockUseParams.mockReturnValue({ studentId: 'student-1' });
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue(createAuthState());
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('loads and displays the selected student profile for the course', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => createStudentProfilePayload(),
    });

    render(<InstructorStudentProfilePage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/students/student-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(await screen.findByRole('heading', { name: 'Student Profile' })).toBeInTheDocument();
    expect(screen.getByText('Lovelace,')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('ada@bu.edu')).toBeInTheDocument();
    expect(screen.getByText('U11111111')).toBeInTheDocument();
    const courseInfoSection = screen.getByText('Course Info:').closest('section');
    expect(courseInfoSection).not.toBeNull();
    expect(within(courseInfoSection!).getByText(/Chem101/)).toBeInTheDocument();
    expect(courseInfoSection).toHaveTextContent('Section: K1');
    expect(screen.getByText('ta@bu.edu')).toBeInTheDocument();
    expect(screen.getByText('Waste Handling')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Demographic Info/i }));

    expect(screen.getByText('Woman')).toBeInTheDocument();
    expect(screen.getByText('College graduate')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Not yet started/i }));
    expect(screen.getByText('Bunsen Burners')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Completed/i }));
    expect(screen.getByText('Vent Hood Safety')).toBeInTheDocument();
  });

  it('navigates to the selected badge detail view when a badge is clicked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => createStudentProfilePayload(),
    });

    render(<InstructorStudentProfilePage />);

    expect(await screen.findByRole('heading', { name: 'Student Profile' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Waste Handling' }));

    expect(mockPush).toHaveBeenCalledWith('/roster/student-1?courseId=course-1&badgeId=badge-1');
  });

  it('renders the in-progress badge detail layout when a badge is selected', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1&badgeId=badge-1');
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/badges/badge-1')) {
        return {
          ok: true,
          json: async () => createInProgressBadgeDetailPayload(),
        } as Response;
      }

      return {
        ok: true,
        json: async () => createStudentProfilePayload(),
      } as Response;
    });

    render(<InstructorStudentProfilePage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/courses/course-1/students/student-1/badges/badge-1?email=prof%40example.edu',
        {
          headers: { Accept: 'application/json' },
        }
      );
    });

    expect(await screen.findByText('Answer History')).toBeInTheDocument();
    // The ring renders the number and "%" as separate spans inside .progressRingCenter.
    expect(screen.getByText((_, node) => node?.className === 'progressRingCenter')).toHaveTextContent('70%');
    expect(screen.getByText('Checkpoint 3')).toBeInTheDocument();
    expect(screen.getByText('Which container should be used?')).toBeInTheDocument();
    expect(screen.getByText('Answered: Beaker')).toBeInTheDocument();
  });

  it('renders the completed badge detail layout when a completed badge is selected', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1&badgeId=badge-3');
    mockFetch.mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/badges/badge-3')) {
        return {
          ok: true,
          json: async () => createCompletedBadgeDetailPayload(),
        } as Response;
      }

      return {
        ok: true,
        json: async () => createStudentProfilePayload(),
      } as Response;
    });

    render(<InstructorStudentProfilePage />);

    expect(await screen.findByText('Assessment Info')).toBeInTheDocument();
    expect(screen.getByText('Assessor Grading')).toBeInTheDocument();
    expect(screen.getByText('Assessment History')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.className === 'progressRingCenter')).toHaveTextContent('100%');

    fireEvent.click(screen.getByRole('button', { name: 'Attempt 1' }));

    expect(screen.getByText('Score: 95%')).toBeInTheDocument();
    expect(screen.getByText('Outcome:')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Assessor: Alex Checker')).toBeInTheDocument();
    expect(screen.getByText('Student demonstrated safe setup and shutdown.')).toBeInTheDocument();
  });

  it('shows assessment history for a badge ready for finalization', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1&badgeId=badge-1');
    const profilePayload = createStudentProfilePayload();
    profilePayload.badges.inReview = [
      {
        ...profilePayload.badges.inProgress[0],
        status: 'IN_REVIEW',
      },
    ];
    profilePayload.badges.inProgress = [];
    const detailPayload = createCompletedBadgeDetailPayload();
    detailPayload.badge.id = 'badge-1';
    detailPayload.badge.slug = 'waste-handling';
    detailPayload.badge.name = 'Waste Handling';
    detailPayload.badge.status = 'IN_REVIEW';

    mockFetch.mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/badges/badge-1')) {
        return {
          ok: true,
          json: async () => detailPayload,
        } as Response;
      }

      return {
        ok: true,
        json: async () => profilePayload,
      } as Response;
    });

    render(<InstructorStudentProfilePage />);

    expect(await screen.findByText('Assessment Info')).toBeInTheDocument();
    expect(screen.getByText('Assessment History')).toBeInTheDocument();
    expect(screen.queryByText('Answer History')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Assessment View' })).not.toBeInTheDocument();
  });

  it('lists assessment-passed badges in the ready for finalization section', async () => {
    const profilePayload = createStudentProfilePayload();
    profilePayload.badges.inReview = [
      {
        ...profilePayload.badges.inProgress[0],
        status: 'IN_REVIEW',
      },
    ];
    profilePayload.badges.inProgress = [];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => profilePayload,
    });

    render(<InstructorStudentProfilePage />);

    expect(await screen.findByRole('heading', { name: 'In review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Waste Handling' })).toBeInTheDocument();
  });

  it('saves per-student badge configuration via the config modal', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1&badgeId=badge-1');
    const detailPayload = createInProgressBadgeDetailPayload() as ReturnType<
      typeof createInProgressBadgeDetailPayload
    > & {
      badge: Record<string, unknown>;
    };
    detailPayload.badge.reassessmentLimit = 1;
    detailPayload.badge.cooldownDays = 2;
    detailPayload.badge.reassessmentRequired = false;
    detailPayload.badge.allowCooldownOverride = true;

    mockFetch.mockImplementation(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);

      if (init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ config: { reassessmentLimit: 3, cooldownDays: 2, reassessmentRequired: true } }),
        } as Response;
      }

      if (url.includes('/badges/badge-1')) {
        return { ok: true, json: async () => detailPayload } as Response;
      }

      return { ok: true, json: async () => createStudentProfilePayload() } as Response;
    });

    render(<InstructorStudentProfilePage />);

    expect(await screen.findByText('Answer History')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit configurations' }));
    expect(screen.getByText('Editing badge configurations for: Ada Lovelace')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Number of reassessments allowed'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mandatory' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find((call) => call[1]?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1].body as string);
      expect(body).toEqual(
        expect.objectContaining({ reassessmentLimit: 3, reassessmentRequired: true, cooldownDays: 2 })
      );
    });
  });

  it('loads and displays the selected assessor profile', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1');
    mockUsePathname.mockReturnValue('/roster/checker-1');
    mockUseParams.mockReturnValue({ studentId: 'checker-1' });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        memberRole: 'CHECKER',
        member: {
          id: 'checker-1',
          name: 'Alex Checker',
          email: 'checker@bu.edu',
          buid: 'U33333333',
          gender: 'Man',
          raceEthnicity: 'Not provided',
          parentalEducation: 'College graduate',
          pellGrantQualified: false,
          createdAt: '2026-03-20T15:30:00.000Z',
          avatar: {
            base: 'AMETHYST',
            face: 'SMILE',
            accessory: null,
          },
        },
        course: {
          id: 'course-1',
          title: 'Chem101',
          sections: ['K1', 'K2'],
          createdBy: {
            id: 'prof-1',
            name: 'Professor Demo',
            email: 'prof@example.edu',
            buid: 'P111',
          },
        },
        contacts: [
          {
            id: 'contact-1',
            type: 'CHECKER',
            name: 'Alex Checker',
            email: 'checker@bu.edu',
            avatarUrl: null,
          },
        ],
        badges: {
          inProgress: [
            {
              id: 'badge-1',
              slug: 'waste-handling',
              name: 'Waste Handling',
              description: null,

              status: 'LEARNING',
              awardedAt: null,
              score: null,
            },
          ],
          notStarted: [
            {
              id: 'badge-2',
              slug: 'bunsen-burner',
              name: 'Bunsen Burners',
              description: null,
            },
          ],
          inReview: [],
          completed: [],
        },
      }),
    });

    render(<InstructorStudentProfilePage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/students/checker-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(await screen.findByRole('heading', { name: 'Assessor Profile' })).toBeInTheDocument();
    expect(screen.getByText('Checker,')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('checker@bu.edu')).toBeInTheDocument();
    expect(screen.getByText('U33333333')).toBeInTheDocument();
    expect(screen.getByText('Assessor Info:')).toBeInTheDocument();
    expect(screen.getByText('Instructor')).toBeInTheDocument();
    expect(screen.getByText('Professor Demo')).toBeInTheDocument();
    const assessorCourseInfoSection = screen.getByText('Course Info:').closest('section');
    expect(assessorCourseInfoSection).not.toBeNull();
    expect(assessorCourseInfoSection).toHaveTextContent('Sections: K1, K2');
    expect(screen.queryByText('Assessor Badges')).not.toBeInTheDocument();
    expect(screen.queryByText('Waste Handling')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Demographic Info/i }));

    expect(screen.getByText('Man')).toBeInTheDocument();
    expect(screen.getByText('College graduate')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Not yet started/i })).not.toBeInTheDocument();
  });
});
