'use client';

import { useState } from 'react';

import styles from './RangeCalendar.module.css';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Build an ISO date string from LOCAL year/month/day to avoid the off-by-one
// that toISOString() introduces in negative-offset timezones.
function toLocalIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIso(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

// Compare YYYY-MM-DD strings lexicographically — valid for ISO dates.
function isBefore(a: string, b: string) {
  return a < b;
}

export default function RangeCalendar({
  availableOn,
  closesOn,
  neverCloses,
  onAvailableOnChange,
  onClosesOnChange,
  onNeverClosesChange,
}: {
  availableOn: string;
  closesOn: string;
  neverCloses: boolean;
  onAvailableOnChange: (value: string) => void;
  onClosesOnChange: (value: string) => void;
  onNeverClosesChange: (value: boolean) => void;
}) {
  const fallback = (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  })();
  const initial = parseIso(availableOn) ?? fallback;

  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const handleSelect = (iso: string) => {
    // No start yet, or both endpoints already set -> begin a new range.
    if (!availableOn || (availableOn && closesOn)) {
      onAvailableOnChange(iso);
      onClosesOnChange('');
      return;
    }

    // Have a start, picking an end.
    if (neverCloses) {
      // End selection is disabled when the badge never closes; just move start.
      onAvailableOnChange(iso);
      return;
    }

    if (isBefore(iso, availableOn)) {
      // Clicked before the start -> reset the start to the earlier date.
      onAvailableOnChange(iso);
      onClosesOnChange('');
      return;
    }

    onClosesOnChange(iso);
  };

  const renderMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = [
      ...Array.from({ length: firstDay }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    return (
      <div className={styles.month} key={`${year}-${month}`}>
        <div className={styles.monthLabel}>
          {MONTH_NAMES[month]} {year}
        </div>
        <div className={styles.grid}>
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className={styles.weekday}>
              {weekday}
            </div>
          ))}
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className={styles.empty} />;
            }

            const iso = toLocalIso(year, month, day);
            const isStart = iso === availableOn;
            const isEnd = iso === closesOn;
            const inRange =
              Boolean(availableOn) && Boolean(closesOn) && !isBefore(iso, availableOn) && !isBefore(closesOn, iso);

            const classNames = [styles.day];
            if (inRange) classNames.push(styles.inRange);
            if (isStart || isEnd) classNames.push(styles.endpoint);

            return (
              <button key={iso} type="button" className={classNames.join(' ')} onClick={() => handleSelect(iso)}>
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const nextMonthDate = new Date(viewYear, viewMonth + 1, 1);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <button type="button" className={styles.navButton} onClick={() => shiftMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <button type="button" className={styles.navButton} onClick={() => shiftMonth(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div className={styles.months}>
        {renderMonth(viewYear, viewMonth)}
        {renderMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth())}
      </div>

      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={neverCloses}
          onChange={(event) => {
            const checked = event.target.checked;
            onNeverClosesChange(checked);
            if (checked) {
              // Clearing the close date keeps state consistent with "never closes".
              onClosesOnChange('');
            }
          }}
        />
        <span>Never closes</span>
      </label>
    </div>
  );
}
