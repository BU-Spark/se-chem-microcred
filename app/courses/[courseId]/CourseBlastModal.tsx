'use client';

import { useState } from 'react';

import type { BadgeMessageGroup } from '@/lib/badgeAnalyticsStatus';
import Modal from '../../components/Modal/Modal';
import styles from './CourseBlastModal.module.css';

// 'ALL' is everyone who hasn't finished the badge (the original reminder); the
// rest narrow to one group from the badge detail page.
type GroupChoice = 'ALL' | BadgeMessageGroup;

const GROUP_OPTIONS: Array<{ value: GroupChoice; label: string }> = [
  { value: 'ALL', label: 'Everyone who hasn’t finished' },
  { value: 'NOT_STARTED', label: 'Haven’t started' },
  { value: 'VIDEO_IN_PROGRESS', label: 'Started the video, haven’t finished' },
  { value: 'READY_TO_ASSESS', label: 'Finished the video, ready to assess' },
];

// Instructor-typed badge names are never rewritten. Append "Badge" only when the
// name doesn't already end in it, so "Titration" reads "Titration Badge" and
// "Titration Badge" stays as typed instead of becoming "Titration Badge Badge".
function withBadgeSuffix(badgeName: string) {
  const name = badgeName.trim();
  return /\bbadge$/i.test(name) ? name : `${name} Badge`;
}

function signed(courseName: string, text: string) {
  return `${courseName} - Students,\n\n${text}\n\nBest,\nProfessor`;
}

function courseBody(courseName: string) {
  return signed(courseName, '');
}

// Default subject/body per group. Sent as typed; the instructor can edit both.
function groupDefaults(group: GroupChoice, courseName: string, displayName: string) {
  const name = displayName.toUpperCase();
  switch (group) {
    case 'NOT_STARTED':
      return {
        subject: `Time to start: ${displayName}`,
        body: signed(
          courseName,
          `You haven't started the lesson for ${name} yet. Please begin the video and checkpoints soon so you have time to finish before the deadline.`
        ),
      };
    case 'VIDEO_IN_PROGRESS':
      return {
        subject: `Keep going: ${displayName}`,
        body: signed(
          courseName,
          `You've started the lesson for ${name} — please finish the video and checkpoints so you're ready for your assessment.`
        ),
      };
    case 'READY_TO_ASSESS':
      return {
        subject: `Ready to assess: ${displayName}`,
        body: signed(
          courseName,
          `You've finished the lesson for ${name} and are ready for your in-person assessment. Please find a checker to get assessed.`
        ),
      };
    default:
      return {
        subject: `Lesson reminder: ${displayName}`,
        body: signed(
          courseName,
          `Reminder that your assessment for ${name} is due soon. Please finish the lesson and checkpoints before the deadline.`
        ),
      };
  }
}

function groupSubtitle(group: GroupChoice, displayName: string) {
  switch (group) {
    case 'NOT_STARTED':
      return `Students who haven't started ${displayName}`;
    case 'VIDEO_IN_PROGRESS':
      return `Students partway through the ${displayName} video`;
    case 'READY_TO_ASSESS':
      return `Students ready to assess for ${displayName}`;
    default:
      return `Students who haven't finished ${displayName}`;
  }
}

function groupEmptyText(group: GroupChoice) {
  switch (group) {
    case 'NOT_STARTED':
      return 'Every student has started this badge — nothing was sent.';
    case 'VIDEO_IN_PROGRESS':
      return 'No students are partway through the video — nothing was sent.';
    case 'READY_TO_ASSESS':
      return 'No students are waiting to be assessed — nothing was sent.';
    default:
      return 'No students currently have this badge incomplete — nothing was sent.';
  }
}

export function CourseBlastModal({
  courseId,
  courseName,
  badge,
  group: initialGroup,
  onClose,
}: {
  courseId: string;
  courseName: string;
  badge?: { id: string; name: string } | null;
  group?: BadgeMessageGroup | null;
  onClose: () => void;
}) {
  const displayName = badge ? withBadgeSuffix(badge.name) : null;

  const [group, setGroup] = useState<GroupChoice>(initialGroup ?? 'ALL');
  const [subject, setSubject] = useState(() =>
    displayName ? groupDefaults(group, courseName, displayName).subject : `A message about ${courseName}`
  );
  const [body, setBody] = useState(() =>
    displayName ? groupDefaults(group, courseName, displayName).body : courseBody(courseName)
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<number | null>(null);

  // Swap in the new group's template, but only for text the sender hasn't
  // touched — switching groups should never throw away a typed message.
  const handleGroupChange = (next: GroupChoice) => {
    if (!displayName) return;
    const previous = groupDefaults(group, courseName, displayName);
    const upcoming = groupDefaults(next, courseName, displayName);
    if (subject === previous.subject) setSubject(upcoming.subject);
    if (body === previous.body) setBody(upcoming.body);
    setGroup(next);
  };

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
          ...(badge ? { badgeId: badge.id, ...(group !== 'ALL' ? { badgeGroup: group } : {}) } : { allStudents: true }),
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
    ? groupEmptyText(group)
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
            {displayName ? groupSubtitle(group, displayName) : `${courseName} – every student`}
          </p>
        </div>
      </div>

      {result === null ? (
        <>
          {displayName ? (
            <>
              <label className={styles.fieldLabel} htmlFor="blast-group">
                Send to
              </label>
              <select
                id="blast-group"
                className={styles.groupSelect}
                value={group}
                onChange={(event) => handleGroupChange(event.target.value as GroupChoice)}
              >
                {GROUP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}

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
