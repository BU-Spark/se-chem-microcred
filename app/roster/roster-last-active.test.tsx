import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { SWRTestProvider } from '@/app/hooks/test-utils';
import { formatLastActive } from '@/lib/time/lastActive';

import { LAST_ACTIVE_REFRESH_MS } from './hooks/useRosterLastActive';
import StudentRosterPage from './page';

const mockFetch = jest.fn();
let mockSearchParams = new URLSearchParams('courseId=course-1');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/roster',
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: { fullName: 'Professor Demo', primaryEmailAddress: { emailAddress: 'prof@example.edu' } },
  }),
  useAuth: () => ({ signOut: jest.fn() }),
}));

// The badge snapshot has its own tests; keep its request out of this file's fetch counts.
jest.mock('./hooks/useRosterBadgeSnapshot', () => ({
  useRosterBadgeSnapshot: () => ({ badges: [], cellsByStudent: {}, isLoading: false, error: undefined }),
}));

const MINUTE = 60_000;
const LAST_ACTIVE_URL = '/api/courses/course-1/last-active';
const ADA_ACTIVE = '2026-11-19T15:30:00.000Z';

function rosterPayload(viewerRole = 'INSTRUCTOR') {
  return {
    viewerRole,
    course: {
      id: 'course-1',
      title: 'Course 1',
      createdBy: { name: 'Professor Demo', email: 'prof@example.edu' },
      enrollments: [
        {
          id: 'enrollment-1',
          role: 'STUDENT',
          status: 'ACTIVE',
          sections: ['A1'],
          student: { id: 'student-1', name: 'Ada Lovelace', email: 'ada@bu.edu', externalId: 'U1' },
        },
        {
          id: 'enrollment-2',
          role: 'STUDENT',
          status: 'ACTIVE',
          sections: ['B1'],
          student: { id: 'student-2', name: 'Grace Hopper', email: 'grace@bu.edu', externalId: 'U2' },
        },
        {
          id: 'enrollment-3',
          role: 'CHECKER',
          status: 'ACTIVE',
          sections: ['A1'],
          student: { id: 'checker-1', name: 'Alex Checker', email: 'checker@bu.edu', externalId: 'U3' },
        },
      ],
    },
  };
}

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 502, json: async () => body });
}

function mockApi({ viewerRole = 'INSTRUCTOR', lastActiveOk = true } = {}) {
  mockFetch.mockImplementation((url: string) => {
    if (url.startsWith(LAST_ACTIVE_URL)) {
      return lastActiveOk
        ? json({ lastActive: { 'student-1': ADA_ACTIVE, 'student-2': null }, fetchedAt: new Date().toISOString() })
        : json({ error: 'Unable to load last-active times.' }, false);
    }
    return json(rosterPayload(viewerRole));
  });
}

const lastActiveCalls = () => mockFetch.mock.calls.filter(([url]) => String(url).startsWith(LAST_ACTIVE_URL)).length;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function interact() {
  act(() => {
    window.dispatchEvent(new Event('pointerdown'));
  });
}

// Advance time while the instructor keeps using the page (an interaction every 10 minutes).
async function advanceWhileActive(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 10 * MINUTE) {
    interact();
    await act(async () => {
      jest.advanceTimersByTime(Math.min(10 * MINUTE, ms - elapsed));
    });
  }
}

// Step a minute at a time so React re-renders between timer ticks, as it would in a
// real browser (one big jump would run SWR's hourly tick before the idle state lands).
async function advanceIdle(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += MINUTE) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(MINUTE, ms - elapsed));
    });
  }
}

function renderRoster() {
  return render(<StudentRosterPage />, { wrapper: SWRTestProvider });
}

describe('Roster Last Logon column', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-20T12:00:00.000Z'));
    mockFetch.mockReset();
    mockSearchParams = new URLSearchParams('courseId=course-1');
    global.fetch = mockFetch as unknown as typeof fetch;
    setVisibility('visible');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows Last Logon between Email and Section with a formatted time or a fallback', async () => {
    mockApi();
    renderRoster();

    const adaRow = (await screen.findByText('Lovelace')).closest('tr')!;
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers.indexOf('Last Logon')).toBe(headers.indexOf('Email') + 1);
    expect(headers.indexOf('Progress')).toBe(headers.indexOf('Last Logon') + 1);
    expect(headers.indexOf('Section')).toBe(headers.indexOf('Progress') + 1);

    expect(await within(adaRow).findByText(formatLastActive(ADA_ACTIVE))).toBeInTheDocument();
    const graceRow = screen.getByText('Hopper').closest('tr')!;
    expect(within(graceRow).getByText('Never active')).toBeInTheDocument();
    expect(lastActiveCalls()).toBe(1);
  });

  it('sorts by Last Logon, most recent first, with never-active students last (Issue #329)', async () => {
    mockApi();
    renderRoster();
    const adaRow = (await screen.findByText('Lovelace')).closest('tr')!;
    await within(adaRow).findByText(formatLastActive(ADA_ACTIVE));

    const lastNames = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((tableRow) => within(tableRow).getAllByRole('cell')[0].textContent);
    // Default order is last name A–Z.
    expect(lastNames()).toEqual(['Hopper', 'Lovelace']);

    fireEvent.click(screen.getByRole('button', { name: 'Last Logon' }));
    expect(screen.getByRole('columnheader', { name: 'Last Logon' })).toHaveAttribute('aria-sort', 'descending');
    expect(lastNames()).toEqual(['Lovelace', 'Hopper']);

    // Never-active Grace stays last when the direction flips.
    fireEvent.click(screen.getByRole('button', { name: 'Last Logon' }));
    expect(screen.getByRole('columnheader', { name: 'Last Logon' })).toHaveAttribute('aria-sort', 'ascending');
    expect(lastNames()).toEqual(['Lovelace', 'Hopper']);
  });

  it('shows a dash instead of "Never active" when the endpoint fails', async () => {
    mockApi({ lastActiveOk: false });
    renderRoster();

    const adaRow = (await screen.findByText('Lovelace')).closest('tr')!;
    await waitFor(() => expect(within(adaRow).getAllByText('—').length).toBeGreaterThan(0));
    expect(screen.queryByText('Never active')).not.toBeInTheDocument();
  });

  it('does not request or show last logon for non-instructors', async () => {
    mockApi({ viewerRole: 'STUDENT' });
    renderRoster();

    await screen.findByText('Lovelace');
    await advanceWhileActive(LAST_ACTIVE_REFRESH_MS);
    expect(screen.queryByRole('columnheader', { name: 'Last Logon' })).not.toBeInTheDocument();
    expect(lastActiveCalls()).toBe(0);
  });

  it('does not request or show last logon on the checker roster', async () => {
    mockSearchParams = new URLSearchParams('courseId=course-1&role=CHECKER');
    mockApi();
    renderRoster();

    await screen.findByText('Alex');
    expect(screen.queryByRole('columnheader', { name: 'Last Logon' })).not.toBeInTheDocument();
    expect(lastActiveCalls()).toBe(0);
  });

  it('refreshes exactly once per hour while the instructor is active', async () => {
    mockApi();
    renderRoster();
    await waitFor(() => expect(lastActiveCalls()).toBe(1));

    await advanceWhileActive(LAST_ACTIVE_REFRESH_MS - 10 * MINUTE);
    expect(lastActiveCalls()).toBe(1);

    await advanceWhileActive(10 * MINUTE);
    await waitFor(() => expect(lastActiveCalls()).toBe(2));
  });

  it('makes no requests while the tab is hidden', async () => {
    mockApi();
    renderRoster();
    await waitFor(() => expect(lastActiveCalls()).toBe(1));

    setVisibility('hidden');
    await advanceIdle(2 * LAST_ACTIVE_REFRESH_MS);
    expect(lastActiveCalls()).toBe(1);
  });

  it('stops polling when idle, then refetches once on return if the data is over an hour old', async () => {
    mockApi();
    renderRoster();
    await waitFor(() => expect(lastActiveCalls()).toBe(1));

    // No interaction: idle after 15 minutes, so the hourly tick never fires.
    await advanceIdle(2 * LAST_ACTIVE_REFRESH_MS);
    expect(lastActiveCalls()).toBe(1);

    interact();
    await waitFor(() => expect(lastActiveCalls()).toBe(2));

    // Returning again shortly after does not refetch.
    await advanceIdle(20 * MINUTE);
    interact();
    await advanceIdle(MINUTE);
    expect(lastActiveCalls()).toBe(2);
  });

  it('does not refetch on a quick return when the data is still fresh', async () => {
    mockApi();
    renderRoster();
    await waitFor(() => expect(lastActiveCalls()).toBe(1));

    setVisibility('hidden');
    await advanceIdle(5 * MINUTE);
    setVisibility('visible');
    interact();
    await advanceIdle(MINUTE);
    expect(lastActiveCalls()).toBe(1);
  });
});
