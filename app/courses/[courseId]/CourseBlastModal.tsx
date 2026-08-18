'use client';

import { useState } from 'react';

import Modal from '../../components/Modal';
import styles from './CourseBlastModal.module.css';

// Instructor-typed badge names are never rewritten. Append "Badge" only when the
// name doesn't already end in it, so "Titration" reads "Titration Badge" and
// "Titration Badge" stays as typed instead of becoming "Titration Badge Badge".
function withBadgeSuffix(badgeName: string) {
  const name = badgeName.trim();
  return /\bbadge$/i.test(name) ? name : `${name} Badge`;
}

function reminderBody(courseName: string, displayName: string) {
  return `${courseName} - Students,\n\nReminder that your assessment for ${displayName.toUpperCase()} is due soon. Please finish the lesson and checkpoints before the deadline.\n\nBest,\nProfessor`;
}

function courseBody(courseName: string) {
  return `${courseName} - Students,\n\n\n\nBest,\nProfessor`;
}

/**
 * Sends one message to many students. With a `badge`, the audience is everyone
 * who has not completed it; without one, it is every student in the course.
 * Both post to /api/messages, which re-derives the audience server-side — the
 * modal never sends a recipient list.
 */
export function CourseBlastModal({
  courseId,
  courseName,
  badge,
  onClose,
}: {
  courseId: string;
  courseName: string;
  badge?: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const displayName = badge ? withBadgeSuffix(badge.name) : null;

  const [subject, setSubject] = useState(() =>
    displayName ? `Lesson reminder: ${displayName}` : `A message about ${courseName}`
  );
  const [body, setBody] = useState(() =>
    displayName ? reminderBody(courseName, displayName) : courseBody(courseName)
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<number | null>(null);

  const handleSend = async () => {
    if (isSending) return;
    if (!body.trim()) {
      setError('Message body is required.');
      return;
    }
    setIsSending(true);
    setError('');
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          ...(badge ? { badgeId: badge.id } : { allStudents: true }),
          subject: subject.trim() || undefined,
          body,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to send message.');
      }
      setResult(typeof payload.sent === 'number' ? payload.sent : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const emptyResultText = displayName
    ? 'No students currently have this badge incomplete — nothing was sent.'
    : 'No students are enrolled in this course — nothing was sent.';

  return (
    <Modal
      overlayClassName={styles.overlay}
      className={styles.modal}
      onClose={onClose}
      ariaLabel={displayName ? 'Send a lesson reminder' : 'Message all students'}
    >
      <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close message">
        ×
      </button>

      <div className={styles.header}>
        <div className={styles.headerIcon} aria-hidden="true">
          ↗
        </div>
        <div>
          <h2 className={styles.title}>{displayName ? 'Send lesson reminder' : 'Message all students'}</h2>
          <p className={styles.subtitle}>
            {displayName ? `Students who haven't finished ${displayName}` : `${courseName} – every student`}
          </p>
        </div>
      </div>

      {result === null ? (
        <>
          <label className={styles.fieldLabel} htmlFor="blast-subject">
            Subject
          </label>
          <input
            id="blast-subject"
            className={styles.subjectInput}
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />

          <label className={styles.fieldLabel} htmlFor="blast-body">
            Message
          </label>
          <textarea
            id="blast-body"
            className={styles.bodyInput}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSending}>
              Cancel
            </button>
            <button type="button" className={styles.sendButton} onClick={handleSend} disabled={isSending}>
              {isSending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.resultBlock}>
          <div className={styles.resultIcon} aria-hidden="true">
            ✓
          </div>
          <p className={styles.resultText}>
            {result === 0 ? emptyResultText : `Sent to ${result} student${result === 1 ? '' : 's'}.`}
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
