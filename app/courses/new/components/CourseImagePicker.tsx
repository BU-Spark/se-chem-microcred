'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import CourseTileImage from '@/app/_components/CourseTileImage';
import { COURSE_COLORS, ICON_FG_DARK, ICON_FG_LIGHT, iconSearchUrl } from '@/lib/courseImage';
import styles from './CourseImagePicker.module.css';

type CourseImagePickerProps = {
  title: string;
  iconName: string | null;
  iconBgColor: string;
  iconFgColor: string;
  onIconNameChange: (name: string | null) => void;
  onBgColorChange: (color: string) => void;
  onFgColorChange: (color: string) => void;
};

export default function CourseImagePicker({
  title,
  iconName,
  iconBgColor,
  iconFgColor,
  onIconNameChange,
  onBgColorChange,
  onFgColorChange,
}: CourseImagePickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearchError('');
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError('');
    const controller = new AbortController();

    // Debounce keystrokes so we only hit the Iconify API when typing pauses.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(iconSearchUrl(trimmed), { signal: controller.signal });
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data = (await res.json()) as { icons?: string[] };
        setResults(data.icons ?? []);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setSearchError('Could not search icons. Try again.');
        setResults([]);
      } finally {
        // Only clear the spinner if this request wasn't superseded by a newer one
        // (an aborted request's newer effect already set isSearching = true).
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <div className={styles.group}>
          <span className={styles.groupLabel}>Background color</span>
          <div className={styles.swatches}>
            {COURSE_COLORS.map((color) => {
              const selected = color === iconBgColor;
              return (
                <button
                  key={color}
                  type="button"
                  className={`${styles.swatch} ${selected ? styles.swatchSelected : ''}`}
                  style={{ background: color }}
                  aria-label={`Background color ${color}`}
                  aria-pressed={selected}
                  onClick={() => onBgColorChange(color)}
                />
              );
            })}
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Icon color</span>
          <div className={styles.toneToggle}>
            <button
              type="button"
              className={`${styles.toneButton} ${iconFgColor === ICON_FG_LIGHT ? styles.toneSelected : ''}`}
              aria-pressed={iconFgColor === ICON_FG_LIGHT}
              onClick={() => onFgColorChange(ICON_FG_LIGHT)}
            >
              White
            </button>
            <button
              type="button"
              className={`${styles.toneButton} ${iconFgColor === ICON_FG_DARK ? styles.toneSelected : ''}`}
              aria-pressed={iconFgColor === ICON_FG_DARK}
              onClick={() => onFgColorChange(ICON_FG_DARK)}
            >
              Dark
            </button>
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Search icons</span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="e.g. flask, atom, beaker"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isSearching && <p className={styles.statusText}>Searching…</p>}
          {searchError && <p className={styles.errorText}>{searchError}</p>}
          {!isSearching && !searchError && query.trim() && results.length === 0 && (
            <p className={styles.statusText}>No icons found for “{query.trim()}”.</p>
          )}

          <div className={styles.resultsGrid}>
            {results.map((name) => {
              const selected = name === iconName;
              return (
                <button
                  key={name}
                  type="button"
                  className={`${styles.iconButton} ${selected ? styles.iconSelected : ''}`}
                  aria-label={name}
                  aria-pressed={selected}
                  onClick={() => onIconNameChange(name)}
                >
                  <Icon icon={name} width={28} height={28} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.previewColumn}>
        <span className={styles.groupLabel}>Preview</span>
        <div className={styles.previewTile}>
          <CourseTileImage
            iconName={iconName}
            iconBgColor={iconBgColor}
            iconFgColor={iconFgColor}
            title={title || 'Course'}
            fallback={<div className={styles.previewPlaceholder} aria-hidden="true" />}
          />
        </div>
        <p className={styles.previewCaption}>{title || 'Course name'}</p>
      </div>
    </div>
  );
}
