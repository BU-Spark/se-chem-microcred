'use client';

import { useState } from 'react';

import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import styles from './StudentBadgeConfigModal.module.css';

export type StudentBadgeConfig = {
  reassessmentLimit: number | null;
  reassessmentRequired: boolean | null;
};

const REASSESSMENT_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function StudentBadgeConfigModal({
  studentName,
  courseId,
  studentId,
  badgeId,
  email,
  initial,
  onClose,
  onSaved,
}: {
  studentName: string;
  courseId: string;
  studentId: string;
  badgeId: string;
  email: string;
  initial: StudentBadgeConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reassessmentLimit, setReassessmentLimit] = useState<number>(initial.reassessmentLimit ?? 0);
  const [reassessmentRequired, setReassessmentRequired] = useState<boolean>(initial.reassessmentRequired ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const body: {
        reassessmentLimit: number;
        reassessmentRequired: boolean;
      } = { reassessmentLimit, reassessmentRequired };

      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}/badges/${encodeURIComponent(badgeId)}?email=${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const payload = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));
      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save configuration.');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Editing badge configurations for ${studentName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className={styles.title}>Editing badge configurations for: {studentName}</h2>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="reassessment-limit">
            Number of reassessments allowed
          </label>
          <select
            id="reassessment-limit"
            className={styles.select}
            value={reassessmentLimit}
            onChange={(event) => setReassessmentLimit(Number(event.target.value))}
          >
            {REASSESSMENT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Reassessment requirement</span>
          <div className={styles.toggleGroup} role="group" aria-label="Reassessment requirement">
            <button
              type="button"
              className={[styles.toggleOption, !reassessmentRequired ? styles.toggleOptionActive : ''].join(' ')}
              aria-pressed={!reassessmentRequired}
              onClick={() => setReassessmentRequired(false)}
            >
              Optional
            </button>
            <button
              type="button"
              className={[styles.toggleOption, reassessmentRequired ? styles.toggleOptionActive : ''].join(' ')}
              aria-pressed={reassessmentRequired}
              onClick={() => setReassessmentRequired(true)}
            >
              Mandatory
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className={styles.saveButton} onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
