'use client';

import { useState } from 'react';

import Modal from '../../components/Modal';
import styles from './LessonReminderModal.module.css';

function defaultReminderBody(courseName: string, cleanName: string) {
  return `${courseName} - Students,\n\nReminder that your assessment for ${cleanName.toUpperCase()} BADGE is due soon. Please finish the lesson and checkpoints before the deadline.\n\nBest,\nProfessor`;
}

export function LessonReminderModal({
  courseId,
  badgeId,
  badgeName,
  courseName,
  onClose,
}: {
  courseId: string;
  badgeId: string;
  badgeName: string;
  courseName: string;
  onClose: () => void;
}) {
  const cleanName = badgeName.replace(/ Badge$/i, '').trim();

  const [body, setBody] = useState(() => defaultReminderBody(courseName, cleanName));
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<number | null>(null);

  const handleSend = async () => {
    if (isSending) return;
    setIsSending(true);
    setError('');
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/badges/${encodeURIComponent(badgeId)}/reminders`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: `Lesson reminder: ${cleanName} Badge`, body }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to send reminder.');
      }
      setResult(typeof payload.sent === 'number' ? payload.sent : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminder.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      overlayClassName={styles.overlay}
      className={styles.modal}
      onClose={onClose}
      ariaLabel="Send a lesson reminder"
    >
      <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close reminder">
        ×
      </button>

      <h2 className={styles.title}>Send a lesson reminder</h2>
      <p className={styles.subtitle}>
        To: <strong>Students with {cleanName} Badge</strong>
      </p>

      {result === null ? (
        <>
          <p className={styles.fieldLabel}>Automated lesson reminder</p>
          <textarea
            className={styles.bodyInput}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label="Reminder message"
            rows={8}
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.sendButton} onClick={handleSend} disabled={isSending}>
              {isSending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.resultBlock}>
          <p className={styles.resultText}>
            {result === 0
              ? 'No students currently have this badge incomplete — nothing was sent.'
              : `Reminder sent to ${result} student${result === 1 ? '' : 's'} with this badge incomplete.`}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.sendButton} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
