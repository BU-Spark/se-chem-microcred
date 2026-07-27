/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import CourseNewPage from './page';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockUseStudentData = jest.fn();
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

jest.mock('../../hooks/useStudentData', () => ({
  useStudentData: () => mockUseStudentData(),
}));

// The Sidebar rendered by this page reads content-access; stub it so it doesn't add
// a /api/me/access fetch that would perturb the ordered mockFetch expectations.
jest.mock('../../hooks/useCanCreateContent', () => ({
  useCanCreateContent: () => ({ canCreateContent: true, isAdmin: true, isLoading: false }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    return <img {...props} alt={props.alt} />;
  },
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

describe('Course new page edit mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams('courseId=course-1');
    mockUsePathname.mockReturnValue('/courses/new');
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue(createAuthState());
    mockUseStudentData.mockReturnValue({
      data: {
        student: {
          name: 'Professor Demo',
        },
      },
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('preloads existing course data and submits the course id on save', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          course: {
            id: 'course-1',
            title: 'Chemistry 101',
            sectionCount: 3,
            settings: {
              allowCooldownOverride: false,
              allowCheckerMessages: true,
              allowCrossSectionView: false,
            },
            contacts: [
              {
                id: 'contact-1',
                type: 'CHECKER',
                name: 'Alex Checker',
                email: 'checker@bu.edu',
              },
            ],
            enrollments: [
              {
                id: 'enrollment-1',
                role: 'STUDENT',
                sections: ['2'],
                student: {
                  id: 'student-1',
                  name: 'Jane Student',
                  email: 'jane@bu.edu',
                  externalId: 'U12345678',
                },
              },
              {
                id: 'enrollment-2',
                role: 'CHECKER',
                sections: ['3', '4'],
                student: {
                  id: 'checker-1',
                  name: 'Alex Checker',
                  email: 'checker@bu.edu',
                  externalId: 'U87654321',
                },
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          course: { id: 'course-1' },
        }),
      });

    render(<CourseNewPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    // Edit mode opens directly on the Review step, which summarizes the preloaded course.
    expect(await screen.findByText('Chemistry 101')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit course' })).toBeInTheDocument();
    expect(screen.getByText('1 students enrolled')).toBeInTheDocument();
    expect(screen.getByText('1 checkers enrolled')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const [, saveOptions] = mockFetch.mock.calls[1];
    const saveBody = JSON.parse((saveOptions as RequestInit).body as string);

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/courses',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(saveBody).toEqual(
      expect.objectContaining({
        id: 'course-1',
        code: '',
        title: 'Chemistry 101',
        sectionCount: '3',
        settings: {
          allowCooldownOverride: false,
          allowCheckerMessages: true,
          allowCrossSectionView: false,
        },
      })
    );

    expect(saveBody.roster).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'jane@bu.edu',
          name: 'Jane Student',
          externalId: 'U12345678',
          role: 'STUDENT',
          sections: ['2'],
        }),
        expect.objectContaining({
          email: 'checker@bu.edu',
          name: 'Alex Checker',
          externalId: 'U87654321',
          role: 'CHECKER',
          sections: ['3', '4'],
        }),
      ])
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/courses/course-1');
    });
  });

  it('shows a warning modal before opening the student roster upload picker', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        course: {
          id: 'course-1',
          title: 'Chemistry 101',
          sectionCount: 3,
          settings: {
            allowCooldownOverride: false,
            allowCheckerMessages: true,
            allowCrossSectionView: false,
          },
          contacts: [],
          enrollments: [],
        },
      }),
    });

    const { container } = render(<CourseNewPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    // Edit mode opens on the Review step; jump to the student roster step to reach the upload control.
    fireEvent.click(await screen.findByRole('button', { name: 'View Student Roster' }));

    await waitFor(() => {
      expect(container.querySelector('input[type="file"]')).not.toBeNull();
    });

    const studentUploadInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = jest.spyOn(studentUploadInput, 'click');

    fireEvent.click(screen.getByRole('button', { name: 'Upload CSV file' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Review your file before uploading.',
      })
    ).toBeInTheDocument();

    expect(within(screen.getByRole('dialog')).getByText(/Use the headers/i)).toBeInTheDocument();

    expect(within(screen.getByRole('dialog')).getByText(/\|/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue Upload' }));

    expect(clickSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: 'Review your file before uploading.',
        })
      ).not.toBeInTheDocument();
    });
  });

  it('shows an error modal when roster upload parsing fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        course: {
          id: 'course-1',
          title: 'Chemistry 101',
          sectionCount: 3,
          settings: {
            allowCooldownOverride: false,
            allowCheckerMessages: true,
            allowCrossSectionView: false,
          },
          contacts: [],
          enrollments: [],
        },
      }),
    });

    const { container } = render(<CourseNewPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    // Edit mode opens on the Review step; jump to the student roster step to reach the upload control.
    fireEvent.click(await screen.findByRole('button', { name: 'View Student Roster' }));

    await waitFor(() => {
      expect(container.querySelector('input[type="file"]')).not.toBeNull();
    });

    const studentUploadInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    const badCsv = new File(['wrong,lastName\nDoe,Jane'], 'bad.csv', {
      type: 'text/csv',
    });

    Object.defineProperty(badCsv, 'text', {
      value: async () => 'wrong,lastName\nDoe,Jane',
    });

    fireEvent.change(studentUploadInput, {
      target: { files: [badCsv] },
    });

    expect(
      await screen.findByRole('heading', {
        name: 'File upload failed',
      })
    ).toBeInTheDocument();

    expect(
      within(screen.getByRole('dialog')).getByText(
        'CSV must contain headers: lastName, firstName, an ID column (e.g. BUID or Student ID), email, sections'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: 'File upload failed',
        })
      ).not.toBeInTheDocument();
    });
  });

  it('requires at least one section before leaving course information', () => {
    mockSearchParams = new URLSearchParams();

    render(<CourseNewPage />);

    fireEvent.change(screen.getByPlaceholderText('Course Name'), {
      target: { value: 'Chemistry 101' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Course must have at least 1 section.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Course Name')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('renders the checker configuration toggles reflecting the loaded settings', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        course: {
          id: 'course-1',
          title: 'Chemistry 101',
          sectionCount: 3,
          settings: {
            allowCooldownOverride: false,
            allowCheckerMessages: true,
            allowCrossSectionView: false,
          },
          contacts: [],
          enrollments: [],
        },
      }),
    });

    render(<CourseNewPage />);

    // Wait for the course (and its settings) to load before reading the toggles —
    // the review renders immediately in edit mode, but the settings arrive async.
    expect(await screen.findByText('Chemistry 101')).toBeInTheDocument();

    // The Checker Configurations section is no longer feature-flagged out — it
    // always renders in the review, with each toggle set from the loaded course.
    expect(screen.getByText('Checker Configurations')).toBeInTheDocument();

    const messagesToggle = within(screen.getByText('Allow checker messages?').parentElement as HTMLElement).getByRole(
      'button'
    );
    expect(messagesToggle).toHaveAttribute('aria-pressed', 'true');

    const cooldownToggle = within(
      screen.getByText('Allow manual override for cooldown?').parentElement as HTMLElement
    ).getByRole('button');
    expect(cooldownToggle).toHaveAttribute('aria-pressed', 'false');

    expect(screen.getByText('Allow checkers to view other sections?')).toBeInTheDocument();
  });
});

// #205: the same email in both rosters blocks submission, and before this there was
// no way to remove anyone — re-uploading a corrected CSV only appends (#168), so the
// wizard was a dead end.
describe('Course new page roster row removal', () => {
  function courseWithConflict() {
    return {
      course: {
        id: 'course-1',
        title: 'Chemistry 101',
        sectionCount: 3,
        settings: {
          allowCooldownOverride: false,
          allowCheckerMessages: true,
          allowCrossSectionView: false,
        },
        contacts: [],
        enrollments: [
          {
            id: 'enrollment-1',
            role: 'STUDENT',
            sections: ['1'],
            student: { id: 'u-1', name: 'Jane Student', email: 'jane@bu.edu', externalId: 'U1' },
          },
          {
            id: 'enrollment-2',
            role: 'STUDENT',
            sections: ['2'],
            student: { id: 'u-2', name: 'Sam Both', email: 'both@bu.edu', externalId: 'U2' },
          },
          {
            id: 'enrollment-3',
            role: 'CHECKER',
            sections: ['2'],
            student: { id: 'u-2', name: 'Sam Both', email: 'both@bu.edu', externalId: 'U2' },
          },
          {
            id: 'enrollment-4',
            role: 'STUDENT',
            sections: ['3'],
            student: { id: 'u-3', name: 'Kim Lee', email: 'kim@bu.edu', externalId: 'U3' },
          },
        ],
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams('courseId=course-1');
    mockUsePathname.mockReturnValue('/courses/new');
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue(createAuthState());
    mockUseStudentData.mockReturnValue({
      data: { student: { name: 'Professor Demo' } },
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('flags a person listed in both rosters so they can be found and removed', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => courseWithConflict() });

    render(<CourseNewPage />);

    expect(await screen.findByText('Chemistry 101')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Student Roster' }));

    // The duplicate is called out inline; the person who is only a student is not.
    expect(await screen.findByText('Also a checker')).toBeInTheDocument();
    expect(screen.getAllByText('Also a checker')).toHaveLength(1);
  });

  it('confirms before removing in edit mode, and cancelling keeps the row', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => courseWithConflict() });

    render(<CourseNewPage />);

    expect(await screen.findByText('Chemistry 101')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Student Roster' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Sam Both from the student roster' }));

    expect(await screen.findByRole('heading', { name: 'Remove Sam Both from this course?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Remove Sam Both from this course?' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Remove Sam Both from the student roster' })).toBeInTheDocument();
  });

  it('removes the duplicate and omits them from the saved roster, unblocking the save', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => courseWithConflict() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ course: { id: 'course-1' } }) });

    render(<CourseNewPage />);

    expect(await screen.findByText('Chemistry 101')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Student Roster' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Sam Both from the student roster' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    // Row is gone, and with it the cross-roster conflict.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Remove Sam Both from the student roster' })).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Also a checker')).not.toBeInTheDocument();

    // Student roster -> checker roster -> review.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const [, saveOptions] = mockFetch.mock.calls[1];
    const saveBody = JSON.parse((saveOptions as RequestInit).body as string);

    // Sam survives once, as a checker only — the student enrollment is gone, so the
    // server's roster rebuild will not recreate it.
    const samEntries = saveBody.roster.filter((row: { email: string }) => row.email === 'both@bu.edu');
    expect(samEntries).toEqual([expect.objectContaining({ role: 'CHECKER' })]);
    expect(saveBody.roster).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: 'jane@bu.edu', role: 'STUDENT' })])
    );
  });

  it('keeps section selections with the right person after a removal', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => courseWithConflict() });

    render(<CourseNewPage />);

    expect(await screen.findByText('Chemistry 101')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Student Roster' }));

    // Remove the FIRST student, shifting every later row's array index down by one.
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Jane Student from the student roster' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    // Survivors keep their own sections.
    expect(await screen.findByLabelText('Section for Sam Both')).toHaveValue('2');
    expect(screen.getByLabelText('Section for Kim Lee')).toHaveValue('3');

    // Reassigning a survivor updates that person and nobody else.
    fireEvent.change(screen.getByLabelText('Section for Kim Lee'), { target: { value: '2' } });

    expect(await screen.findByLabelText('Section for Kim Lee')).toHaveValue('2');
    expect(screen.getByLabelText('Section for Sam Both')).toHaveValue('2');
  });
});
