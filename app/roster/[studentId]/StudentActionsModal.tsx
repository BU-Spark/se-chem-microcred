'use client';

import { useId, useState } from 'react';

import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import shared from './StudentBadgeConfigModal.module.css';
import styles from './StudentActionsModal.module.css';

type ActionView = 'menu' | 'reset' | 'waive' | 'override';

export type StudentActionsBadge = {
  id: string;
  name: string;
  status: string;
  qevWaivedAt: string | null;
};

const TOOLTIPS = {
  reset:
    'Permanently deletes this student’s video-lesson progress, precheck answers, and assessment history for this badge. They start over from scratch. This cannot be undone.',
  waive:
    'Lets this student sit the in-person assessment without finishing the video lesson. Their lesson progress is unchanged and the badge is marked as waived. This cannot be undone except by resetting the badge.',
  override:
    'Records a proficient or still-learning result for this student outside a normal assessment. Requires a written reason and appears in their assessment history as an instructor override.',
};

/**
 * Info affordance describing one action.
 *
 * The description is always in the DOM as a visually hidden node the trigger
 * points at with aria-describedby, so assistive tech announces it with the button
 * and never depends on the bubble being open. The visible bubble opens on hover
 * and on click — deliberately not on focus, because the modal's focus trap moves
 * initial focus to the first focusable element, which is this trigger, and a
 * tooltip would otherwise pop open every time the modal is opened.
 */
function Tooltip({ label, text }: { label: string; text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const descriptionId = useId();

  return (
    <span className={styles.tooltip} onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setIsOpen(false)}>
      <button
        type="button"
        className={styles.tooltipTrigger}
        aria-label={`What does “${label}” do?`}
        aria-describedby={descriptionId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        i
      </button>
      <span id={descriptionId} className={styles.srOnly}>
        {text}
      </span>
      {isOpen ? (
        <span role="tooltip" className={styles.tooltipBubble}>
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function StudentActionsModal({
  studentName,
  courseId,
  studentId,
  email,
  badge,
  attemptCount,
  lessonTitles,
  onClose,
  onCompleted,
}: {
  studentName: string;
  courseId: string;
  studentId: string;
  email: string;
  badge: StudentActionsBadge;
  attemptCount: number;
  lessonTitles: string[];
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [view, setView] = useState<ActionView>('menu');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmName, setConfirmName] = useState('');
  // Populated only when the server finds other badges depending on these lessons.
  // Content is authored one lesson per badge today, so this normally stays empty.
  const [sharedBadges, setSharedBadges] = useState<Array<{ id: string; name: string }>>([]);
  const [acknowledgedShared, setAcknowledgedShared] = useState(false);

  const [overridePassed, setOverridePassed] = useState(true);
  const [overrideReason, setOverrideReason] = useState('');

  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const isWaived = Boolean(badge.qevWaivedAt);
  const qevCleared = badge.status !== 'LEARNING';
  const canWaive = !isWaived && !qevCleared;

  const submit = async (body: Record<string, unknown>) => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}/badges/${encodeURIComponent(badge.id)}?email=${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const payload = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));

      if (!response.ok) {
        // The shared-lesson guard is a 409 carrying the other affected badges;
        // surface them and let the instructor decide rather than failing outright.
        if (response.status === 409 && Array.isArray(payload.sharedBadges) && payload.sharedBadges.length > 0) {
          setSharedBadges(payload.sharedBadges);
          setError(payload.error ?? null);
          return false;
        }

        throw new Error(payload.error ?? 'Unable to complete this action.');
      }

      onCompleted();
      onClose();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete this action.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const returnToMenu = () => {
    setView('menu');
    setError(null);
    setConfirmName('');
    setSharedBadges([]);
    setAcknowledgedShared(false);
    setOverrideReason('');
  };

  const nameMatches = confirmName.trim().toLowerCase() === badge.name.trim().toLowerCase();
  const resetBlocked = sharedBadges.length > 0 && !acknowledgedShared;

  return (
    <div className={shared.overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className={shared.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Student actions for ${studentName} on ${badge.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        {view === 'menu' ? (
          <>
            <h2 className={shared.title}>Student actions: {badge.name}</h2>
            <p className={styles.intro}>
              These apply to {studentName} on this badge only, and take effect immediately.
            </p>

            <div className={styles.actionList}>
              <div className={styles.actionRow}>
                <div>
                  <span className={styles.actionHeading}>
                    <span className={styles.actionName}>Reset badge progress</span>
                    <Tooltip label="Reset badge progress" text={TOOLTIPS.reset} />
                  </span>
                  <p className={styles.actionState}>
                    Deletes {attemptCount} assessment {attemptCount === 1 ? 'attempt' : 'attempts'} and{' '}
                    {lessonTitles.length} {lessonTitles.length === 1 ? 'lesson' : 'lessons'} of progress.
                  </p>
                </div>
                <button
                  type="button"
                  className={[styles.actionButton, styles.actionButtonDanger].join(' ')}
                  onClick={() => setView('reset')}
                >
                  Reset
                </button>
              </div>

              <div className={styles.actionRow}>
                <div>
                  <span className={styles.actionHeading}>
                    <span className={styles.actionName}>Complete the QEV requirement</span>
                    <Tooltip label="Complete the QEV requirement" text={TOOLTIPS.waive} />
                  </span>
                  <p className={styles.actionState}>
                    {isWaived
                      ? 'Already waived by an instructor.'
                      : qevCleared
                        ? 'This student has already cleared the requirement.'
                        : 'Unlocks the in-person assessment without the video lesson.'}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.actionButton}
                  disabled={!canWaive}
                  onClick={() => setView('waive')}
                >
                  Waive
                </button>
              </div>

              <div className={styles.actionRow}>
                <div>
                  <span className={styles.actionHeading}>
                    <span className={styles.actionName}>Overwrite the in-person grade</span>
                    <Tooltip label="Overwrite the in-person grade" text={TOOLTIPS.override} />
                  </span>
                  <p className={styles.actionState}>
                    {qevCleared
                      ? 'Records a result outside a normal assessment.'
                      : 'Unavailable until the QEV requirement is cleared or waived.'}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.actionButton}
                  disabled={!qevCleared}
                  onClick={() => setView('override')}
                >
                  Overwrite
                </button>
              </div>
            </div>

            <div className={shared.actions}>
              <button type="button" className={shared.cancelButton} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : null}

        {view === 'reset' ? (
          <>
            <h2 className={shared.title}>
              Reset {badge.name} for {studentName}?
            </h2>
            <p className={styles.panelBody}>This permanently deletes, with no undo:</p>
            <ul className={styles.impactList}>
              <li>
                {attemptCount} in-person assessment {attemptCount === 1 ? 'attempt' : 'attempts'}, including the
                recorded grades and checker feedback
              </li>
              {lessonTitles.length > 0 ? (
                <li>All video-lesson progress and precheck answers for: {lessonTitles.join(', ')}</li>
              ) : (
                <li>No video-lesson progress — this badge has no requirement lessons</li>
              )}
            </ul>
            <p className={styles.panelBody}>
              Per-student settings such as the reassessment allowance are kept. The badge returns to “still learning”
              and the student earns it back from the beginning.
            </p>

            {sharedBadges.length > 0 ? (
              <div className={styles.warning}>
                <p style={{ margin: 0 }}>
                  These lessons are also required by{' '}
                  <strong>{sharedBadges.map((sharedBadge) => sharedBadge.name).join(', ')}</strong>. Resetting will
                  delete this student’s progress on {sharedBadges.length === 1 ? 'that badge' : 'those badges'} too.
                </p>
                <label style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={acknowledgedShared}
                    onChange={(event) => setAcknowledgedShared(event.target.checked)}
                  />
                  <span>I understand, reset the other badges too</span>
                </label>
              </div>
            ) : null}

            <div className={shared.field}>
              <label className={shared.label} htmlFor="reset-confirm-name">
                Type <strong>{badge.name}</strong> to confirm
              </label>
              <input
                id="reset-confirm-name"
                className={shared.input}
                value={confirmName}
                autoComplete="off"
                onChange={(event) => setConfirmName(event.target.value)}
              />
            </div>

            {error ? <p className={shared.error}>{error}</p> : null}

            <div className={shared.actions}>
              <button type="button" className={shared.cancelButton} onClick={returnToMenu} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={isSaving || !nameMatches || resetBlocked}
                onClick={() =>
                  submit({
                    action: 'RESET_PROGRESS',
                    confirmBadgeName: confirmName.trim(),
                    acknowledgeSharedBadges: acknowledgedShared,
                  })
                }
              >
                {isSaving ? 'Resetting…' : 'Reset progress'}
              </button>
            </div>
          </>
        ) : null}

        {view === 'waive' ? (
          <>
            <h2 className={shared.title}>Waive the QEV requirement?</h2>
            <p className={styles.panelBody}>
              {studentName} will be able to sit the in-person assessment for {badge.name} without finishing the video
              lesson. Their lesson progress is left as it is, and the badge will show as waived by you.
            </p>
            <p className={styles.panelBody}>
              This cannot be undone directly — reversing it means resetting the badge, which deletes all of their
              progress on it.
            </p>

            {error ? <p className={shared.error}>{error}</p> : null}

            <div className={shared.actions}>
              <button type="button" className={shared.cancelButton} onClick={returnToMenu} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className={shared.saveButton}
                disabled={isSaving}
                onClick={() => submit({ action: 'WAIVE_QEV' })}
              >
                {isSaving ? 'Waiving…' : 'Waive requirement'}
              </button>
            </div>
          </>
        ) : null}

        {view === 'override' ? (
          <>
            <h2 className={shared.title}>Overwrite the in-person grade</h2>
            <p className={styles.panelBody}>
              This is recorded in {studentName}’s assessment history as an instructor override, with your name and the
              reason below.
            </p>

            <div className={shared.field}>
              <span className={shared.label}>Result</span>
              <div className={shared.toggleGroup} role="group" aria-label="Assessment result">
                <button
                  type="button"
                  className={[shared.toggleOption, overridePassed ? shared.toggleOptionActive : ''].join(' ')}
                  aria-pressed={overridePassed}
                  onClick={() => setOverridePassed(true)}
                >
                  Proficient
                </button>
                <button
                  type="button"
                  className={[shared.toggleOption, !overridePassed ? shared.toggleOptionActive : ''].join(' ')}
                  aria-pressed={!overridePassed}
                  onClick={() => setOverridePassed(false)}
                >
                  Still learning
                </button>
              </div>
              <p className={shared.hint}>
                {overridePassed
                  ? 'The badge is awarded immediately.'
                  : 'The badge returns to assessable, with any cooldown cleared.'}
              </p>
            </div>

            <div className={shared.field}>
              <label className={shared.label} htmlFor="override-reason">
                Reason
              </label>
              <textarea
                id="override-reason"
                className={shared.textarea}
                value={overrideReason}
                placeholder="e.g. Assessed on paper during open lab on 8/4"
                onChange={(event) => setOverrideReason(event.target.value)}
              />
            </div>

            {error ? <p className={shared.error}>{error}</p> : null}

            <div className={shared.actions}>
              <button type="button" className={shared.cancelButton} onClick={returnToMenu} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className={shared.saveButton}
                disabled={isSaving || overrideReason.trim().length === 0}
                onClick={() =>
                  submit({ action: 'OVERRIDE_GRADE', passed: overridePassed, reason: overrideReason.trim() })
                }
              >
                {isSaving ? 'Recording…' : 'Record result'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
