'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { formatPassportDate } from '@/lib/students/passport';
import styles from './page.module.css';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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

// Built from LOCAL fields. `toISOString()` would shift the day back for anyone
// behind UTC, which is the classic off-by-one in date pickers.
function toLocalIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function todayIso() {
  const now = new Date();
  return toLocalIso(now.getFullYear(), now.getMonth(), now.getDate());
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M10 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function EarnedBeforePicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const maxIso = todayIso();
  const selected = parseIso(value);

  // The month on screen. Opens on the selected date, else the current month.
  const [view, setView] = useState(() => {
    const start = selected ?? parseIso(maxIso);
    return { year: start?.year ?? new Date().getFullYear(), month: start?.month ?? new Date().getMonth() };
  });

  // Re-centre when the value is set from outside (e.g. "Clear filters").
  useEffect(() => {
    if (!isOpen || !selected) return;
    setView({ year: selected.year, month: selected.month });
    // Only when the popover opens: re-centring on every render would fight the
    // user's own month navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (event.target instanceof Node && containerRef.current.contains(event.target)) return;
      setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const grid = useMemo(() => {
    const firstWeekday = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const cells: Array<number | null> = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    return cells;
  }, [view]);

  const shiftMonth = (delta: number) => {
    const next = new Date(view.year, view.month + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };

  const select = (day: number) => {
    onChange(toLocalIso(view.year, view.month, day));
    setIsOpen(false);
  };

  return (
    <div className={styles.datePickerWrap} ref={containerRef}>
      <button
        type="button"
        className={[styles.filterControl, value ? styles.filterControlActive : ''].filter(Boolean).join(' ')}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className={styles.filterControlLabel}>Earned on or before</span>
        <span className={styles.filterControlValue}>{(value && formatPassportDate(value)) || 'Any date'}</span>
      </button>

      {isOpen ? (
        <div className={styles.calendarPopover} role="dialog" aria-label="Choose a date">
          <div className={styles.calendarHeader}>
            <button
              type="button"
              className={styles.calendarNav}
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft />
            </button>
            <span className={styles.calendarMonth} aria-live="polite">
              {MONTH_NAMES[view.month]} {view.year}
            </span>
            <button type="button" className={styles.calendarNav} onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight />
            </button>
          </div>

          <div className={styles.calendarWeekdays} aria-hidden="true">
            {WEEKDAYS.map((weekday, index) => (
              <span key={`${weekday}-${index}`}>{weekday}</span>
            ))}
          </div>

          <div className={styles.calendarGrid}>
            {grid.map((day, index) => {
              if (day === null) return <span key={`pad-${index}`} />;

              const iso = toLocalIso(view.year, view.month, day);
              const isSelected = iso === value;
              // ISO strings compare correctly as plain strings.
              const isDisabled = iso > maxIso;

              return (
                <button
                  key={iso}
                  type="button"
                  className={[styles.calendarDay, isSelected ? styles.calendarDaySelected : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => select(day)}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className={styles.calendarFooter}>
            <button
              type="button"
              className={styles.detailLink}
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              disabled={!value}
            >
              Any date
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
