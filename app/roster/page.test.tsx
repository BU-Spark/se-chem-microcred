import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import StudentRosterPage from './page';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockFetch = jest.fn();

let mockSearchParams = new URLSearchParams('courseId=course-1');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
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

describe('Course roster page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams('courseId=course-1');
    mockUsePathname.mockReturnValue('/roster');
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue(createAuthState());
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('loads and displays student roster for the selected course', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        course: {
          id: 'course-1',
          title: 'Course 1',
          createdBy: {
            name: 'Professor Demo',
            email: 'prof@example.edu',
          },
          enrollments: [
            {
              id: 'enrollment-1',
              role: 'INSTRUCTOR',
              sections: [],
              student: {
                id: 'prof-1',
                name: 'Professor Demo',
                email: 'prof@example.edu',
                buid: 'P111',
              },
            },
            {
              id: 'enrollment-2',
              role: 'STUDENT',
              sections: ['A1'],
              student: {
                id: 'student-1',
                name: 'Ada Lovelace',
                email: 'ada@bu.edu',
                buid: 'U11111111',
              },
            },
            {
              id: 'enrollment-3',
              role: 'STUDENT',
              sections: ['B1'],
              student: {
                id: 'student-2',
                name: 'Grace Hopper',
                email: 'grace@bu.edu',
                buid: 'U22222222',
              },
            },
          ],
        },
      }),
    });

    render(<StudentRosterPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(await screen.findByRole('heading', { name: 'Student Roster' })).toBeInTheDocument();
    expect(screen.getByText('Course 1')).toBeInTheDocument();
    expect(screen.getByText('Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('ada@bu.edu')).toBeInTheDocument();
    expect(screen.getByText('U11111111')).toBeInTheDocument();
    expect(screen.getByText('Hopper')).toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
    expect(screen.queryByText('prof@example.edu')).not.toBeInTheDocument();
  });

  it('filters students by search and filter panel fields', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        course: {
          id: 'course-1',
          title: 'Course 1',
          createdBy: {
            name: 'Professor Demo',
            email: 'prof@example.edu',
          },
          enrollments: [
            {
              id: 'enrollment-1',
              role: 'STUDENT',
              sections: ['A1'],
              student: {
                id: 'student-1',
                name: 'Ada Lovelace',
                email: 'ada@bu.edu',
                buid: 'U11111111',
              },
            },
            {
              id: 'enrollment-2',
              role: 'STUDENT',
              sections: ['B1'],
              student: {
                id: 'student-2',
                name: 'Grace Hopper',
                email: 'grace@bu.edu',
                buid: 'U22222222',
              },
            },
          ],
        },
      }),
    });

    render(<StudentRosterPage />);

    expect(await screen.findByText('Lovelace')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Section'), {
      target: { value: 'B1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));

    expect(screen.getByText('Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Lovelace')).not.toBeInTheDocument();
    expect(screen.getByText('Section: B1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'grace@bu.edu' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), {
      target: { value: 'grace@bu.edu' },
    });

    expect(screen.getByText('grace@bu.edu')).toBeInTheDocument();
    expect(screen.queryByText('ada@bu.edu')).not.toBeInTheDocument();
    expect(screen.getByText('Email: grace@bu.edu')).toBeInTheDocument();
  });

  it('marks a student row as active on first click and opens the student page on second click', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        course: {
          id: 'course-1',
          title: 'Course 1',
          createdBy: {
            name: 'Professor Demo',
            email: 'prof@example.edu',
          },
          enrollments: [
            {
              id: 'enrollment-1',
              role: 'STUDENT',
              sections: ['A1'],
              student: {
                id: 'student-1',
                name: 'Ada Lovelace',
                email: 'ada@bu.edu',
                buid: 'U11111111',
              },
            },
            {
              id: 'enrollment-2',
              role: 'STUDENT',
              sections: ['B1'],
              student: {
                id: 'student-2',
                name: 'Grace Hopper',
                email: 'grace@bu.edu',
                buid: 'U22222222',
              },
            },
          ],
        },
      }),
    });

    render(<StudentRosterPage />);

    expect(await screen.findByText('Lovelace')).toBeInTheDocument();

    const adaRow = screen.getByText('Lovelace').closest('tr');
    const graceRow = screen.getByText('Hopper').closest('tr');

    expect(adaRow).toHaveAttribute('data-selected', 'false');
    expect(graceRow).toHaveAttribute('data-selected', 'false');

    fireEvent.click(graceRow!);

    expect(adaRow).toHaveAttribute('data-selected', 'false');
    expect(graceRow).toHaveAttribute('data-selected', 'true');
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.click(graceRow!);

    expect(mockPush).toHaveBeenCalledWith('/roster/student-2?courseId=course-1');
  });

  it('loads the assessor roster when the checker role is selected', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1&role=CHECKER');

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        course: {
          id: 'course-1',
          title: 'Course 1',
          createdBy: {
            name: 'Professor Demo',
            email: 'prof@example.edu',
          },
          enrollments: [
            {
              id: 'enrollment-1',
              role: 'STUDENT',
              sections: ['A1'],
              student: {
                id: 'student-1',
                name: 'Ada Lovelace',
                email: 'ada@bu.edu',
                buid: 'U11111111',
              },
            },
            {
              id: 'enrollment-2',
              role: 'CHECKER',
              sections: ['B1', 'B2'],
              student: {
                id: 'checker-1',
                name: 'Alex Checker',
                email: 'checker@bu.edu',
                buid: 'U33333333',
              },
            },
          ],
        },
      }),
    });

    render(<StudentRosterPage />);

    expect(await screen.findByRole('heading', { name: 'Assessor Roster' })).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Checker')).toBeInTheDocument();
    expect(screen.getByText('checker@bu.edu')).toBeInTheDocument();
    expect(screen.getByText('B1, B2')).toBeInTheDocument();
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();

    const checkerRow = screen.getByText('Checker').closest('tr');

    expect(checkerRow).toHaveAttribute('data-selected', 'false');

    fireEvent.click(checkerRow!);

    expect(checkerRow).toHaveAttribute('data-selected', 'true');
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.click(checkerRow!);

    expect(mockPush).toHaveBeenCalledWith('/roster/checker-1?courseId=course-1');
  });
});
