import { fireEvent, render, screen } from '@testing-library/react';
import BadgeWalletPage from '../app/badges/page';

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
} & Record<string, unknown>;

jest.mock('next/image', () => {
  const MockNextImage = (props: MockImageProps) => {
    const { src, alt, ...rest } = props;
    const resolvedSrc = typeof src === 'string' ? src : src?.src || '';
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolvedSrc} alt={alt} {...rest} />;
  };
  MockNextImage.displayName = 'MockNextImage';
  return MockNextImage;
});

beforeEach(() => {
  jest.clearAllMocks();
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
    badges: {
      completed: [],
      readyForAssessment: [
        {
          id: 'badge-assess-1',
          slug: 'assessment-badge',
          name: 'Assessment Badge',
          description: 'Needs in-person assessment',
          category: 'Safety',
          status: 'READY_FOR_ASSESSMENT' as const,
          awardedAt: null,
          score: null,
          requirements: [],
        },
      ],
      readyForFinalization: [],
      learning: [],
    },
  };
}

describe('Badge Wallet QR modal', () => {
  it('renders QR image from internal API when showing code', () => {
    render(<BadgeWalletPage />);

    // Expand the "Ready to be Assessed" section
    const expandButtons = screen.getAllByLabelText(/Expand section/i);
    if (expandButtons.length) {
      fireEvent.click(expandButtons[0]);
    }

    // Open the badge modal
    fireEvent.click(screen.getByRole('button', { name: /Assessment/i }));

    // Open the QR modal
    fireEvent.click(screen.getByRole('button', { name: /Show Code/i }));

    const qrImage = screen.getByAltText(/Assessment Badge QR code/i) as HTMLImageElement;
    expect(qrImage.src).toContain('/api/qr?size=360');
    expect(qrImage.src).toContain('badge%3Abadge-assess-1');
  });
});
