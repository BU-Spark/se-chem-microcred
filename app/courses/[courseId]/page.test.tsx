/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import CreatedCourseDetailPage from './page';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUsePathname = jest.fn();
const mockUseSearchParams = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockFetch = jest.fn();

let mockParams: Record<string, string> = { courseId: 'course-1' };

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockUsePathname(),
  useParams: () => mockParams,
  useSearchParams: () => mockUseSearchParams(),
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
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

describe('Created course detail page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { courseId: 'course-1' };
    mockUsePathname.mockReturnValue('/courses/course-1');
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue(createAuthState());
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('renders the created course screen from fetched course data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        viewerRole: 'INSTRUCTOR',
        course: {
          id: 'course-1',
          code: 'CHEM101',
          title: 'Chemistry 101',
          description: 'Introduction to safe lab practices.',
          sectionCount: 5,
          createdAt: '2026-04-01T00:00:00.000Z',
          createdBy: {
            id: 'user-1',
            name: 'Professor Demo',
            email: 'prof@example.edu',
            externalId: 'U1234567',
          },
          settings: {
            allowCooldownOverride: true,
            allowAssessorMessages: true,
            allowCrossSectionView: true,
          },
          contacts: [
            {
              id: 'stale-checker-contact',
              type: 'CHECKER',
              name: 'David Xiao',
              email: 'david.xiao@example.edu',
              avatarUrl: null,
            },
          ],
          enrollments: [
            {
              id: 'enrollment-1',
              role: 'INSTRUCTOR',
              status: 'ACTIVE',
              sections: [],
              student: {
                id: 'user-1',
                name: 'Professor Demo',
                email: 'prof@example.edu',
                externalId: 'U1234567',
              },
            },
            {
              id: 'enrollment-2',
              role: 'STUDENT',
              status: 'ACTIVE',
              sections: ['1'],
              student: {
                id: 'student-1',
                name: 'Student One',
                email: 'student1@bu.edu',
                externalId: 'U2345678',
              },
            },
            {
              id: 'enrollment-3',
              role: 'STUDENT',
              status: 'ACTIVE',
              sections: ['2'],
              student: {
                id: 'student-2',
                name: 'Student Two',
                email: 'student2@bu.edu',
                externalId: 'U3456789',
              },
            },
            {
              id: 'enrollment-4',
              role: 'CHECKER',
              status: 'ACTIVE',
              sections: ['1'],
              student: {
                id: 'checker-1',
                name: 'Checker One',
                email: 'checker1@bu.edu',
                externalId: 'U4567890',
              },
            },
            {
              id: 'enrollment-5',
              role: 'CHECKER',
              status: 'ACTIVE',
              sections: ['2'],
              student: {
                id: 'checker-2',
                name: 'Checker Two',
                email: 'checker2@bu.edu',
                externalId: 'U5678901',
              },
            },
          ],
          lessons: [
            {
              id: 'lesson-1',
              slug: 'lesson-1',
              title: 'Lesson 1',
              summary: 'Summary',
              thumbnailUrl: null,
              sortOrder: 0,
              badgeRequirements: [
                {
                  id: 'requirement-1',
                  summary: null,
                  badge: {
                    id: 'badge-1',
                    slug: 'waste-handling-badge',
                    name: 'Waste Handling Badge',
                    description: null,
                    availableOn: null,
                    closesOn: null,
                    neverCloses: true,
                    createdAt: '2026-04-01T00:00:00.000Z',
                  },
                },
              ],
            },
            {
              id: 'lesson-2',
              slug: 'lesson-2',
              title: 'Lesson 2',
              summary: 'Summary',
              thumbnailUrl: null,
              sortOrder: 1,
              badgeRequirements: [
                {
                  id: 'requirement-2',
                  summary: null,
                  badge: {
                    id: 'badge-1',
                    slug: 'waste-handling-badge',
                    name: 'Waste Handling Badge',
                    description: null,
                    availableOn: null,
                    closesOn: null,
                    neverCloses: true,
                    createdAt: '2026-04-01T00:00:00.000Z',
                  },
                },
                {
                  id: 'requirement-3',
                  summary: null,
                  badge: {
                    id: 'badge-2',
                    slug: 'bunsen-burners-badge',
                    name: 'Bunsen Burners Badge',
                    description: null,
                    availableOn: null,
                    closesOn: null,
                    neverCloses: true,
                    createdAt: '2026-04-01T00:00:00.000Z',
                  },
                },
              ],
            },
          ],
        },
      }),
    });

    render(<CreatedCourseDetailPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(await screen.findAllByText('Chemistry 101')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2, name: 'Chemistry 101' })).toBeInTheDocument();
    expect(screen.getByText('Course Info')).toBeInTheDocument();
    expect(screen.getByText('Number of Sections: 5')).toBeInTheDocument();
    expect(screen.getByText('Number of Students Enrolled: 2')).toBeInTheDocument();
    expect(screen.getByText('CHEM101')).toBeInTheDocument();
    expect(screen.getByText('One, Checker')).toBeInTheDocument();
    expect(screen.getByText('Two, Checker')).toBeInTheDocument();
    expect(screen.queryByText('Xiao, David')).not.toBeInTheDocument();
    expect(screen.getByText('Assigned Badges')).toBeInTheDocument();
    expect(screen.getByText('Waste Handling')).toBeInTheDocument();
    expect(screen.getByText('Bunsen Burners')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Waste Handling/i })).toHaveAttribute('href', '/courses/course-1/badge-1');
    expect(screen.getByRole('link', { name: 'View Student Roster' })).toHaveAttribute(
      'href',
      '/roster?courseId=course-1&role=STUDENT'
    );
    expect(screen.getByRole('link', { name: 'View Assessor Roster' })).toHaveAttribute(
      'href',
      '/roster?courseId=course-1&role=CHECKER'
    );
    expect(screen.getByRole('link', { name: 'Edit Course' })).toHaveAttribute('href', '/courses/new?courseId=course-1');
    expect(screen.queryByRole('button', { name: 'Delete badge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create Badge' })).not.toBeInTheDocument();

    // Open the combined edit-settings popup; it shows the read-only insertion date.
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit badge settings' })[0]);
    const settingsDialog = screen.getByRole('dialog', { name: 'Edit settings for Waste Handling Badge' });
    expect(settingsDialog).toBeInTheDocument();
    expect(screen.getByText(/Inserted on/i)).toBeInTheDocument();

    // Saving the badge settings PATCHes the imported badge with the availability window.
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/badges/badge-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availableOn: null, closesOn: null, neverCloses: true }),
      });
    });

    // Unassign lives behind an inline confirm step inside the popup.
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit badge settings' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Unassign badge' }));
    expect(screen.getByText(/The badge itself will not be deleted/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unassign Badge' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/badges/badge-1', { method: 'DELETE' });
    });
  });

  it('renders a read-only course view for students', async () => {
    mockUseUser.mockReturnValue(
      createClerkState({
        user: {
          fullName: 'Student One',
          primaryEmailAddress: { emailAddress: 'student1@bu.edu' },
        },
      })
    );
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        viewerRole: 'STUDENT',
        course: {
          id: 'course-1',
          code: 'CHEM101',
          title: 'Chemistry 101',
          description: null,
          sectionCount: 1,
          createdAt: '2026-04-01T00:00:00.000Z',
          createdBy: {
            id: 'user-1',
            name: 'Professor Demo',
            email: 'prof@example.edu',
            externalId: 'U1234567',
          },
          settings: null,
          contacts: [],
          enrollments: [
            {
              id: 'enrollment-1',
              role: 'STUDENT',
              sections: ['1'],
              student: {
                id: 'student-1',
                name: 'Student One',
                email: 'student1@bu.edu',
                externalId: 'U2345678',
              },
            },
          ],
          lessons: [],
        },
      }),
    });

    render(<CreatedCourseDetailPage />);

    expect(await screen.findByText('Your Role: STUDENT')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View Student Roster' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit Course' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create Badge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import Existing Badge' })).not.toBeInTheDocument();
  });

  it('renders assessor mode for an instructor entering through the assessor card', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('view=assessor'));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        viewerRole: 'INSTRUCTOR',
        course: {
          id: 'course-1',
          code: 'CHEM101',
          title: 'Chemistry 101',
          description: null,
          sectionCount: 1,
          createdAt: '2026-04-01T00:00:00.000Z',
          createdBy: {
            id: 'user-1',
            name: 'Professor Demo',
            email: 'prof@example.edu',
            externalId: 'U1234567',
          },
          settings: null,
          contacts: [],
          enrollments: [
            {
              id: 'enrollment-1',
              role: 'INSTRUCTOR',
              sections: [],
              student: {
                id: 'user-1',
                name: 'Professor Demo',
                email: 'prof@example.edu',
                externalId: 'U1234567',
              },
            },
            {
              id: 'enrollment-2',
              role: 'STUDENT',
              sections: ['1'],
              student: {
                id: 'student-1',
                name: 'Student One',
                email: 'student1@bu.edu',
                externalId: 'U2345678',
              },
            },
          ],
          lessons: [],
        },
      }),
    });

    render(<CreatedCourseDetailPage />);

    expect(await screen.findByText('Your Role: ASSESSOR')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Students to Assess' })).toHaveAttribute(
      'href',
      '/roster?courseId=course-1&role=STUDENT'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Assess Student' }));
    expect(screen.getByRole('dialog', { name: 'Assess student by code' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter an assessment code.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Assessment code'), { target: { value: 'abcd-2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPush).toHaveBeenCalledWith('/qr/assessment-code?code=ABCD2345');
    expect(screen.queryByRole('link', { name: 'View Assessor Roster' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit Course' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create Badge' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import Existing Badge' })).not.toBeInTheDocument();
  });

  it('imports an existing badge into the course', async () => {
    const coursePayload = {
      viewerRole: 'INSTRUCTOR',
      course: {
        id: 'course-1',
        code: 'CHEM101',
        title: 'Chemistry 101',
        description: 'Introduction to safe lab practices.',
        sectionCount: 2,
        createdAt: '2026-04-01T00:00:00.000Z',
        createdBy: {
          id: 'user-1',
          name: 'Professor Demo',
          email: 'prof@example.edu',
          externalId: 'U1234567',
        },
        settings: null,
        contacts: [],
        enrollments: [
          {
            id: 'enrollment-1',
            role: 'INSTRUCTOR',
            sections: [],
            student: {
              id: 'user-1',
              name: 'Professor Demo',
              email: 'prof@example.edu',
              externalId: 'U1234567',
            },
          },
          {
            id: 'enrollment-2',
            role: 'STUDENT',
            sections: ['1'],
            student: {
              id: 'student-1',
              name: 'Student One',
              email: 'student1@bu.edu',
              externalId: 'U2345678',
            },
          },
        ],
        lessons: [],
      },
    };
    const libraryPayload = {
      count: 1,
      badges: [
        {
          id: 'badge-template-1',
          slug: 'bunsen-burner-template',
          name: 'Bunsen Burner Badge',
          description: 'Burner safety',
          createdAt: '2026-04-02T00:00:00.000Z',
          assignedStudentCount: 0,
          requirements: [
            {
              id: 'requirement-template-1',
              summary: null,
              displayText: 'Use the burner safely.',
              rubricItems: [],
              gradingCriteria: [],
              lesson: null,
            },
          ],
        },
      ],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => coursePayload,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => libraryPayload,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Badge imported successfully.',
          badge: { id: 'imported-badge-1' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...coursePayload,
          course: {
            ...coursePayload.course,
            lessons: [
              {
                id: 'lesson-1',
                slug: 'lesson-1',
                title: 'Bunsen Burner Lesson',
                summary: 'Summary',
                thumbnailUrl: null,
                sortOrder: 0,
                badgeRequirements: [
                  {
                    id: 'requirement-1',
                    summary: null,
                    badge: {
                      id: 'imported-badge-1',
                      slug: 'bunsen-burner-badge',
                      name: 'Bunsen Burner Badge',
                      description: 'Burner safety',
                    },
                  },
                ],
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => libraryPayload,
      });

    render(<CreatedCourseDetailPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Import Existing Badge' }));

    expect(await screen.findByRole('heading', { name: 'Import Existing Badge' })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/badges', {
        headers: { Accept: 'application/json' },
      });
    });

    fireEvent.change(screen.getByLabelText('Badge library'), {
      target: { value: 'badge-template-1' },
    });
    // Two-step popup: pick the badge, advance to availability, then finish.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/badges/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ badgeId: 'badge-template-1', availableOn: null, closesOn: null, neverCloses: true }),
      });
    });
    // The confirmation step renders after a successful import.
    expect(await screen.findByRole('heading', { name: 'Badge imported' })).toBeInTheDocument();
    expect(await screen.findByText('The badge has been added to this course.')).toBeInTheDocument();
    expect(await screen.findByText('Bunsen Burner')).toBeInTheDocument();
  });
});
