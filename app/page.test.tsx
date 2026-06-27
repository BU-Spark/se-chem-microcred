/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import HomePage from './page';

// Isolate the SWR cache per render so cached /api/courses/mine data does not
// bleed between tests.
function renderHome() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <HomePage />
    </SWRConfig>
  );
}

const mockReplace = jest.fn();
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockUseStudentData = jest.fn();
const mockUseSearchParams = jest.fn();
const mockFetch = jest.fn();

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

jest.mock('./hooks/useStudentData', () => ({
  useStudentData: () => mockUseStudentData(),
}));

function createClerkState(overrides = {}) {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: 'Student Demo',
      primaryEmailAddress: { emailAddress: 'student@example.edu' },
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

function createAuthState(overrides = {}) {
  return {
    isLoaded: true,
    isSignedIn: true,
    signOut: jest.fn(),
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

    mockUseUser.mockReset();
    mockUseUser.mockImplementation(() => createClerkState());

    mockUseAuth.mockReset();
    mockUseAuth.mockImplementation(() => createAuthState());

    mockUseStudentData.mockReset();
    mockUseStudentData.mockReturnValue({
      data: {
        student: {
          name: 'Student Demo',
          email: 'student@example.edu',
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

    mockFetch.mockReset();
    mockFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === '/api/courses/mine') {
        return {
          ok: true,
          json: async () => ({
            user: { name: 'Student Demo', email: 'student@example.edu' },
            created: {
              count: 2,
              courses: [
                {
                  id: 'created-course-1',
                  title: 'Created Course 1',
                  description: null,
                  section: null,
                  sectionCount: 2,
                  createdAt: '2026-03-30T18:35:48.000Z',
                  lessons: [],
                  enrollments: [{ id: 'enrollment-1', role: 'INSTRUCTOR' }],
                },
                {
                  id: 'created-course-2',
                  title: 'Created Course 2',
                  description: null,
                  section: null,
                  sectionCount: 1,
                  createdAt: '2026-03-29T18:35:48.000Z',
                  lessons: [],
                  enrollments: [{ id: 'enrollment-2', role: 'INSTRUCTOR' }],
                },
              ],
            },
            enrolled: {
              count: 2,
              enrollments: [
                {
                  id: 'student-enrollment-1',
                  role: 'STUDENT',
                  course: {
                    id: 'course-1',
                    code: 'CAS CH 101',
                    section: 'A1',
                    title: 'General Chemistry',
                    description: 'Foundations of chemistry',
                    contacts: [
                      {
                        id: 'contact-1',
                        type: 'INSTRUCTOR',
                        name: 'Prof. Curie',
                        email: 'curie@example.edu',
                      },
                    ],
                    lessons: [{ thumbnailUrl: null, segments: [] }],
                  },
                },
                {
                  id: 'student-enrollment-2',
                  role: 'STUDENT',
                  course: {
                    id: 'course-2',
                    code: 'CAS CH 102',
                    section: 'B2',
                    title: 'Organic Chemistry',
                    description: 'Carbon compounds',
                    contacts: [
                      {
                        id: 'contact-2',
                        type: 'INSTRUCTOR',
                        name: 'Prof. Dalton',
                        email: 'dalton@example.edu',
                      },
                    ],
                    lessons: [{ thumbnailUrl: null, segments: [] }],
                  },
                },
              ],
            },
            assessor: {
              count: 1,
              enrollments: [
                {
                  id: 'checker-enrollment-1',
                  role: 'CHECKER',
                  sections: ['K1'],
                  course: {
                    id: 'assessor-course-1',
                    title: 'Assessor Course 1',
                    description: null,
                    section: null,
                    sectionCount: 1,
                    createdAt: '2026-03-28T18:35:48.000Z',
                    lessons: [],
                    enrollments: [{ id: 'checker-enrollment-1', role: 'CHECKER' }],
                  },
                },
              ],
            },
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('renders created and enrolled course sections on the merged home page', async () => {
    renderHome();

    expect(screen.getByText('Student Demo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Courses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assessor Courses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Enrolled Courses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign off' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Courses' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/mine', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
    });

    // The three per-role fetches are consolidated into a single request.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('Created Course 1')).toBeInTheDocument();
    expect(screen.getByText('Created Course 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a course' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Created Course 1' })).toHaveAttribute(
      'href',
      '/courses/created-course-1'
    );
    expect(screen.getByRole('link', { name: 'Open Created Course 2' })).toHaveAttribute(
      'href',
      '/courses/created-course-2'
    );
    expect(screen.getByText('Assessor Course 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Assessor Course 1' })).toHaveAttribute(
      'href',
      '/courses/assessor-course-1?view=assessor'
    );

    expect(screen.getByText('General Chemistry')).toBeInTheDocument();
    expect(screen.getByText('Organic Chemistry')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open General Chemistry' })).toHaveAttribute(
      'href',
      '/course_dashboard?courseId=course-1'
    );
    expect(screen.getByRole('link', { name: 'Open Organic Chemistry' })).toHaveAttribute(
      'href',
      '/course_dashboard?courseId=course-2'
    );

    const createdGrid = screen.getByTestId('created-courses-grid');
    expect(createdGrid.firstElementChild).toHaveAttribute('data-testid', 'add-course-card');
    expect(screen.getAllByTestId('course-card')).toHaveLength(3);
    expect(screen.getAllByTestId('enrolled-course-card')).toHaveLength(2);
  });

  it('highlights the active navigation item based on the current pathname', async () => {
    mockUsePathname.mockReturnValue('/profile');

    renderHome();

    await screen.findByText('Created Course 1');

    const profileLink = screen.getByRole('link', { name: 'Profile' });
    const homeLink = screen.getByRole('link', { name: 'Home' });

    expect(profileLink.className).toContain('navItemActive');
    expect(homeLink.className).not.toContain('navItemActive');
  });

  it('keeps Home active for course workspace routes', async () => {
    mockUsePathname.mockReturnValue('/courses/created-course-1');

    renderHome();

    await screen.findByText('Created Course 1');

    const homeLink = screen.getByRole('link', { name: 'Home' });

    expect(homeLink.className).toContain('navItemActive');
    expect(screen.queryByRole('link', { name: 'Courses' })).not.toBeInTheDocument();
  });

  it('redirects to sign-in when the user is not authenticated after loading', async () => {
    mockUseUser.mockImplementation(() =>
      createClerkState({
        isSignedIn: false,
        user: null,
      })
    );
    mockUseAuth.mockImplementation(() =>
      createAuthState({
        isSignedIn: false,
      })
    );

    const { container } = renderHome();

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

    renderHome();

    await screen.findByText('Created Course 1');

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
