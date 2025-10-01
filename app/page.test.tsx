import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HomePage from './page';

const mockReplace = jest.fn();
const mockUsePathname = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockUsePathname(),
}));

jest.mock('./hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

function createAuthState(overrides = {}) {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: {
      name: 'Student Demo',
      email: 'student@example.edu',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    error: undefined,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    clearError: jest.fn(),
    ...overrides,
  };
}

describe('Home Page', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue('/');
    mockUseAuth.mockReset();
    mockUseAuth.mockImplementation(() => createAuthState());
  });

  it('renders the signed-in dashboard when authentication is ready', () => {
    render(<HomePage />);

    expect(screen.getByText('Student Demo')).toBeInTheDocument();
    expect(screen.getByText('SD')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Up next' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pick up where you left off' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Start' })).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'Continue' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Sign off' })).toBeInTheDocument();
  });

  it('highlights the active navigation item based on the current pathname', () => {
    mockUsePathname.mockReturnValue('/profile');

    render(<HomePage />);

    const profileLink = screen.getByRole('link', { name: 'Profile' });
    const homeLink = screen.getByRole('link', { name: 'Home' });

    expect(profileLink.className).toContain('navItemActive');
    expect(homeLink.className).not.toContain('navItemActive');
  });

  it('redirects to sign-in when the user is not authenticated after loading', async () => {
    mockUseAuth.mockImplementation(() =>
      createAuthState({
        isSignedIn: false,
        user: null,
      })
    );

    const { container } = render(<HomePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });
    expect(container.firstChild).toBeNull();
  });

  it('signs off when the button is pressed', async () => {
    const signOutMock = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockImplementation(() =>
      createAuthState({
        signOut: signOutMock,
      })
    );

    render(<HomePage />);

    const button = screen.getByRole('button', { name: 'Sign off' });
    fireEvent.click(button);

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Signing off…' })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/sign-in');
    });
  });
});
