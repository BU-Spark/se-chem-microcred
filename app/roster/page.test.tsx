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
                externalId: 'P111',
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
                externalId: 'U11111111',
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
                externalId: 'U22222222',
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
                externalId: 'U11111111',
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
                externalId: 'U22222222',
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
                externalId: 'U11111111',
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
                externalId: 'U22222222',
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
                externalId: 'U11111111',
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
                externalId: 'U33333333',
              },
            },
          ],
        },
      }),
    });

    render(<StudentRosterPage />);

    expect(await screen.findByRole('heading', { name: 'Assessor Roster' })).toBeInTheDocument();
    // The heading derives from the role search param and renders before the fetched
    // roster rows, so wait on a data-dependent cell to avoid racing the fetch.
    expect(await screen.findByText('Alex')).toBeInTheDocument();
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

  it('lets an instructor manually add a student and refreshes the roster', async () => {
    const rosterPayload = {
      viewerRole: 'INSTRUCTOR',
      course: {
        id: 'course-1',
        title: 'Course 1',
        createdBy: { name: 'Professor Demo', email: 'prof@example.edu' },
        enrollments: [],
      },
    };
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => rosterPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => rosterPayload });

    render(<StudentRosterPage />);
    const addButton = await screen.findByRole('button', { name: '+ Add students' });
    fireEvent.click(addButton);
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@bu.edu' } });
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'A1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add student' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/members', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'STUDENT',
          members: [{ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@bu.edu', externalId: '', sections: 'A1' }],
        }),
      });
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('shows the assessor add modal only to instructors', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1&role=CHECKER');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        viewerRole: 'INSTRUCTOR',
        course: {
          id: 'course-1',
          title: 'Course 1',
          createdBy: { name: 'Professor Demo', email: 'prof@example.edu' },
          enrollments: [],
        },
      }),
    });
    render(<StudentRosterPage />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Add assessors' }));
    expect(screen.getByRole('dialog', { name: 'Add assessors' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Single user' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'CSV upload' })).toBeInTheDocument();
  });

  it('lets an instructor assign an unassigned student to a new section', async () => {
    const payload = {
      viewerRole: 'INSTRUCTOR',
      course: {
        id: 'course-1',
        title: 'Course 1',
        createdBy: { name: 'Professor Demo', email: 'prof@example.edu' },
        enrollments: [
          {
            id: 'enrollment-1',
            role: 'STUDENT',
            status: 'ACTIVE',
            sections: [],
            student: { id: 'student-1', name: 'Ada Lovelace', email: 'ada@bu.edu', externalId: 'U1' },
          },
        ],
      },
    };
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sections: ['NEW-1'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => payload });
    render(<StudentRosterPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Assign section' }));
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'NEW-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sections' }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/courses/course-1/enrollments/enrollment-1/sections',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ sections: ['NEW-1'] }) })
      )
    );
  });

  it('lets an instructor add multiple assessor sections', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1&role=CHECKER');
    const payload = {
      viewerRole: 'INSTRUCTOR',
      course: {
        id: 'course-1',
        title: 'Course 1',
        createdBy: { name: 'Professor Demo', email: 'prof@example.edu' },
        enrollments: [
          {
            id: 'checker-enrollment',
            role: 'CHECKER',
            status: 'ACTIVE',
            sections: ['A1'],
            student: { id: 'checker-1', name: 'Alex Checker', email: 'checker@bu.edu', externalId: 'U2' },
          },
        ],
      },
    };
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sections: ['A1', 'B2'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => payload });
    render(<StudentRosterPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Sections'), { target: { value: 'A1 | B2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sections' }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/courses/course-1/enrollments/checker-enrollment/sections',
        expect.objectContaining({ body: JSON.stringify({ sections: ['A1', 'B2'] }) })
      )
    );
  });

  it('lets an instructor remove an assessor', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1&role=CHECKER');
    const payload = {
      viewerRole: 'INSTRUCTOR',
      course: {
        id: 'course-1',
        title: 'Course 1',
        createdBy: { name: 'Professor Demo', email: 'prof@example.edu' },
        enrollments: [
          {
            id: 'checker-enrollment',
            role: 'CHECKER',
            status: 'ACTIVE',
            sections: ['A1'],
            student: { id: 'checker-1', name: 'Alex Checker', email: 'checker@bu.edu', externalId: 'U2' },
          },
        ],
      },
    };
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'removed' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => payload });
    render(<StudentRosterPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('dialog', { name: 'Remove assessor?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove assessor' }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/assessors/checker-1', {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })
    );
  });
});
