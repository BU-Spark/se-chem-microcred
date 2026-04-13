/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import CoursesPage from './page';

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
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { name: 'Professor Demo', email: 'prof@example.edu' },
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
      }),
    });

    render(<CoursesPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/created?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(screen.getByRole('link', { name: 'Add course' })).toBeInTheDocument();
    expect(await screen.findByText('Course 1')).toBeInTheDocument();
    expect(screen.getByText('Course 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Course 1' })).toHaveAttribute('href', '/courses/course-1');
    expect(screen.getByRole('link', { name: 'Open Course 2' })).toHaveAttribute('href', '/courses/course-2');

    const grid = screen.getByTestId('courses-grid');
    expect(grid.firstElementChild).toHaveAttribute('data-testid', 'add-course-card');
    expect(screen.getAllByTestId('course-card')).toHaveLength(2);
  });

  it('redirects to sign-in when the user is signed out', async () => {
    mockUseUser.mockReturnValue(
      createClerkState({
        isSignedIn: false,
        user: null,
      })
    );

    const { container } = render(<CoursesPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });

    expect(container.firstChild).toBeNull();
  });
});
