'use client';

import { useState } from 'react';

import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import styles from './StudentBadgeConfigModal.module.css';
import {
  DELIVERY_OPTIONS,
  EMAIL_NOT_CONFIGURED_TEXT,
  readSendResult,
  type DeliveryChannel,
} from '@/app/components/Messaging/deliveryChannel';

// A compose form for an instructor/checker to message a single student. Posts
// to /api/messages, which authorizes the sender against the course.
export function MessageComposeModal({
  studentName,
  courseId,
  studentId,
  onClose,
  onSent,
}: {
  studentName: string;
  courseId: string;
  studentId: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<DeliveryChannel>('IN_APP');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const handleSend = async () => {
    if (!body.trim()) {
      setError('Message body is required.');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, recipientId: studentId, subject: subject.trim() || undefined, body, channel }),
      });

      const payload = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));
      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to send message.');
      }

      // The message is saved either way; keep the modal open so the sender
      // knows the email half did not go out.
      const result = readSendResult(payload);
      if (channel !== 'IN_APP' && result.emailed === 0) {
        onSent?.();
        setError(
          result.emailNotConfigured > 0
            ? `Message saved. ${EMAIL_NOT_CONFIGURED_TEXT}`
            : result.emailSkipped > 0
              ? 'Message saved, but this student has no email address on file.'
              : 'Message saved, but the email could not be sent.'
        );
        return;
      }

      onSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Message ${studentName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className={styles.title}>Message {studentName}</h2>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="message-channel">
            Deliver via
          </label>
          <select
            id="message-channel"
            className={styles.input}
            value={channel}
            onChange={(event) => setChannel(event.target.value as DeliveryChannel)}
          >
            {DELIVERY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="message-subject">
            Subject
          </label>
          <input
            id="message-subject"
            className={styles.input}
            type="text"
            value={subject}
            placeholder="Message from your instructor"
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="message-body">
            Message
          </label>
          <textarea
            id="message-body"
            className={styles.textarea}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSending}>
            Cancel
          </button>
          <button type="button" className={styles.saveButton} onClick={handleSend} disabled={isSending}>
            {isSending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
