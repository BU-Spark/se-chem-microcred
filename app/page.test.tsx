import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HomePage from './page';
import type { LessonRecord } from './hooks/useStudentData';

const mockReplace = jest.fn();
const mockUsePathname = jest.fn();
const mockUseAuth = jest.fn();
const mockUseStudentData = jest.fn();
const mockUseSearchParams = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock('./hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('./hooks/useStudentData', () => ({
  useStudentData: () => mockUseStudentData(),
}));

function createAuthState(overrides = {}) {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: {
      name: 'Student Demo',
      email: 'student@example.edu',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    error: undefined,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    clearError: jest.fn(),
    ...overrides,
  };
}

function createLesson(id: string, overrides: Partial<LessonRecord> = {}): LessonRecord {
  const baseLesson: LessonRecord = {
    id,
    slug: `${id}-slug`,
    title: `Lesson ${id}`,
    summary: 'Summary',
    description: 'Description',
    thumbnailUrl: null,
    estimatedMinutes: 10,
    dueDate: new Date().toISOString(),
    sortOrder: 0,
    status: 'NOT_STARTED',
    percentComplete: 0,
    segments: [],
    checkpoints: [],
    skills: [],
  };

  return {
    ...baseLesson,
    ...overrides,
  };
}

describe('Home Page', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue('/');
    mockUseSearchParams.mockReset();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseAuth.mockReset();
    mockUseAuth.mockImplementation(() => createAuthState());
    mockUseStudentData.mockReset();
    const upNextLessons = [createLesson('up-1'), createLesson('up-2'), createLesson('up-3')];
    const inProgressLessons = [
      createLesson('in-1', { status: 'IN_PROGRESS', percentComplete: 75 }),
      createLesson('in-2', { status: 'IN_PROGRESS', percentComplete: 50 }),
      createLesson('in-3', { status: 'IN_PROGRESS', percentComplete: 20 }),
    ];

    mockUseStudentData.mockReturnValue({
      data: {
        student: {
          name: 'Student Demo',
          email: 'student@example.edu',
        },
        lessons: {
          upNext: upNextLessons,
          inProgress: inProgressLessons,
          catalog: [...upNextLessons, ...inProgressLessons],
        },
        badges: {
          completed: [],
          readyForAssessment: [],
          readyForFinalization: [],
          learning: [],
        },
        surveys: {
          lesson: [],
          badge: [],
          pendingBadge: [],
        },
      },
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });
  });

  it('renders the signed-in dashboard when authentication is ready', () => {
    render(<HomePage />);

    expect(screen.getByText('Student Demo')).toBeInTheDocument();
    expect(screen.getByText('SD')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Up next' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pick up where you left off' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Start' })).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'Continue' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Sign off' })).toBeInTheDocument();
  });

  it('highlights the active navigation item based on the current pathname', () => {
    mockUsePathname.mockReturnValue('/profile');

    render(<HomePage />);

    const profileLink = screen.getByRole('link', { name: 'Profile' });
    const homeLink = screen.getByRole('link', { name: 'Home' });

    expect(profileLink.className).toContain('navItemActive');
    expect(homeLink.className).not.toContain('navItemActive');
  });

  it('redirects to sign-in when the user is not authenticated after loading', async () => {
    mockUseAuth.mockImplementation(() =>
      createAuthState({
        isSignedIn: false,
        user: null,
      })
    );

    const { container } = render(<HomePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });
    expect(container.firstChild).toBeNull();
  });

  it('signs off when the button is pressed', async () => {
    const signOutMock = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockImplementation(() =>
      createAuthState({
        signOut: signOutMock,
      })
    );

    render(<HomePage />);

    const button = screen.getByRole('button', { name: 'Sign off' });
    fireEvent.click(button);

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Signing off…' })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });
  });
});
