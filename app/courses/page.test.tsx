/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockFetch = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockUsePathname(),
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt} />,
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

function createAuthState(overrides = {}) {
  return {
    signOut: jest.fn(),
    ...overrides,
  };
}

describe('Courses page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/courses');
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue(createAuthState());
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('keeps the add card first and renders created courses after it', async () => {
    mockFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === '/api/courses/mine') {
        return {
          ok: true,
          json: async () => ({
            user: { name: 'Professor Demo', email: 'prof@example.edu' },
            created: {
              count: 2,
              courses: [
                {
                  id: 'course-1',
                  title: 'Course 1',
                  description: null,
                  section: null,
                  sectionCount: 2,
                  createdAt: '2026-03-30T18:35:48.000Z',
                  lessons: [],
                  enrollments: [
                    { id: 'enrollment-1', role: 'INSTRUCTOR' },
                    { id: 'enrollment-2', role: 'STUDENT' },
                  ],
                },
                {
                  id: 'course-2',
                  title: 'Course 2',
                  description: null,
                  section: null,
                  sectionCount: 1,
                  createdAt: '2026-03-29T18:35:48.000Z',
                  lessons: [],
                  enrollments: [{ id: 'enrollment-3', role: 'INSTRUCTOR' }],
                },
              ],
            },
            assessor: {
              count: 2,
              enrollments: [
                {
                  id: 'instructor-assessor-enrollment-1',
                  role: 'INSTRUCTOR',
                  sections: ['K1'],
                  course: {
                    id: 'assessor-course-1',
                    title: 'Assessor Course 1',
                    description: null,
                    section: null,
                    sectionCount: 1,
                    createdAt: '2026-03-28T18:35:48.000Z',
                    lessons: [],
                    enrollments: [{ id: 'instructor-assessor-enrollment-1', role: 'INSTRUCTOR' }],
                  },
                },
                {
                  id: 'checker-enrollment-1',
                  role: 'CHECKER',
                  sections: ['K2'],
                  course: {
                    id: 'checker-course-1',
                    title: 'Checker Course 1',
                    description: null,
                    section: null,
                    sectionCount: 1,
                    createdAt: '2026-03-27T18:35:48.000Z',
                    lessons: [],
                    enrollments: [{ id: 'checker-enrollment-1', role: 'CHECKER' }],
                  },
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
                    id: 'enrolled-course-1',
                    title: 'Enrolled Course 1',
                    lessons: [],
                  },
                },
              ],
            },
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

    // The three per-role fetches are consolidated into a single request.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('link', { name: 'Add course' })).toBeInTheDocument();
    expect(await screen.findByText('Course 1')).toBeInTheDocument();
    expect(screen.getByText('Course 2')).toBeInTheDocument();
    expect(screen.getByText('Assessor Course 1')).toBeInTheDocument();
    expect(screen.getByText('Checker Course 1')).toBeInTheDocument();
    expect(screen.getByText('Enrolled Course 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Course 1' })).toHaveAttribute('href', '/courses/course-1');
    expect(screen.getByRole('link', { name: 'Open Course 2' })).toHaveAttribute('href', '/courses/course-2');
    expect(screen.getByRole('link', { name: 'Open Assessor Course 1' })).toHaveAttribute(
      'href',
      '/courses/assessor-course-1?view=assessor'
    );
    expect(screen.getByRole('link', { name: 'Open Checker Course 1' })).toHaveAttribute(
      'href',
      '/courses/checker-course-1?view=assessor'
    );
    expect(screen.getByRole('link', { name: 'Open Enrolled Course 1' })).toHaveAttribute(
      'href',
      '/course_dashboard?courseId=enrolled-course-1'
    );

    const grid = screen.getByTestId('courses-grid');
    expect(grid.firstElementChild).toHaveAttribute('data-testid', 'add-course-card');
    expect(screen.getAllByTestId('course-card')).toHaveLength(4);
    expect(screen.getAllByTestId('enrolled-course-card')).toHaveLength(1);
  });

  it('redirects to sign-in when the user is signed out', async () => {
    mockUseUser.mockReturnValue(
      createClerkState({
        isSignedIn: false,
        user: null,
      })
    );

    const { container } = renderCourses();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });

    expect(container.firstChild).toBeNull();
  });
});
