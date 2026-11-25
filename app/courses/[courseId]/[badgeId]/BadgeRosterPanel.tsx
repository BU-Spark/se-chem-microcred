// Issues: #258 multi-word last names
'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';

import SortableHeader from '@/app/components/SortableHeader/SortableHeader';
import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import { buildCsv, csvFilename, downloadCsv } from '@/lib/csv';
import {
  DEFAULT_ROSTER_SORT,
  nextSort,
  sortRosterRows,
  type RosterSort,
  type RosterSortKey,
} from '@/lib/roster/sortRoster';
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
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    externalId: string | null;
  };
  cohort?: RosterCohort;
  stage?: RosterStage;
  locked?: boolean;
  earnedVia?: string | null;
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

// Sort order for the Progress column, from least to furthest along this badge.
const STATUS_RANK: Record<RosterCohort | NonNullable<RosterStage>, number> = {
  NOT_STARTED: 0,
  VIDEO_INCOMPLETE: 1,
  VIDEO_COMPLETE: 2,
  ATTEMPT_FAILED: 3,
  AWAITING_AWARD: 4,
  STILL_LEARNING: 1,
  PROFICIENT: 5,
};

function statusRankOf(row: BadgeRosterRow) {
  const cohort = cohortOf(row);
  return cohort === 'STILL_LEARNING' && row.stage ? STATUS_RANK[row.stage] : STATUS_RANK[cohort];
}

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
  showEarnedVia = false,
  onClose,
}: {
  badgeName: string;
  courseId: string;
  badgeId: string;
  rows: BadgeRosterRow[];
  // True when another badge in the course can earn this one.
  showEarnedVia?: boolean;
  onClose: () => void;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [sort, setSort] = useState<RosterSort>(DEFAULT_ROSTER_SORT);
  const handleSort = useCallback((key: RosterSortKey) => setSort((current) => nextSort(current, key)), []);

  // Same sorting as the course roster (lib/roster/sortRoster). Student sorts by last
  // name, then first, then email; a student with no name sorts under their email,
  // which is what their row shows.
  const sortableRows = useMemo(
    () =>
      rows.map((row) => {
        const { first, last } = resolveName(row.student);
        const email = row.student.email ?? '';
        return {
          row,
          memberId: row.student.id,
          lastName: last || first || email,
          firstName: last ? first : '',
          email,
          externalId: row.student.externalId ?? '',
          sectionLabel: row.sections.join(', '),
          statusRank: statusRankOf(row),
        };
      }),
    [rows]
  );
  const sortedRows = useMemo(() => sortRosterRows(sortableRows, sort).map((entry) => entry.row), [sortableRows, sort]);

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
        ...(showEarnedVia ? { 'Earned Via': row.earnedVia ?? '' } : {}),
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
                  <SortableHeader label="Student" sortKey="lastName" sort={sort} onSort={handleSort} />
                  <SortableHeader label="ID" sortKey="externalId" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Sections" sortKey="section" sort={sort} onSort={handleSort} />
                  <SortableHeader label="Progress" sortKey="status" sort={sort} onSort={handleSort} />
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
