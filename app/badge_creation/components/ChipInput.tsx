'use client';

import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import styles from './ChipInput.module.css';

export default function ChipInput({
  value,
  onChange,
  max = 5,
  placeholder = 'Type a skill and press Enter',
  ariaLabel = 'Add skill',
  counterLabel = (count, limit) => `${count}/${limit} skills added`,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  placeholder?: string;
  ariaLabel?: string;
  counterLabel?: (count: number, max: number) => string;
}) {
  const [pending, setPending] = useState('');

  const atMax = value.length >= max;

  const commit = () => {
    const trimmed = pending.trim();
    if (!trimmed) return;
    if (atMax) return;
    // Case-insensitive de-dupe so "Safety" and "safety" don't both appear.
    const exists = value.some((chip) => chip.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      onChange([...value, trimmed]);
    }
    setPending('');
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Backspace' && !pending && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.field}>
        {value.map((chip, index) => (
          <span key={`${chip}-${index}`} className={styles.chip}>
            {chip}
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => removeAt(index)}
              aria-label={`Remove ${chip}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className={styles.input}
          value={pending}
          onChange={(event) => setPending(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          placeholder={atMax ? '' : placeholder}
          aria-label={ariaLabel}
          disabled={atMax}
        />
      </div>
      <span className={styles.counter}>{counterLabel(value.length, max)}</span>
    </div>
  );
}
