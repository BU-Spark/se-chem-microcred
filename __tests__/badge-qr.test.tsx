import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BadgeWalletPage from '../app/badges/page';
import type { StudentData } from '../app/hooks/useStudentData';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUsePathname = jest.fn(() => '/badges');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockUsePathname(),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();
jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
  useClerk: () => ({ openUserProfile: jest.fn() }),
}));

const mockUseStudentData = jest.fn();
jest.mock('../app/hooks/useStudentData', () => ({
  useStudentData: () => mockUseStudentData(),
}));

// Simplify next/image for tests
type MockImageProps = {
  src: string | { src: string };
  alt: string;
  priority?: boolean;
} & Record<string, unknown>;

jest.mock('next/image', () => {
  const MockNextImage = (props: MockImageProps) => {
    const { src, alt, priority, ...rest } = props;
    void priority;
    const resolvedSrc = typeof src === 'string' ? src : src?.src || '';
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolvedSrc} alt={alt} {...rest} />;
  };
  MockNextImage.displayName = 'MockNextImage';
  return MockNextImage;
});

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ code: 'ABCD-2345', expiresAt: '2026-06-30T12:30:00.000Z' }),
  }) as unknown as typeof fetch;
  mockUseUser.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: 'Student Demo',
      primaryEmailAddress: { emailAddress: 'student@example.edu' },
    },
  });
  mockUseAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    signOut: jest.fn(),
  });
  mockUseStudentData.mockReturnValue({
    data: createStudentData(),
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  });
});

function createStudentData() {
  // Typed against the real StudentData['badges'] shape so the empty arrays widen
  // to BadgeRecord[] (rather than never[]) and individual tests can reassign them.
  const badges: StudentData['badges'] = {
    completed: [],
    readyForAssessment: [
      {
        id: 'badge-assess-1',
        courseId: 'course-1',
        slug: 'assessment-badge',
        name: 'Assessment Badge',
        description: 'Needs in-person assessment',

        status: 'READY_FOR_ASSESSMENT',
        awardedAt: null,
        score: null,
        latestAttemptPassed: null,
        cooldownUntil: null,
        youtubeUrl: null,
        requirements: [],
      },
    ],
    inReview: [],
    learning: [],
    locked: [],
    notStarted: [],
  };

  return {
    student: {
      id: 'student-1',
      name: 'Student Demo',
      email: 'student@example.edu',
    },
    analytics: {
      hoursLearning: 0,
      badgesCompleted: 0,
      badgesReadyForAssessment: 1,
      badgesNotAttempted: 0,
      questionsAnswered: 0,
      averageAssessmentScore: 0,
      highestAssessmentScore: 0,
    },
    course: { id: 'course-1', code: 'CHEM101', section: 'K1', title: 'Chem 101', description: 'Basics', contacts: [] },
    lessons: { upNext: [], inProgress: [], catalog: [] },
    badges,
  };
}

describe('Badge Wallet QR modal', () => {
  it('renders QR image and assessment code from internal APIs when showing code', async () => {
    render(<BadgeWalletPage />);

    // Expand the "Ready to be Assessed" section
    const assessmentToggle = document.querySelector('button[aria-controls="assessment-badges"]') as HTMLButtonElement;
    if (assessmentToggle.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(assessmentToggle);
    }

    // Open the badge modal
    fireEvent.click(screen.getByRole('button', { name: /Assessment/i }));

    // Open the QR modal
    fireEvent.click(screen.getByRole('button', { name: /Show Code/i }));

    const qrImage = screen.getByAltText(/Assessment Badge QR code/i) as HTMLImageElement;
    expect(qrImage.src).toContain('/api/qr?size=360');
    expect(qrImage.src).toContain(encodeURIComponent('/qr/assessment'));
    expect(qrImage.src).toContain('courseId%3Dcourse-1');
    expect(qrImage.src).toContain('studentId%3Dstudent-1');
    expect(qrImage.src).toContain('badgeId%3Dbadge-assess-1');
    expect(await screen.findByText('ABCD-2345')).toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/assessment-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-1', badgeId: 'badge-assess-1' }),
      });
    });
  });

  it('uses the badge-specific course id when the badge belongs to another enrollment', async () => {
    const studentData = createStudentData();
    studentData.badges.readyForAssessment[0] = {
      ...studentData.badges.readyForAssessment[0],
      courseId: 'course-2',
    };
    mockUseStudentData.mockReturnValue({
      data: studentData,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });

    render(<BadgeWalletPage />);

    const assessmentToggle = document.querySelector('button[aria-controls="assessment-badges"]') as HTMLButtonElement;
    if (assessmentToggle.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(assessmentToggle);
    }

    fireEvent.click(screen.getByRole('button', { name: /Assessment/i }));
    fireEvent.click(screen.getByRole('button', { name: /Show Code/i }));

    const qrImage = screen.getByAltText(/Assessment Badge QR code/i) as HTMLImageElement;
    expect(qrImage.src).toContain('courseId%3Dcourse-2');
    expect(qrImage.src).not.toContain('courseId%3Dcourse-1');
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/assessment-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-2', badgeId: 'badge-assess-1' }),
      });
    });
  });

  it('shows a failed in-review badge in In Review with a review feedback action', () => {
    const studentData = createStudentData();
    studentData.badges.readyForAssessment = [];
    studentData.badges.inReview = [
      {
        id: 'badge-review-1',
        courseId: 'course-1',
        slug: 'learning-badge',
        name: 'Learning Badge',
        description: 'Needs feedback review',

        status: 'IN_REVIEW' as const,
        awardedAt: null,
        score: 40,
        // Fail path: the student must review feedback before reassessing.
        latestAttemptPassed: false,
        cooldownUntil: null,
        youtubeUrl: null,
        requirements: [],
      },
    ];
    mockUseStudentData.mockReturnValue({
      data: studentData,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });

    render(<BadgeWalletPage />);

    const inReviewToggle = document.querySelector('button[aria-controls="inReview-badges"]') as HTMLButtonElement;
    if (inReviewToggle.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(inReviewToggle);
    }

    fireEvent.click(screen.getByRole('button', { name: /Learning/i }));
    fireEvent.click(screen.getByRole('button', { name: /Review Feedback/i }));

    expect(mockPush).toHaveBeenCalledWith('/badges/learning-badge/feedback?courseId=course-1');
  });
});
