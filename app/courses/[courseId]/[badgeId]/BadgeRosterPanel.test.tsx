import { fireEvent, render, screen, within } from '@testing-library/react';

import BadgeRosterPanel, { type BadgeRosterRow } from './BadgeRosterPanel';

const mockBuildCsv = jest.fn((rows: Record<string, string>[]) => `csv-content:${rows.length}`);
const mockDownloadCsv = jest.fn();

jest.mock('@/lib/csv', () => ({
  buildCsv: (rows: Record<string, string>[]) => mockBuildCsv(rows),
  downloadCsv: (content: string, filename: string) => mockDownloadCsv(content, filename),
  csvFilename: (name: string) => `${name}_2026-08-06_09-00-00.csv`,
}));

const rows: BadgeRosterRow[] = [
  {
    enrollmentId: 'enrollment-2',
    sections: ['B'],
    student: { id: 'student-2', name: 'Ada Zimmer', email: 'ada@bu.edu', externalId: 'U2' },
    cohort: 'STILL_LEARNING',
    stage: 'ATTEMPT_FAILED',
    locked: true,
  },
  {
    enrollmentId: 'enrollment-1',
    sections: ['A', 'C'],
    student: { id: 'student-1', name: 'Bea Adams', email: 'bea@bu.edu', externalId: 'U1' },
    cohort: 'PROFICIENT',
    stage: null,
  },
  {
    enrollmentId: 'enrollment-3',
    sections: [],
    student: { id: 'student-3', name: null, email: 'carl@bu.edu', externalId: null },
    cohort: 'NOT_STARTED',
    stage: null,
  },
];

function renderPanel(onClose = jest.fn()) {
  render(
    <BadgeRosterPanel
      badgeName="Waste Handling Badge"
      courseId="course-1"
      badgeId="badge-1"
      rows={rows}
      onClose={onClose}
    />
  );

  return onClose;
}

describe('BadgeRosterPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists every student with their progress on this badge, sorted by last name', () => {
    renderPanel();

    expect(screen.getByRole('dialog', { name: 'Roster for Waste Handling Badge' })).toBeInTheDocument();
    expect(screen.getByText('3 students · progress on this badge only')).toBeInTheDocument();

    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(3);
    // Adams, then Zimmer; the unnamed student sorts on their email fallback.
    expect(within(bodyRows[0]).getByRole('link')).toHaveTextContent('Bea Adams');
    expect(within(bodyRows[0]).getByText('Proficient')).toBeInTheDocument();
    expect(within(bodyRows[0]).getByText('A, C')).toBeInTheDocument();

    expect(within(bodyRows[2]).getByRole('link')).toHaveTextContent('Ada Zimmer');
    expect(within(bodyRows[2]).getByText('Still Learning')).toBeInTheDocument();
    // Locked students still count as "assessed, not passed" but say so.
    expect(within(bodyRows[2]).getByText('Assessed, not passed (no retries left)')).toBeInTheDocument();

    expect(within(bodyRows[1]).getByRole('link')).toHaveTextContent('carl@bu.edu');
    expect(within(bodyRows[1]).getByText('Not Started')).toBeInTheDocument();
  });

  it('links each student to their profile scoped to this course and badge', () => {
    renderPanel();

    expect(screen.getByRole('link', { name: /Bea Adams/ })).toHaveAttribute(
      'href',
      '/roster/student-1?courseId=course-1&badgeId=badge-1'
    );
  });

  it('exports only this badge’s roster, one row per student', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(mockBuildCsv).toHaveBeenCalledWith([
      {
        'First Name': 'Bea',
        'Last Name': 'Adams',
        ID: 'U1',
        Email: 'bea@bu.edu',
        Sections: 'A C',
        Progress: 'Proficient',
        Detail: '',
      },
      {
        'First Name': '',
        'Last Name': '',
        ID: '',
        Email: 'carl@bu.edu',
        Sections: '',
        Progress: 'Not Started',
        Detail: '',
      },
      {
        'First Name': 'Ada',
        'Last Name': 'Zimmer',
        ID: 'U2',
        Email: 'ada@bu.edu',
        Sections: 'B',
        Progress: 'Still Learning',
        Detail: 'Assessed, not passed (no retries left)',
      },
    ]);
    expect(mockDownloadCsv).toHaveBeenCalledWith('csv-content:3', 'Waste Handling Badge_2026-08-06_09-00-00.csv');
  });

  it('closes from the close button', () => {
    const onClose = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Close roster' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty state and disables export when nobody is enrolled', () => {
    render(
      <BadgeRosterPanel
        badgeName="Waste Handling Badge"
        courseId="course-1"
        badgeId="badge-1"
        rows={[]}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('No students are enrolled in this course yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });
});
