// Issues: #258 multi-word last names
'use client';

import { useMemo } from 'react';
import Link from 'next/link';

import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import { buildCsv, csvFilename, downloadCsv } from '@/lib/csv';
import { resolveName } from '@/lib/text/name';

import styles from './BadgeRosterPanel.module.css';

export type RosterCohort = 'PROFICIENT' | 'STILL_LEARNING' | 'NOT_STARTED';
export type RosterStage = 'VIDEO_INCOMPLETE' | 'VIDEO_COMPLETE' | 'ATTEMPT_FAILED' | 'AWAITING_AWARD' | null;

export type BadgeRosterRow = {
  enrollmentId: string;
  sections: string[];
  student: {
    id: string;
    name: string | null;
    // Issue #258: sorting and the CSV export both need the real surname, which a
    // joined name cannot give up when the surname is more than one word.
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    externalId: string | null;
  };
  cohort?: RosterCohort;
  stage?: RosterStage;
  locked?: boolean;
};

const COHORT_LABEL: Record<RosterCohort, string> = {
  PROFICIENT: 'Proficient',
  STILL_LEARNING: 'Still Learning',
  NOT_STARTED: 'Not Started',
};

const COHORT_TONE: Record<RosterCohort, string> = {
  PROFICIENT: 'proficient',
  STILL_LEARNING: 'learning',
  NOT_STARTED: 'notStarted',
};

const STAGE_LABEL: Record<NonNullable<RosterStage>, string> = {
  VIDEO_INCOMPLETE: 'Video unfinished',
  VIDEO_COMPLETE: 'Video done, not assessed',
  ATTEMPT_FAILED: 'Assessed, not passed',
  AWAITING_AWARD: 'Passed, awaiting award',
};

function cohortOf(row: BadgeRosterRow): RosterCohort {
  return row.cohort ?? 'NOT_STARTED';
}

/** Sub-stage text, plus the locked flag when the student is out of retries. */
function detailOf(row: BadgeRosterRow) {
  const stage = row.stage ? STAGE_LABEL[row.stage] : '';
  if (!stage) return '';

  return row.locked ? `${stage} (no retries left)` : stage;
}

export default function BadgeRosterPanel({
  badgeName,
  courseId,
  badgeId,
  rows,
  onClose,
}: {
  badgeName: string;
  courseId: string;
  badgeId: string;
  rows: BadgeRosterRow[];
  onClose: () => void;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose);

  // Roster order matches the course roster: last name, then first, then email.
  // A student with no name on file sorts under the email shown in their row, so
  // the visible order always reads alphabetically.
  const sortedRows = useMemo(() => {
    const sortKey = (row: BadgeRosterRow) => {
      const { first, last } = resolveName(row.student);
      const email = row.student.email ?? '';

      return last || first ? [last, first, email] : [email, '', email];
    };

    return [...rows].sort((a, b) => {
      const left = sortKey(a);
      const right = sortKey(b);

      return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]) || left[2].localeCompare(right[2]);
    });
  }, [rows]);

  const handleExport = () => {
    const csvRows = sortedRows.map((row) => {
      const { first, last } = resolveName(row.student);

      return {
        'First Name': first,
        'Last Name': last,
        ID: row.student.externalId ?? '',
        Email: row.student.email ?? '',
        Sections: row.sections.join(' '),
        Progress: COHORT_LABEL[cohortOf(row)],
        Detail: detailOf(row),
      };
    });

    if (csvRows.length === 0) return;

    downloadCsv(buildCsv(csvRows), csvFilename(badgeName));
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Roster for ${badgeName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Roster</p>
            <h2 className={styles.title}>{badgeName}</h2>
            <p className={styles.subtitle}>
              {sortedRows.length} student{sortedRows.length === 1 ? '' : 's'} · progress on this badge only
            </p>
          </div>
          <div className={styles.headActions}>
            <button type="button" className={styles.exportButton} onClick={handleExport} disabled={rows.length === 0}>
              Export CSV
            </button>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close roster">
              ×
            </button>
          </div>
        </header>

        <div className={styles.tableScroll}>
          {sortedRows.length === 0 ? (
            <p className={styles.empty}>No students are enrolled in this course yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">ID</th>
                  <th scope="col">Sections</th>
                  <th scope="col">Progress</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const cohort = cohortOf(row);
                  const detail = detailOf(row);

                  return (
                    <tr key={row.enrollmentId}>
                      <td>
                        <Link
                          className={styles.studentLink}
                          href={`/roster/${encodeURIComponent(row.student.id)}?courseId=${encodeURIComponent(
                            courseId
                          )}&badgeId=${encodeURIComponent(badgeId)}`}
                        >
                          {row.student.name?.trim() || row.student.email || 'Unnamed student'}
                        </Link>
                        {row.student.email ? <span className={styles.studentEmail}>{row.student.email}</span> : null}
                      </td>
                      <td className={styles.mono}>{row.student.externalId ?? '—'}</td>
                      <td>{row.sections.length > 0 ? row.sections.join(', ') : '—'}</td>
                      <td>
                        <span className={styles.pill} data-tone={COHORT_TONE[cohort]}>
                          {COHORT_LABEL[cohort]}
                        </span>
                        {detail ? <span className={styles.pillDetail}>{detail}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
