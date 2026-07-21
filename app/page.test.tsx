/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import CoursesPage from './page';

// Isolate the SWR cache per render so cached /api/courses/mine data does not
// bleed between tests.
function renderCourses() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CoursesPage />
    </SWRConfig>
  );
}

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockUseStudentData = jest.fn();
const mockUseSearchParams = jest.fn();
const mockFetch = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
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

// Treat the test user as an allowlisted admin so the alpha lock doesn't hide the
// Create UI or add a /api/me/access fetch. Lock behavior is covered in the API tests.
jest.mock('./hooks/useCanCreateContent', () => ({
  useCanCreateContent: () => ({ canCreateContent: true, isAdmin: true, isLoading: false }),
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

describe('Courses Page', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue('/');
    mockPush.mockClear();
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
          inReview: [],
          learning: [],
          locked: [],
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

      if (url === '/api/courses/join') {
        return {
          ok: true,
          json: async () => ({
            message: 'You joined Analytical Chemistry.',
            course: { id: 'course-joined', title: 'Analytical Chemistry', code: 'CHEM202' },
            enrollment: { id: 'enrollment-joined', role: 'STUDENT' },
            alreadyEnrolled: false,
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('renders courses page with instructors, student, and assessor courses', async () => {
    renderCourses();

    expect(screen.getByText('Student Demo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Instructor Courses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assessor Courses' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Enrolled Courses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign off' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Courses' })).toBeInTheDocument();

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

    // #17: the Duplicate Course action renders inline in the Instructor Courses header.
    expect(screen.getByRole('button', { name: 'Duplicate course' })).toBeInTheDocument();

    // #19: sections render in order Instructor Courses -> My Enrolled Courses -> Assessor Courses.
    const instructorCoursesHeading = screen.getByRole('heading', { name: 'Instructor Courses' });
    const enrolledHeading = screen.getByRole('heading', { name: 'My Enrolled Courses' });
    const assessorHeading = screen.getByRole('heading', { name: 'Assessor Courses' });
    expect(
      instructorCoursesHeading.compareDocumentPosition(enrolledHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(enrolledHeading.compareDocumentPosition(assessorHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not show a create-course modal when the user has no courses', async () => {
    mockFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === '/api/courses/mine') {
        return {
          ok: true,
          json: async () => ({
            user: { name: 'Student Demo', email: 'student@example.edu' },
            created: { count: 0, courses: [] },
            enrolled: { count: 0, enrollments: [] },
            assessor: { count: 0, enrollments: [] },
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderCourses();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/mine', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
    });

    expect(screen.getByRole('link', { name: 'Create a course' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Welcome' })).not.toBeInTheDocument();
    expect(screen.queryByText('Create Course')).not.toBeInTheDocument();
  });

  it('highlights the active navigation item based on the current pathname', async () => {
    mockUsePathname.mockReturnValue('/profile');

    renderCourses();

    await screen.findByText('Created Course 1');

    const profileLink = screen.getByRole('link', { name: 'My Profile' });
    const coursesLink = screen.getByRole('link', { name: 'Courses' });

    expect(profileLink.className).toContain('navItemActive');
    expect(coursesLink.className).not.toContain('navItemActive');
  });

  it.each(['/courses/created-course-1', '/course_dashboard'])(
    'keeps Courses active for course workspace route %s',
    async (pathname) => {
      mockUsePathname.mockReturnValue(pathname);

      renderCourses();

      await screen.findByText('Created Course 1');

      const coursesLink = screen.getByRole('link', { name: 'Courses' });

      expect(coursesLink.className).toContain('navItemActive');
    }
  );

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

    const { container } = renderCourses();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/splash');
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

    renderCourses();

    await screen.findByText('Created Course 1');

    const button = screen.getByRole('button', { name: 'Sign off' });
    fireEvent.click(button);

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Signing off…' })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/splash');
    });
  });

  it('joins a course by course code and refreshes the course list', async () => {
    renderCourses();

    await screen.findByText('Created Course 1');

    fireEvent.click(screen.getByRole('button', { name: 'Join a course as a student' }));
    expect(await screen.findByRole('heading', { name: 'Join a course' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Course code'), {
      target: { value: 'chem-202' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ code: 'chem-202' }),
      });
    });

    expect(await screen.findByText('You joined Analytical Chemistry.')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/courses/mine', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  });
});
