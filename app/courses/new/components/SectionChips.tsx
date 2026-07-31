'use client';

import styles from './SectionChips.module.css';

type SectionChipsProps = {
  options: string[];
  selected: string[];
  onChange: (sections: string[]) => void;
  /** Who the sections belong to, e.g. "Alex Checker" — used to label the controls. */
  subject: string;
};

// Assessors may cover more than one section (#206), so their sections are toggle
// pills styled like the roster page's section filters — every section on the roster is
// shown, and clicking one turns it on or off. Selection order follows the option order
// so the row reads the same no matter which pill was clicked first.
export default function SectionChips({ options, selected, onChange, subject }: SectionChipsProps) {
  if (options.length === 0) {
    return <span className={styles.placeholder}>No sections</span>;
  }

  const toggleSection = (section: string) => {
    onChange(
      selected.includes(section)
        ? selected.filter((value) => value !== section)
        : options.filter((option) => option === section || selected.includes(option))
    );
  };

  return (
    <div className={styles.chips} role="group" aria-label={`Sections for ${subject}`}>
      {options.map((section) => {
        const isSelected = selected.includes(section);
        return (
          <button
            key={section}
            type="button"
            className={isSelected ? `${styles.chip} ${styles.chipSelected}` : styles.chip}
            aria-pressed={isSelected}
            onClick={() => toggleSection(section)}
          >
            {section}
          </button>
        );
      })}
    </div>
  );
}
