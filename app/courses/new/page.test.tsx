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
              allowAssessorMessages: true,
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
                  buid: 'U12345678',
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
                  buid: 'U87654321',
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
    expect(screen.getByText('1 assessors enrolled')).toBeInTheDocument();

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
          allowAssessorMessages: true,
          allowCrossSectionView: false,
        },
      })
    );

    expect(saveBody.roster).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'jane@bu.edu',
          name: 'Jane Student',
          buid: 'U12345678',
          role: 'STUDENT',
          sections: ['2'],
        }),
        expect.objectContaining({
          email: 'checker@bu.edu',
          name: 'Alex Checker',
          buid: 'U87654321',
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
            allowAssessorMessages: true,
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
            allowAssessorMessages: true,
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
        'CSV must contain headers: lastName, firstName, buid, email, sections'
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
});
