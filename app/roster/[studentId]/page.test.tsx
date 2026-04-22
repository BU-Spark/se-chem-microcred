import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import InstructorStudentProfilePage from './page';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockFetch = jest.fn();
const mockUseParams = jest.fn();

let mockSearchParams = new URLSearchParams('courseId=course-1');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockSearchParams,
  useParams: () => mockUseParams(),
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

describe('Roster member profile page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams('courseId=course-1');
    mockUsePathname.mockReturnValue('/roster/student-1');
    mockUseParams.mockReturnValue({ studentId: 'student-1' });
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue(createAuthState());
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('loads and displays the selected student profile for the course', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        memberRole: 'STUDENT',
        member: {
          id: 'student-1',
          name: 'Ada Lovelace',
          email: 'ada@bu.edu',
          buid: 'U11111111',
          gender: 'Woman',
          raceEthnicity: 'Not provided',
          parentalEducation: 'College graduate',
          pellGrantQualified: true,
          createdAt: '2026-03-20T15:30:00.000Z',
          avatar: {
            base: 'EMERALD',
            face: 'SMILE',
            accessory: null,
          },
        },
        course: {
          id: 'course-1',
          title: 'Chem101',
          sections: ['K1'],
          createdBy: {
            id: 'prof-1',
            name: 'Professor Demo',
            email: 'prof@example.edu',
            buid: 'P111',
          },
        },
        contacts: [
          {
            id: 'contact-1',
            type: 'CHECKER',
            name: 'Last Name, First Name',
            email: 'ta@bu.edu',
            avatarUrl: '/edit_avatar/amethyst.svg',
          },
        ],
        badges: {
          inProgress: [
            {
              id: 'badge-1',
              slug: 'waste-handling',
              name: 'Waste Handling',
              description: null,
              category: 'WASTE',
              status: 'LEARNING',
              awardedAt: null,
              score: null,
            },
          ],
          notStarted: [
            {
              id: 'badge-2',
              slug: 'bunsen-burner',
              name: 'Bunsen Burners',
              description: null,
              category: 'EQUIPMENT',
            },
          ],
          completed: [
            {
              id: 'badge-3',
              slug: 'vent-hood',
              name: 'Vent Hood Safety',
              description: null,
              category: 'SAFETY',
              status: 'COMPLETED',
              awardedAt: '2026-03-22T10:00:00.000Z',
              score: 95,
            },
          ],
        },
      }),
    });

    render(<InstructorStudentProfilePage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/students/student-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(await screen.findByRole('heading', { name: 'Student Profile' })).toBeInTheDocument();
    expect(screen.getByText('Lovelace,')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('ada@bu.edu')).toBeInTheDocument();
    expect(screen.getByText('U11111111')).toBeInTheDocument();
    const courseInfoSection = screen.getByText('Course Info:').closest('section');
    expect(courseInfoSection).not.toBeNull();
    expect(within(courseInfoSection!).getByText(/Chem101/)).toBeInTheDocument();
    expect(courseInfoSection).toHaveTextContent('Section: K1');
    expect(screen.getByText('ta@bu.edu')).toBeInTheDocument();
    expect(screen.getByText('Waste Handling')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Demographic Info/i }));

    expect(screen.getByText('Woman')).toBeInTheDocument();
    expect(screen.getByText('College graduate')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Not yet started/i }));
    expect(screen.getByText('Bunsen Burners')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Completed/i }));
    expect(screen.getByText('Vent Hood Safety')).toBeInTheDocument();
  });

  it('loads and displays the selected assessor profile', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1');
    mockUsePathname.mockReturnValue('/roster/checker-1');
    mockUseParams.mockReturnValue({ studentId: 'checker-1' });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        memberRole: 'CHECKER',
        member: {
          id: 'checker-1',
          name: 'Alex Checker',
          email: 'checker@bu.edu',
          buid: 'U33333333',
          gender: 'Man',
          raceEthnicity: 'Not provided',
          parentalEducation: 'College graduate',
          pellGrantQualified: false,
          createdAt: '2026-03-20T15:30:00.000Z',
          avatar: {
            base: 'AMETHYST',
            face: 'SMILE',
            accessory: null,
          },
        },
        course: {
          id: 'course-1',
          title: 'Chem101',
          sections: ['K1', 'K2'],
          createdBy: {
            id: 'prof-1',
            name: 'Professor Demo',
            email: 'prof@example.edu',
            buid: 'P111',
          },
        },
        contacts: [
          {
            id: 'contact-1',
            type: 'CHECKER',
            name: 'Alex Checker',
            email: 'checker@bu.edu',
            avatarUrl: null,
          },
        ],
        badges: {
          inProgress: [
            {
              id: 'badge-1',
              slug: 'waste-handling',
              name: 'Waste Handling',
              description: null,
              category: 'WASTE',
              status: 'LEARNING',
              awardedAt: null,
              score: null,
            },
          ],
          notStarted: [
            {
              id: 'badge-2',
              slug: 'bunsen-burner',
              name: 'Bunsen Burners',
              description: null,
              category: 'EQUIPMENT',
            },
          ],
          completed: [],
        },
      }),
    });

    render(<InstructorStudentProfilePage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/courses/course-1/students/checker-1?email=prof%40example.edu', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(await screen.findByRole('heading', { name: 'Assessor Profile' })).toBeInTheDocument();
    expect(screen.getByText('Checker,')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('checker@bu.edu')).toBeInTheDocument();
    expect(screen.getByText('U33333333')).toBeInTheDocument();
    expect(screen.getByText('Assessor Info:')).toBeInTheDocument();
    expect(screen.getByText('Instructor')).toBeInTheDocument();
    expect(screen.getByText('Professor Demo')).toBeInTheDocument();
    const assessorCourseInfoSection = screen.getByText('Course Info:').closest('section');
    expect(assessorCourseInfoSection).not.toBeNull();
    expect(assessorCourseInfoSection).toHaveTextContent('Sections: K1, K2');
    expect(screen.queryByText('Assessor Badges')).not.toBeInTheDocument();
    expect(screen.queryByText('Waste Handling')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Demographic Info/i }));

    expect(screen.getByText('Man')).toBeInTheDocument();
    expect(screen.getByText('College graduate')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Not yet started/i })).not.toBeInTheDocument();
  });
});
