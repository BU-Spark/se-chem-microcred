'use client';

import styles from './Slider.module.css';

export default function Slider({
  min = 0,
  max = 14,
  value,
  onChange,
  disabled = false,
  ariaLabel = 'Slider',
  formatValue = (current) => `${current} day${current === 1 ? '' : 's'}`,
}: {
  min?: number;
  max?: number;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
  formatValue?: (current: number) => string;
}) {
  // Clamp so an out-of-range value (e.g. from stale data) can't escape the track.
  const clamped = Math.min(max, Math.max(min, value));

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <input
          className={styles.range}
          type="range"
          min={min}
          max={max}
          value={clamped}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className={styles.value}>{formatValue(clamped)}</span>
      </div>
      <div className={styles.ticks}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
