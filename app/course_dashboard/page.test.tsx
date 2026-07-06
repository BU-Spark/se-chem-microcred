/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import CourseDashboardPage from './page';

const mockReplace = jest.fn();
const mockUsePathname = jest.fn(() => '/course_dashboard');
const mockUseSearchParams = jest.fn();
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
const mockUseStudentData = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
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

jest.mock('../hooks/useStudentData', () => ({
  useStudentData: (...args: unknown[]) => mockUseStudentData(...args),
}));

describe('Course dashboard page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ courseId: 'course-2' }));
    mockUseUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        fullName: 'Student Demo',
        primaryEmailAddress: { emailAddress: 'student@example.edu' },
      },
    });
    mockUseAuth.mockReturnValue({
      signOut: jest.fn(),
    });
    mockUseStudentData.mockReturnValue({
      data: {
        student: { name: 'Student Demo', email: 'student@example.edu' },
        lessons: { upNext: [], inProgress: [] },
        badges: { readyForFinalization: [] },
        surveys: { pendingBadge: [] },
      },
      isLoading: false,
      refresh: jest.fn(),
    });
  });

  it('loads student dashboard data for the course id from the clicked enrolled-course card', async () => {
    render(<CourseDashboardPage />);

    await waitFor(() => {
      expect(mockUseStudentData).toHaveBeenCalledWith('student@example.edu', 'course-2');
    });
  });

  it('uses the badge requirement video for the card image when the lesson has no segment video', async () => {
    // Badge videos live on badgeRequirements[].youtubeUrl, not on a segment (bug #14).
    // A badge-only lesson must resolve to the YouTube thumbnail, not the ChemSkills dummy.
    mockUseStudentData.mockReturnValue({
      data: {
        student: { name: 'Student Demo', email: 'student@example.edu' },
        lessons: {
          upNext: [
            {
              id: 'lesson-1',
              slug: 'lab-safety',
              title: 'Lab Safety Basics',
              status: 'NOT_STARTED',
              percentComplete: 0,
              dueDate: null,
              estimatedMinutes: null,
              thumbnailUrl: null,
              segments: [],
              badgeRequirements: [
                { badgeId: 'b1', badgeName: 'Safety', badgeSlug: 'safety', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' },
              ],
            },
          ],
          inProgress: [],
        },
        badges: { readyForFinalization: [] },
        surveys: { pendingBadge: [] },
      },
      isLoading: false,
      refresh: jest.fn(),
    });

    render(<CourseDashboardPage />);

    const img = await screen.findByAltText('Lesson preview');
    expect(img.getAttribute('src')).toContain('dQw4w9WgXcQ');
    expect(img.getAttribute('src')).not.toContain('ChemSkills');
  });
});
