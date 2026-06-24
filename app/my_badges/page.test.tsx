import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MyBadgesPage from './page';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUsePathname = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockFetch = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => mockUsePathname(),
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

describe('My badges page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue('/my_badges');
    mockUseUser.mockReturnValue(createClerkState());
    mockUseAuth.mockReturnValue({ signOut: jest.fn() });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('loads and renders all badges from the catalog API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 2,
        badges: [
          {
            id: 'badge-1',
            slug: 'bunsen-burner-badge',
            name: 'Bunsen Burner Badge',
            description: 'Prove safe usage and understanding of flame control.',
            category: 'EQUIPMENT',
            createdAt: '2025-02-20T17:00:00.000Z',
            assignedStudentCount: 1,
            requirements: [
              {
                id: 'requirement-1',
                summary: 'Complete Bunsen Burners checkpoints with instructor sign-off.',
                lesson: {
                  id: 'lesson-1',
                  title: 'Bunsen Burners',
                  course: {
                    id: 'course-1',
                    title: 'Chem 101: Safety Foundations',
                  },
                },
              },
            ],
          },
          {
            id: 'badge-2',
            slug: 'standalone-badge',
            name: 'Standalone Badge',
            description: null,
            category: null,
            createdAt: '2025-02-21T17:00:00.000Z',
            assignedStudentCount: 0,
            requirements: [],
          },
        ],
      }),
    });

    render(<MyBadgesPage />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/badges', {
        headers: { Accept: 'application/json' },
      });
    });

    expect(await screen.findByText('Bunsen Burner Badge')).toBeInTheDocument();
    expect(screen.getByText('Standalone Badge')).toBeInTheDocument();
    expect(screen.getByText('Assigned to Chem 101: Safety Foundations')).toBeInTheDocument();
    expect(screen.getByText('Not assigned to a course')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View course' })).toHaveAttribute('href', '/courses/course-1');
  });

  it('opens the badge creation page when editing a badge', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        badges: [
          {
            id: 'badge-1',
            slug: 'bunsen-burner-badge',
            name: 'Bunsen Burner Badge',
            description: 'Prove safe usage and understanding of flame control.',
            category: 'EQUIPMENT',
            createdAt: '2025-02-20T17:00:00.000Z',
            assignedStudentCount: 1,
            requirements: [
              {
                id: 'requirement-1',
                summary: null,
                displayText: 'Use the burner safely.',
                rubricItems: [{ number: 1, text: 'Use the burner safely.' }],
                gradingCriteria: [],
                checkpoints: [],
                lesson: {
                  id: 'lesson-1',
                  title: 'Bunsen Burners',
                  course: {
                    id: 'course-1',
                    title: 'Chem 101: Safety Foundations',
                  },
                },
              },
            ],
          },
        ],
      }),
    });

    render(<MyBadgesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(mockPush).toHaveBeenCalledWith('/badge_creation?badgeId=badge-1&courseId=course-1');
  });

  it('redirects to sign-in when signed out', async () => {
    mockUseUser.mockReturnValue(
      createClerkState({
        isSignedIn: false,
        user: null,
      })
    );

    const { container } = render(<MyBadgesPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });
    expect(container.firstChild).toBeNull();
  });
});
